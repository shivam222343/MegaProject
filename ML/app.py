from flask import Flask, request, jsonify, render_template_string, Response, stream_with_context
from flask_cors import CORS
import os
import werkzeug
import json
import fitz  # PyMuPDF
import re
import time

app = Flask(__name__)
CORS(app) 

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER


# ─────────────────────────────────────────────────────────────────────────────
# CUTOFF EXTRACTOR (existing)
# ─────────────────────────────────────────────────────────────────────────────
def extract_college_cutoff_data(pdf_path):
    doc = fitz.open(pdf_path)
    colleges_dict = {}
    current_college = None
    current_branch = None
    
    for page_num in range(doc.page_count):
        page = doc[page_num]
        blocks = page.get_text("blocks")
        blocks.sort(key=lambda b: (b[1], b[0]))
        
        i = 0
        while i < len(blocks):
            text = blocks[i][4].strip()
            
            first_line = text.split('\n')[0].strip()
            m_coll = re.match(r'^(\d{4,5})\s*-\s*(.+)$', first_line)
            if m_coll:
                dte_code = m_coll.group(1).strip()
                if dte_code not in colleges_dict:
                    colleges_dict[dte_code] = {
                        "college": m_coll.group(2).strip(),
                        "DTE code": dte_code,
                        "branches": []
                    }
                current_college = colleges_dict[dte_code]
                i += 1
                continue
                
            m_branch = re.match(r'^([A-Z0-9]{9,12})\s*-\s*(.+)$', first_line)
            if m_branch:
                if current_college:
                    branch_code = m_branch.group(1).strip()
                    branch_name = m_branch.group(2).strip()
                    existing_branch = next((b for b in current_college["branches"] if b.get("_code") == branch_code), None)
                    if existing_branch:
                        current_branch = existing_branch
                    else:
                        current_branch = {
                            "_code": branch_code,
                            "branchName": branch_name,
                            "cutoffData": []
                        }
                        current_college["branches"].append(current_branch)
                i += 1
                continue

            if text == 'Stage' and i > 0 and i + 1 < len(blocks):
                data_block = blocks[i+1][4].strip()
                if data_block.startswith('I\n') or data_block.startswith('II\n') or data_block.startswith('III\n'):
                    raw_parts = []
                    for j in range(i-1, max(-1, i-6), -1):
                        b_text = blocks[j][4].strip()
                        if "Level" in b_text or "Status" in b_text or "University" in b_text or re.match(r'^[A-Z0-9]{9,12}\s*-', b_text.split('\n')[0]):
                            break
                        raw_parts = b_text.split('\n') + raw_parts
                        
                    categories = []
                    for part in raw_parts:
                        part = part.strip()
                        if not part: continue
                        if len(part) <= 1 and categories:
                            categories[-1] += part
                        else:
                            categories.append(part)
                    
                    data_vals = data_block.split('\n')[1:]
                    
                    if current_branch:
                        for c_idx, cat in enumerate(categories):
                            if c_idx * 2 + 1 < len(data_vals):
                                rank_str = data_vals[c_idx * 2]
                                perc_str = data_vals[c_idx * 2 + 1]
                                rank = re.sub(r'\D', '', rank_str)
                                perc = re.search(r'\(([\d\.]{1,15})\)', perc_str)
                                if rank and perc:
                                    clean_cat = cat
                                    if "OPEN" in cat: clean_cat = "OPEN"
                                    elif "SC" in cat: clean_cat = "SC"
                                    elif "ST" in cat: clean_cat = "ST"
                                    elif "VJ" in cat: clean_cat = "VJ"
                                    elif "NT1" in cat: clean_cat = "NT1"
                                    elif "NT2" in cat: clean_cat = "NT2"
                                    elif "NT3" in cat: clean_cat = "NT3"
                                    elif "OBC" in cat: clean_cat = "OBC"
                                    elif "SEBC" in cat: clean_cat = "SEBC"
                                    elif "EWS" in cat: clean_cat = "EWS"
                                    elif "TFWS" in cat: clean_cat = "TFWS"
                                    elif "ORPHAN" in cat: clean_cat = "ORPHAN"
                                    elif "MI" in cat: clean_cat = "Minority"
                                    elif cat == "AI": clean_cat = "All India"
                                    
                                    if cat.startswith('L') and clean_cat not in ["TFWS", "EWS", "All India", "Minority"] and "DEF" not in clean_cat and "PWD" not in clean_cat and 'Female' not in clean_cat:
                                        clean_cat += " Female"
                                    if cat.startswith('DEF') and "DEFENCE" not in clean_cat:
                                        clean_cat = "DEFENCE " + clean_cat
                                    if cat.startswith('PWD') and "PWD" not in clean_cat:
                                        clean_cat = "PWD " + clean_cat
                                        
                                    current_branch["cutoffData"].append({
                                        "category": clean_cat,
                                        "percentile": float(perc.group(1)),
                                        "rank": int(rank),
                                        "seatType": cat
                                    })
                    i += 1
            i += 1
            
    final_colleges = list(colleges_dict.values())
    for coll in final_colleges:
        for b in coll["branches"]:
            if "_code" in b:
                del b["_code"]
                
    return final_colleges


