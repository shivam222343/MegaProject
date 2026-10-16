import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
    ArrowLeft, Upload, Table2, Search, RefreshCw,
    CheckCircle2, AlertCircle, Loader2, Grid3X3,
    ChevronRight, Trash2, Download, Info
} from 'lucide-react';
import './SeatMatrixAdmin.css';

const API_BASE = '/api';

// ─── Category columns as shown in the PDF ─────────────────────────────────
const CATEGORIES = ['OPEN', 'SC', 'ST', 'VJ/DT', 'NTB', 'NTC', 'NTD', 'OBC', 'SEBC'];
const SUBTYPES = ['State Level', 'PWD', 'DEF'];

// Get seats for a specific category/gender/subType from the categorySeats array
const getSeats = (categorySeats, category, gender, subType) => {
    const match = (categorySeats || []).find(
        s => s.category === category && s.gender === gender && s.subType === subType
    );
    return match ? match.seats : 0;
};

// ─── PDF-Accurate Seat Matrix Table for a single college ────────────────────
const SeatMatrixTable = ({ college, matrices }) => {
    if (!matrices || matrices.length === 0) return null;

    // Total vacant seats across all branches
    const totalVacant = matrices.reduce((sum, m) => sum + (m.vacantCAPSeats || 0), 0);

    return (
        <div className="sm-table-wrapper">
            {/* College header bar — matches PDF style */}
            <div className="sm-pdf-college-bar">
                <span>{college.dteCode} - {college.name}</span>
                <span className="sm-pdf-vacant-badge">Vacant CAP Seats: {totalVacant}</span>
            </div>
            <div className="sm-pdf-sub-header">{college.type || 'Institution'}</div>

            <table className="sm-pdf-table">
                <thead>
                    <tr>
                        <th style={{ width: 100 }}>Choice Code</th>
                        <th style={{ minWidth: 160, textAlign: 'left' }}>Course Name</th>
                        <th>SI</th>
                        <th>MS<br/>Seats</th>
                        <th>Minority<br/>Seats</th>
                        <th>All<br/>India</th>
                        <th>Institute<br/>Seats</th>
                        <th>Orphan<br/>I</th>
                        <th>Orphan<br/>N</th>
                    </tr>
                    <tr>
                        <th colSpan={2} style={{ textAlign: 'left' }}>Category</th>
                        {CATEGORIES.map(cat => (
                            <th key={cat} colSpan={2}>{cat}</th>
                        ))}
                        <th>Total</th>
                    </tr>
                    <tr>
                        <th colSpan={2} style={{ textAlign: 'left' }}>General / Ladies</th>
                        {CATEGORIES.map(cat => (
                            <React.Fragment key={cat}>
                                <th>G</th>
                                <th>L</th>
                            </React.Fragment>
                        ))}
                        <th>G + L</th>
                    </tr>
                </thead>
                <tbody>
                    {matrices.map((matrix, mIdx) => {
                        // Calculate totals for State Level row
                        const stateTotG = CATEGORIES.reduce((sum, cat) =>
                            sum + getSeats(matrix.categorySeats, cat, 'G', 'State Level'), 0);
                        const stateTotL = CATEGORIES.reduce((sum, cat) =>
                            sum + getSeats(matrix.categorySeats, cat, 'L', 'State Level'), 0);
                        const pwdTotG = CATEGORIES.reduce((sum, cat) =>
                            sum + getSeats(matrix.categorySeats, cat, 'G', 'PWD'), 0);
                        const pwdTotL = CATEGORIES.reduce((sum, cat) =>
                            sum + getSeats(matrix.categorySeats, cat, 'L', 'PWD'), 0);
                        const defTotG = CATEGORIES.reduce((sum, cat) =>
                            sum + getSeats(matrix.categorySeats, cat, 'G', 'DEF'), 0);
                        const defTotL = CATEGORIES.reduce((sum, cat) =>
                            sum + getSeats(matrix.categorySeats, cat, 'L', 'DEF'), 0);

                        return (
                            <React.Fragment key={matrix._id || mIdx}>
                                {/* Branch header row */}
                                <tr className="branch-header-row">
                                    <td>
                                        <span className="choice-code">{matrix.choiceCode || '—'}</span>
                                    </td>
                                    <td style={{ textAlign: 'left', fontWeight: 700 }}>
                                        {matrix.branch}
                                        {matrix.vacantCAPSeats > 0 && (
                                            <span style={{
                                                marginLeft: 8, background: '#fef9c3',
                                                border: '1px solid #ca8a04', borderRadius: 4,
                                                padding: '1px 6px', fontSize: 10, color: '#713f12'
                                            }}>
                                                Vacant: {matrix.vacantCAPSeats}
                                            </span>
                                        )}
                                    </td>
                                    <td>{matrix.totalSeats || 0}</td>
                                    <td>{matrix.msSeats || 0}</td>
                                    <td>{matrix.minoritySeats || 0}</td>
                                    <td>{matrix.allIndiaSeats || 0}</td>
                                    <td>{matrix.instituteSeats || 0}</td>
                                    <td>{matrix.orphanI || 0}</td>
                                    <td>{matrix.orphanN || 0}</td>
                                </tr>

                                {/* State Level row */}
                                <tr className="row-state-level">
                                    <td className="row-label" colSpan={2} style={{ color: '#1d4ed8' }}>State Level</td>
                                    {CATEGORIES.map(cat => (
                                        <React.Fragment key={cat}>
                                            <td>{getSeats(matrix.categorySeats, cat, 'G', 'State Level') || 0}</td>
                                            <td>{getSeats(matrix.categorySeats, cat, 'L', 'State Level') || 0}</td>
                                        </React.Fragment>
                                    ))}
                                    <td className="col-total">{stateTotG + stateTotL}</td>
                                </tr>

                                {/* PWD row */}
                                <tr className="row-pwd">
                                    <td className="row-label" colSpan={2} style={{ color: '#7c3aed' }}>PWD</td>
                                    {CATEGORIES.map(cat => (
                                        <React.Fragment key={cat}>
                                            <td>{getSeats(matrix.categorySeats, cat, 'G', 'PWD') || 0}</td>
                                            <td>{getSeats(matrix.categorySeats, cat, 'L', 'PWD') || 0}</td>
                                        </React.Fragment>
                                    ))}
                                    <td className="col-total">{pwdTotG + pwdTotL}</td>
                                </tr>

                                {/* PWD Common Reserved */}
                                <tr className="row-common">
                                    <td colSpan={9} style={{ textAlign: 'center', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, padding: '4px 8px' }}>
                                        PWD Common Reserved Seats : {matrix.pwdCommonReserved || 0}
                                    </td>
                                </tr>

                                {/* DEF row */}
                                <tr className="row-def">
                                    <td className="row-label" colSpan={2} style={{ color: '#7c3aed' }}>DEF</td>
                                    {CATEGORIES.map(cat => (
                                        <React.Fragment key={cat}>
                                            <td>{getSeats(matrix.categorySeats, cat, 'G', 'DEF') || 0}</td>
                                            <td>{getSeats(matrix.categorySeats, cat, 'L', 'DEF') || 0}</td>
                                        </React.Fragment>
                                    ))}
                                    <td className="col-total">{defTotG + defTotL}</td>
                                </tr>

                                {/* DEF Common Reserved */}
                                <tr className="row-common">
                                    <td colSpan={9} style={{ textAlign: 'center', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, padding: '4px 8px' }}>
                                        DEF Common Reserved Seats : {matrix.defCommonReserved || 0}
                                    </td>
                                </tr>

                                {/* Footer notes */}
                                <tr>
                                    <td colSpan={5} style={{ fontSize: 10, color: '#475569', padding: '4px 8px', textAlign: 'left' }}>
                                        Economically Weaker Section (EWS) Seats: <strong>{matrix.ewsSeats || 0}</strong>
                                    </td>
                                    <td colSpan={4} style={{ fontSize: 10, color: '#475569', padding: '4px 8px', textAlign: 'left' }}>
                                        Tution Fee Waiver Scheme Choice Code: {matrix.tfwsChoiceCode || '—'} Seats: <strong>{matrix.tfwsSeats || 0}</strong>
                                    </td>
                                </tr>

                                {/* Separator between branches */}
                                {mIdx < matrices.length - 1 && (
                                    <tr><td colSpan={9} style={{ height: 12, background: '#f8fafc', border: '2px solid #e2e8f0' }} /></tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};


// ─── Terminal Log Item ───────────────────────────────────────────────────────
const LogLine = ({ log }) => {
    const ts = new Date().toLocaleTimeString('en-IN', { hour12: false });
    return (
        <div className={`sm-log ${log.type || 'info'}`}>
            <span className="ts">[{ts}]</span>
            <span className="msg">{log.message}</span>
        </div>
    );
};


// ─── Main Component ──────────────────────────────────────────────────────────
const SeatMatrixAdmin = () => {
    const [institutions, setInstitutions] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedInst, setSelectedInst] = useState(null);
    const [matrices, setMatrices] = useState([]);
    const [summary, setSummary] = useState({});
    const [loadingInst, setLoadingInst] = useState(false);
    const [loadingMatrix, setLoadingMatrix] = useState(false);

    // Filters
    const [selectedYear, setSelectedYear] = useState('2025');
    const [selectedRound, setSelectedRound] = useState('1');
    const availableYears = ['2025', '2024', '2023', '2022'];
    const availableRounds = ['1', '2', '3'];

    // Upload panel state
    const [uploadFile, setUploadFile] = useState(null);
    const [examType, setExamType] = useState('MHTCET PCM');
    const [uploadYear, setUploadYear] = useState('2025');
    const [uploadRound, setUploadRound] = useState('1');
    const [uploadState, setUploadState] = useState('idle'); // idle | parsing | review | importing | done
    const [parsedColleges, setParsedColleges] = useState([]);
    const [selectedForImport, setSelectedForImport] = useState({});
    const [logs, setLogs] = useState([]);

    const terminalRef = useRef(null);
    const fileInputRef = useRef(null);

    const addLog = useCallback((entry) => {
        setLogs(prev => [...prev, entry]);
        setTimeout(() => {
            terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight, behavior: 'smooth' });
        }, 50);
    }, []);

    // Fetch institutions list
    useEffect(() => {
        setLoadingInst(true);
        axios.get(`${API_BASE}/institutions`)
            .then(r => setInstitutions(r.data || []))
            .catch(console.error)
            .finally(() => setLoadingInst(false));

        // Fetch seat matrix summary
        axios.get(`${API_BASE}/seat-matrix/summary/all`)
            .then(r => { if (r.data.success) setSummary(r.data.data); })
            .catch(() => {});
    }, []);

    // Fetch matrices when college / year / round changes
    useEffect(() => {
        if (!selectedInst) return;
        setLoadingMatrix(true);
        axios.get(`${API_BASE}/seat-matrix/${selectedInst._id}`, {
            params: { year: selectedYear, round: selectedRound }
        })
            .then(r => { if (r.data.success) setMatrices(r.data.data); })
            .catch(console.error)
            .finally(() => setLoadingMatrix(false));
    }, [selectedInst, selectedYear, selectedRound]);

    const filteredInstitutions = institutions.filter(inst =>
        inst.name?.toLowerCase().includes(search.toLowerCase()) ||
        inst.dteCode?.includes(search)
    );

    // ── PDF Upload & Parse ──────────────────────────────────────────────────
    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) setUploadFile(file);
    };

    const handleParsePdf = async () => {
        if (!uploadFile) return;
        setUploadState('parsing');
        setLogs([]);
        setParsedColleges([]);
        addLog({ type: 'info', message: `📄 Uploading "${uploadFile.name}"...` });

        const formData = new FormData();
        formData.append('file', uploadFile);

        try {
            addLog({ type: 'info', message: '🤖 Sending to ML service for extraction...' });
            const res = await axios.post(`${API_BASE}/seat-matrix/parse-pdf`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                const data = res.data.data;
                addLog({ type: 'success', message: `✅ Extracted ${data.length} college(s) from PDF.` });

                // Auto-select all colleges
                const selMap = {};
                data.forEach((c, i) => { selMap[i] = true; });
                setSelectedForImport(selMap);
                setParsedColleges(data);
                setUploadState('review');
            } else {
                addLog({ type: 'error', message: `❌ ${res.data.message}` });
                setUploadState('idle');
            }
        } catch (err) {
            addLog({ type: 'error', message: `❌ Error: ${err.response?.data?.message || err.message}` });
            setUploadState('idle');
        }
    };

    // ── SSE Import ──────────────────────────────────────────────────────────
    const handleImport = async () => {
        const toImport = parsedColleges.filter((_, i) => selectedForImport[i]);
        if (!toImport.length) {
            addLog({ type: 'warn', message: '⚠ No colleges selected for import.' });
            return;
        }

        setUploadState('importing');
        addLog({ type: 'info', message: `🚀 Starting import of ${toImport.length} college(s)...` });

        try {
            const token = localStorage.getItem('token') || '';
            const response = await fetch(`${API_BASE}/seat-matrix/import`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    colleges: toImport,
                    examType,
                    year: parseInt(uploadYear),
                    round: parseInt(uploadRound)
                })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const evt = JSON.parse(line.slice(6));
                            addLog({ type: evt.type || 'info', message: evt.message });
                            if (evt.type === 'complete') {
                                setUploadState('done');
                                // Refresh summary
                                axios.get(`${API_BASE}/seat-matrix/summary/all`)
                                    .then(r => { if (r.data.success) setSummary(r.data.data); });
                            }
                        } catch (_) {}
                    }
                }
            }
        } catch (err) {
            addLog({ type: 'error', message: `❌ Import failed: ${err.message}` });
            setUploadState('idle');
        }
    };

    // ── Delete seat matrix for selected college ─────────────────────────────
    const handleDelete = async () => {
        if (!selectedInst || !window.confirm(`Delete seat matrix for ${selectedInst.name} (Year ${selectedYear}, Round ${selectedRound})?`)) return;
        try {
            await axios.delete(`${API_BASE}/seat-matrix/${selectedInst._id}`, {
                params: { year: selectedYear, round: selectedRound }
            });
            setMatrices([]);
            addLog({ type: 'success', message: `✅ Deleted seat matrix for ${selectedInst.name}` });
        } catch (err) {
            addLog({ type: 'error', message: `❌ Delete failed: ${err.message}` });
        }
    };

    // College has seat matrix data?
    const hasData = (inst) => !!summary[inst._id];

    const totalVacant = matrices.reduce((sum, m) => sum + (m.vacantCAPSeats || 0), 0);
    const totalSeats = matrices.reduce((sum, m) => sum + (m.totalSeats || 0), 0);

    return (
        <div className="sm-admin">
            {/* ── Header ── */}
            <div className="sm-header">
                <Link to="/admin" className="back-btn">
                    <ArrowLeft size={14} /> Back
                </Link>
                <div className="sm-header-title">
                    <h1>Seat Matrix Management</h1>
                    <p>Upload, view and manage seat matrix data from DTE PDFs — year & round wise</p>
                </div>
                <div className="sm-badge">
                    <Grid3X3 size={12} /> SEAT MATRIX
                </div>
            </div>

            <div className="sm-body">
                {/* ── Left Sidebar ── */}
                <div className="sm-sidebar">
                    <div className="sm-sidebar-top">
                        <h3>Colleges</h3>
                        <div className="sm-search-box">
                            <Search size={14} color="#475569" />
                            <input
                                placeholder="Search college or DTE..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="sm-college-list">
                        {loadingInst ? (
                            <div style={{ padding: 24, textAlign: 'center', color: '#475569' }}>
                                <Loader2 size={20} className="sm-spinner" />
                            </div>
                        ) : filteredInstitutions.map(inst => (
                            <div
                                key={inst._id}
                                className={`sm-college-item ${selectedInst?._id === inst._id ? 'active' : ''}`}
                                onClick={() => setSelectedInst(inst)}
                            >
                                <div className="sm-college-name">{inst.name}</div>
                                <div className="sm-college-meta">DTE: {inst.dteCode} • {inst.location?.city}</div>
                                <span className={`sm-college-badge ${hasData(inst) ? 'has-data' : 'no-data'}`}>
                                    {hasData(inst) ? '✓ Has Data' : 'No Data'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Main Panel ── */}
                <div className="sm-main">
                    {/* ── Upload Panel (always visible) ── */}
                    <div className="sm-upload-panel">
                        <div className="sm-upload-header">
                            <Upload size={16} color="#a5b4fc" />
                            <h3>Upload Seat Matrix PDF</h3>
                        </div>
                        <div className="sm-upload-body">
                            <div className="sm-upload-row">
                                <div className="sm-field">
                                    <label>Exam Type</label>
                                    <select value={examType} onChange={e => setExamType(e.target.value)}>
                                        <option>MHTCET PCM</option>
                                        <option>MHTCET PCB</option>
                                        <option>JEE</option>
                                        <option>NEET</option>
                                    </select>
                                </div>
                                <div className="sm-field">
                                    <label>Year</label>
                                    <select value={uploadYear} onChange={e => setUploadYear(e.target.value)}>
                                        {availableYears.map(y => <option key={y}>{y}</option>)}
                                    </select>
                                </div>
                                <div className="sm-field">
                                    <label>Round</label>
                                    <select value={uploadRound} onChange={e => setUploadRound(e.target.value)}>
                                        {availableRounds.map(r => <option key={r}>{r}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div
                                className={`sm-drop-zone ${uploadFile ? 'has-file' : ''}`}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input
                                    type="file" accept=".pdf"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    onChange={handleFileSelect}
                                />
                                {uploadFile ? (
                                    <>
                                        <CheckCircle2 size={24} color="#10b981" />
                                        <p className="file-name">{uploadFile.name}</p>
                                        <p>Click to change file</p>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={24} color="#6366f1" />
                                        <p>Click to select Seat Matrix PDF</p>
                                    </>
                                )}
                            </div>

                            <div className="sm-btn-row">
                                <button
                                    className="sm-btn primary"
                                    onClick={handleParsePdf}
                                    disabled={!uploadFile || uploadState === 'parsing'}
                                >
                                    {uploadState === 'parsing' ? (
                                        <><Loader2 size={14} className="sm-spinner" /> Extracting...</>
                                    ) : (
                                        <><Table2 size={14} /> Extract from PDF</>
                                    )}
                                </button>

                                {uploadState === 'review' && (
                                    <button className="sm-btn success" onClick={handleImport}>
                                        <Download size={14} />
                                        Import {Object.values(selectedForImport).filter(Boolean).length} College(s)
                                    </button>
                                )}
                            </div>

                            {/* Parsed colleges review list */}
                            {uploadState === 'review' && parsedColleges.length > 0 && (
                                <div style={{ marginTop: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                                        Select colleges to import ({Object.values(selectedForImport).filter(Boolean).length}/{parsedColleges.length} selected):
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                                        {parsedColleges.map((c, i) => (
                                            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: '#e2e8f0' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={!!selectedForImport[i]}
                                                    onChange={e => setSelectedForImport(prev => ({ ...prev, [i]: e.target.checked }))}
                                                />
                                                <span>{c.dteCode} — {c.collegeName} ({c.branches?.length || 0} branches)</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Terminal console */}
                            {logs.length > 0 && (
                                <div className="sm-terminal">
                                    <div className="sm-terminal-header">
                                        <div className="sm-terminal-dot red" />
                                        <div className="sm-terminal-dot yellow" />
                                        <div className="sm-terminal-dot green" />
                                        <span className="sm-terminal-title">Seat Matrix Import Terminal</span>
                                    </div>
                                    <div className="sm-terminal-body" ref={terminalRef}>
                                        {logs.map((log, i) => <LogLine key={i} log={log} />)}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── College Viewer ── */}
                    {selectedInst ? (
                        <div className="sm-college-panel">
                            <div className="sm-college-panel-header">
                                <div className="sm-college-panel-title">
                                    <h2>{selectedInst.name}</h2>
                                    <span>DTE: {selectedInst.dteCode} • {selectedInst.location?.city} • {selectedInst.type}</span>
                                </div>
                                <button className="sm-btn danger" onClick={handleDelete} style={{ height: 38 }}>
                                    <Trash2 size={13} /> Delete
                                </button>
                            </div>

                            {/* Stats */}
                            {matrices.length > 0 && (
                                <div className="sm-stats-bar">
                                    <div className="sm-stat">
                                        <div className="val">{matrices.length}</div>
                                        <div className="lbl">Branches</div>
                                    </div>
                                    <div className="sm-stat green">
                                        <div className="val">{totalVacant}</div>
                                        <div className="lbl">Vacant CAP Seats</div>
                                    </div>
                                    <div className="sm-stat blue">
                                        <div className="val">{totalSeats}</div>
                                        <div className="lbl">Total Intake</div>
                                    </div>
                                </div>
                            )}

                            {/* Year / Round Tabs */}
                            <div className="sm-year-round-bar">
                                <div className="sm-tab-group">
                                    <label>Year:</label>
                                    {availableYears.map(y => (
                                        <button
                                            key={y}
                                            className={`sm-tab ${selectedYear === y ? 'active' : ''}`}
                                            onClick={() => setSelectedYear(y)}
                                        >{y}</button>
                                    ))}
                                </div>
                                <div className="sm-tab-group">
                                    <label>Round:</label>
                                    {availableRounds.map(r => (
                                        <button
                                            key={r}
                                            className={`sm-tab ${selectedRound === r ? 'active' : ''}`}
                                            onClick={() => setSelectedRound(r)}
                                        >Round {r}</button>
                                    ))}
                                </div>
                            </div>

                            {loadingMatrix ? (
                                <div style={{ textAlign: 'center', padding: 48, color: '#475569' }}>
                                    <Loader2 size={28} className="sm-spinner" style={{ color: '#6366f1' }} />
                                    <p style={{ marginTop: 12 }}>Loading seat matrix...</p>
                                </div>
                            ) : matrices.length === 0 ? (
                                <div className="sm-no-data">
                                    <Table2 size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
                                    <p>No seat matrix data for Year {selectedYear} · Round {selectedRound}</p>
                                    <p style={{ fontSize: 12, marginTop: 4 }}>Upload a PDF above to add data.</p>
                                </div>
                            ) : (
                                <SeatMatrixTable college={selectedInst} matrices={matrices} />
                            )}
                        </div>
                    ) : (
                        <div className="sm-empty-state">
                            <Grid3X3 size={48} />
                            <p>Select a college from the left panel to view seat matrix</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SeatMatrixAdmin;