# ─────────────────────────────────────────────────────────────────────────────
# SEAT MATRIX EXTRACTOR (NEW)
# Parses the MHT-CET Seat Matrix PDF which shows vacancy status per branch
# PDF structure per college:
#   Header: "01002 - Government College of Engineering, Amravati"
#   Sub-header: "Government Autonomous" + "Vacant CAP Seats:4"
#   Table columns: Choice Code | Course Name | SI | MS Seats | Minority Seats | All India | Institute Seats | OrphanI | OrphanN
#   Category rows (General/Ladies): OPEN(G,L) | SC(G,L) | ST(G,L) | VJ/DT(G,L) | NTB(G,L) | NTC(G,L) | NTD(G,L) | OBC(G,L) | SEBC(G,L) | Total(G+L)
#   Sub-rows: State Level, PWD, DEF
#   Common reserved lines: "PWD Common Reserved Seats: N" | "DEF Common Reserved Seats: N"
#   Footer: "Economically Weaker Section (EWS) Seats: N" | "Tution Fee Waiver Scheme Choice Code: XXXXXXT Seats: N"
# ─────────────────────────────────────────────────────────────────────────────

CATEGORIES = ['OPEN', 'SC', 'ST', 'VJ/DT', 'NTB', 'NTC', 'NTD', 'OBC', 'SEBC']
SUBTYPES = ['State Level', 'PWD', 'DEF']

def safe_int(val):
    """Convert value to int safely, returning 0 for blanks/dashes."""
    if val is None:
        return 0
    s = str(val).strip().replace('-', '').replace('–', '')
    if not s:
        return 0
    try:
        return int(float(s))
    except:
        return 0


def extract_seat_matrix_data(pdf_path, progress_callback=None):
    """
    Extract seat matrix data from a MHT-CET vacancy PDF.
    Returns a list of college dicts with branch-level seat data.
    """
    doc = fitz.open(pdf_path)
    total_pages = doc.page_count
    colleges_dict = {}  # dteCode -> college data

    current_college = None
    current_branch = None

    for page_num in range(total_pages):
        if progress_callback:
            progress_callback({
                "type": "page",
                "message": f"Processing page {page_num + 1}/{total_pages}...",
                "page": page_num + 1,
                "total_pages": total_pages
            })

        page = doc[page_num]
        # Use dict mode for structured word-position info
        page_text = page.get_text("text")
        lines = [l.strip() for l in page_text.split('\n') if l.strip()]

        i = 0
        while i < len(lines):
            line = lines[i]

            # ── College header: "01002 - Government College of Engineering, Amravati"
            m_college = re.match(r'^(\d{4,5})\s*[-–]\s*(.+)$', line)
            if m_college:
                dte = m_college.group(1).strip()
                name = m_college.group(2).strip()
                if dte not in colleges_dict:
                    colleges_dict[dte] = {
                        "dteCode": dte,
                        "collegeName": name,
                        "branches": []
                    }
                current_college = colleges_dict[dte]
                current_branch = None
                i += 1
                continue

            # ── Vacant CAP Seats in current branch header
            m_vacant = re.search(r'Vacant\s+CAP\s+Seats\s*[:\s]\s*(\d+)', line, re.IGNORECASE)
            if m_vacant and current_branch:
                current_branch['vacantCAPSeats'] = int(m_vacant.group(1))
                i += 1
                continue

            # ── Branch row: Choice Code (9-12 alphanums) followed by course name and seat counts
            # Typical line: "0100219110   Civil Engineering   60   4   0   0   0   1   0"
            m_branch_row = re.match(r'^([A-Z0-9]{9,12})\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$', line)
            if m_branch_row and current_college:
                choice_code = m_branch_row.group(1)
                branch_name = m_branch_row.group(2).strip()
                total_si = safe_int(m_branch_row.group(3))
                ms_seats = safe_int(m_branch_row.group(4))
                minority = safe_int(m_branch_row.group(5))
                all_india = safe_int(m_branch_row.group(6))
                institute = safe_int(m_branch_row.group(7))
                orphan_i = safe_int(m_branch_row.group(8))
                orphan_n = safe_int(m_branch_row.group(9))

                # Check if this branch already exists (could span pages)
                existing = next((b for b in current_college['branches'] if b['choiceCode'] == choice_code), None)
                if existing:
                    current_branch = existing
                else:
                    current_branch = {
                        "choiceCode": choice_code,
                        "branch": branch_name,
                        "totalSeats": total_si,
                        "msSeats": ms_seats,
                        "minoritySeats": minority,
                        "allIndiaSeats": all_india,
                        "instituteSeats": institute,
                        "orphanI": orphan_i,
                        "orphanN": orphan_n,
                        "vacantCAPSeats": 0,
                        "categorySeats": [],
                        "pwdCommonReserved": 0,
                        "defCommonReserved": 0,
                        "ewsSeats": 0,
                        "tfwsChoiceCode": None,
                        "tfwsSeats": 0
                    }
                    current_college['branches'].append(current_branch)
                i += 1
                continue

            # ── State Level / PWD / DEF data rows
            # Format: "State Level   1   1   0   0   0   1   0   0   0   0   0   0   0   0   0   0   0   0   3"
            # Numbers: OPEN-G, OPEN-L, SC-G, SC-L, ST-G, ST-L, VJ/DT-G, VJ/DT-L, NTB-G, NTB-L, NTC-G, NTC-L, NTD-G, NTD-L, OBC-G, OBC-L, SEBC-G, SEBC-L, Total
            for subtype in SUBTYPES:
                m_row = re.match(rf'^{re.escape(subtype)}\s+([\d\s]+)$', line, re.IGNORECASE)
                if m_row and current_branch:
                    nums_str = m_row.group(1).strip()
                    nums = [safe_int(n) for n in nums_str.split()]
                    # Map to categories: each cat has G then L
                    for cat_idx, cat in enumerate(CATEGORIES):
                        g_idx = cat_idx * 2
                        l_idx = cat_idx * 2 + 1
                        g_val = nums[g_idx] if g_idx < len(nums) else 0
                        l_val = nums[l_idx] if l_idx < len(nums) else 0
                        if g_val > 0:
                            current_branch['categorySeats'].append({
                                "category": cat,
                                "gender": "G",
                                "subType": subtype,
                                "seats": g_val
                            })
                        if l_val > 0:
                            current_branch['categorySeats'].append({
                                "category": cat,
                                "gender": "L",
                                "subType": subtype,
                                "seats": l_val
                            })
                    break

            # ── PWD Common Reserved Seats: N
            m_pwd_common = re.search(r'PWD\s+Common\s+Reserved\s+Seats\s*[:\s]\s*(\d+)', line, re.IGNORECASE)
            if m_pwd_common and current_branch:
                current_branch['pwdCommonReserved'] = int(m_pwd_common.group(1))
                i += 1
                continue

            # ── DEF Common Reserved Seats: N
            m_def_common = re.search(r'DEF\s+Common\s+Reserved\s+Seats\s*[:\s]\s*(\d+)', line, re.IGNORECASE)
            if m_def_common and current_branch:
                current_branch['defCommonReserved'] = int(m_def_common.group(1))
                i += 1
                continue

            # ── EWS Seats footer
            m_ews = re.search(r'Economically\s+Weaker\s+Section.*?Seats\s*[:\s]\s*(\d+)', line, re.IGNORECASE)
            if m_ews and current_branch:
                current_branch['ewsSeats'] = int(m_ews.group(1))

            # ── TFWS footer: "Tution Fee Waiver Scheme Choice Code: 0100219111T Seats: 0"
            m_tfws = re.search(r'Tution\s+Fee\s+Waiver\s+Scheme\s+Choice\s+Code\s*[:\s]\s*([A-Z0-9]+)\s+Seats\s*[:\s]\s*(\d+)', line, re.IGNORECASE)
            if m_tfws and current_branch:
                current_branch['tfwsChoiceCode'] = m_tfws.group(1)
                current_branch['tfwsSeats'] = int(m_tfws.group(2))

            i += 1

    if progress_callback:
        progress_callback({
            "type": "done",
            "message": f"Extraction complete. Found {len(colleges_dict)} college(s).",
            "college_count": len(colleges_dict)
        })

    return list(colleges_dict.values())


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES — CUTOFF
# ─────────────────────────────────────────────────────────────────────────────

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MHT-CET ML Data Extractor</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; color: #333; margin: 0; padding: 20px; }
        .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; text-align: center; }
        .upload-area { margin: 30px 0; padding: 40px; border: 2px dashed #3498db; border-radius: 8px; text-align: center; background: #f8fbff; cursor: pointer; transition: all 0.3s ease; }
        .upload-area:hover { background: #eef5ff; border-color: #2980b9; }
        .btn { background: #3498db; color: white; border: none; padding: 12px 24px; font-size: 16px; border-radius: 5px; cursor: pointer; transition: 0.2s; }
        .btn:hover { background: #2980b9; }
        .btn:disabled { background: #95a5a6; cursor: not-allowed; }
        .college-block { margin-top: 30px; background: #2c3e50; border-radius: 8px; overflow: hidden; }
        .college-header { background: #1a252f; color: white; padding: 12px 20px; font-size: 16px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
        .copy-btn { background: #2ecc71; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
        pre { margin: 0; padding: 20px; color: #ecf0f1; overflow-x: auto; font-size: 14px; }
        .loader { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 20px auto; display: none; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .tabs { display: flex; gap: 10px; margin: 20px 0; }
        .tab { padding: 10px 20px; border: 2px solid #3498db; border-radius: 5px; cursor: pointer; background: white; color: #3498db; font-size: 14px; }
        .tab.active { background: #3498db; color: white; }
    </style>
</head>
<body>
    <div class="container">
        <h1>MHT-CET ML Data Extractor</h1>
        <div class="tabs">
            <button class="tab active" onclick="showTab('cutoff')">Cutoff PDF</button>
            <button class="tab" onclick="showTab('seatmatrix')">Seat Matrix PDF</button>
        </div>

        <div id="cutoff-section">
            <p style="text-align:center; color:#7f8c8d;">Upload MHT-CET Cutoff PDF to extract branch constraints and rankings</p>
            <div class="upload-area" onclick="document.getElementById('cutoffFile').click()">
                <h3>Click to select Cutoff PDF</h3>
                <p id="cutoffFileName" style="color: #e74c3c;">No file selected</p>
                <input type="file" id="cutoffFile" accept=".pdf" style="display:none;" onchange="document.getElementById('cutoffFileName').textContent=this.files[0]?.name||'No file'; document.getElementById('cutoffFileName').style.color='#27ae60'">
            </div>
            <div style="text-align:center;">
                <button class="btn" onclick="uploadPDF('cutoff')">Extract Cutoff Data</button>
            </div>
        </div>

        <div id="seatmatrix-section" style="display:none;">
            <p style="text-align:center; color:#7f8c8d;">Upload MHT-CET Seat Matrix PDF to extract vacancy status per college/branch</p>
            <div class="upload-area" onclick="document.getElementById('seatFile').click()">
                <h3>Click to select Seat Matrix PDF</h3>
                <p id="seatFileName" style="color: #e74c3c;">No file selected</p>
                <input type="file" id="seatFile" accept=".pdf" style="display:none;" onchange="document.getElementById('seatFileName').textContent=this.files[0]?.name||'No file'; document.getElementById('seatFileName').style.color='#27ae60'">
            </div>
            <div style="text-align:center;">
                <button class="btn" onclick="uploadPDF('seatmatrix')">Extract Seat Matrix</button>
            </div>
        </div>

        <div class="loader" id="loader"></div>
        <div id="searchContainer" style="display:none; margin:20px 0; text-align:center;">
            <input type="text" id="searchInput" placeholder="Search by DTE or college name..." style="padding:10px;width:100%;max-width:600px;border-radius:6px;border:1px solid #bdc3c7;font-size:15px;" oninput="filterColleges()">
        </div>
        <div id="results"></div>
    </div>

<script>
    function showTab(tab) {
        document.getElementById('cutoff-section').style.display = tab==='cutoff'?'':'none';
        document.getElementById('seatmatrix-section').style.display = tab==='seatmatrix'?'':'none';
        document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',i===(tab==='cutoff'?0:1)));
    }

    async function uploadPDF(mode) {
        const fileInput = document.getElementById(mode==='cutoff'?'cutoffFile':'seatFile');
        if (!fileInput.files.length) { alert('Please select a PDF file!'); return; }
        const endpoint = mode==='cutoff' ? '/api/extract-pdf' : '/api/extract-seat-matrix';
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        const loader = document.getElementById('loader');
        const resultsDiv = document.getElementById('results');
        loader.style.display='block'; resultsDiv.innerHTML='';
        document.getElementById('searchContainer').style.display='none';
        try {
            const resp = await fetch(endpoint, {method:'POST', body:formData});
            const data = await resp.json();
            if (data.success) { renderResults(data.data); }
            else { alert('Error: '+data.error); }
        } catch(e) { alert('Request failed: '+e.message); }
        finally { loader.style.display='none'; }
    }

    function renderResults(colleges) {
        const div = document.getElementById('results');
        if (!colleges.length) { div.innerHTML='<p style="text-align:center;color:#e74c3c;">No data extracted.</p>'; return; }
        document.getElementById('searchContainer').style.display='block';
        colleges.forEach((c,idx) => {
            const block = document.createElement('div');
            block.className='college-block';
            const json = JSON.stringify(c, null, 2);
            const label = c.dteCode || c['DTE code'] || idx;
            const name = (c.collegeName || c.college || '').substring(0,50);
            block.innerHTML=`<div class="college-header"><span>${label} - ${name}</span><button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('code-${idx}').textContent)">Copy JSON</button></div><pre><code id="code-${idx}">${json}</code></pre>`;
            div.appendChild(block);
        });
    }

    function filterColleges() {
        const filter = document.getElementById('searchInput').value.toLowerCase();
        document.querySelectorAll('.college-block').forEach(b => {
            const h = b.querySelector('.college-header');
            b.style.display = h && h.textContent.toLowerCase().includes(filter) ? '' : 'none';
        });
    }
</script>
</body>
</html>
"""

@app.route('/', methods=['GET'])
def index():
    return render_template_string(HTML_TEMPLATE)


@app.route('/api/extract-pdf', methods=['POST'])
def upload_and_extract_pdf():
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "No file part provided"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "error": "No file selected"}), 400
        
    if file and file.filename.lower().endswith('.pdf'):
        filename = werkzeug.utils.secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        try:
            extracted_json = extract_college_cutoff_data(filepath)
            return jsonify({"success": True, "data": extracted_json}), 200
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({"success": False, "error": f"Failed to process PDF: {str(e)}"}), 500
    else:
        return jsonify({"success": False, "error": "Invalid file format."}), 400


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES — SEAT MATRIX (NEW)
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/extract-seat-matrix', methods=['POST'])
def upload_and_extract_seat_matrix():
    """
    Upload a seat matrix PDF → extract all college/branch vacancy data.
    Supports both regular JSON response and SSE streaming (if Accept: text/event-stream).
    """
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "No file part provided"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "error": "No file selected"}), 400

    if not file.filename.lower().endswith('.pdf'):
        return jsonify({"success": False, "error": "Only PDF files are accepted."}), 400

    filename = werkzeug.utils.secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], 'sm_' + filename)
    file.save(filepath)

    # Check if caller wants SSE streaming
    wants_stream = request.headers.get('Accept', '') == 'text/event-stream'

    if wants_stream:
        def generate():
            events = []

            def collect_event(evt):
                events.append(evt)
                yield f"data: {json.dumps(evt)}\n\n"

            try:
                def cb(evt):
                    events.append(evt)

                result = extract_seat_matrix_data(filepath, progress_callback=cb)

                # Replay collected progress events
                for evt in events:
                    yield f"data: {json.dumps(evt)}\n\n"

                yield f"data: {json.dumps({'type': 'result', 'success': True, 'data': result, 'college_count': len(result)})}\n\n"
            except Exception as e:
                import traceback
                traceback.print_exc()
                yield f"data: {json.dumps({'type': 'error', 'success': False, 'error': str(e)})}\n\n"

        return Response(stream_with_context(generate()), content_type='text/event-stream')
    else:
        # Standard JSON response
        try:
            progress_logs = []
            result = extract_seat_matrix_data(filepath, progress_callback=lambda e: progress_logs.append(e))
            return jsonify({
                "success": True,
                "data": result,
                "college_count": len(result),
                "logs": progress_logs
            }), 200
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({"success": False, "error": f"Failed to process PDF: {str(e)}"}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5005, debug=True)
