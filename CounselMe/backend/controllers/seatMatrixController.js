const SeatMatrix = require('../models/SeatMatrix');
const Institution = require('../models/Institution');
const axios = require('axios');
const FormDataNode = require('form-data');

// ─────────────────────────────────────────────────────────────────────────────
// @desc   Forward PDF to ML service for seat matrix extraction
// @route  POST /api/seat-matrix/parse-pdf
// @access Admin
// ─────────────────────────────────────────────────────────────────────────────
const parseSeatMatrixPdf = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No PDF file uploaded' });
        }

        const formData = new FormDataNode();
        formData.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
            knownLength: req.file.buffer.length
        });

        const mlApiUrl = process.env.ML_API_URL || 'http://localhost:5005';
        console.log(`[Seat Matrix] Forwarding PDF to ML: ${mlApiUrl}/api/extract-seat-matrix`);

        const response = await axios.post(`${mlApiUrl}/api/extract-seat-matrix`, formData, {
            headers: { ...formData.getHeaders() },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 180000
        });

        if (response.data && response.data.success) {
            return res.json({ success: true, data: response.data.data });
        } else {
            return res.status(500).json({
                success: false,
                message: response.data?.error || 'ML service parsing failed'
            });
        }
    } catch (error) {
        console.error('[Seat Matrix] ML forward error:', error.message);
        res.status(500).json({ success: false, message: 'Error communicating with ML service: ' + error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc   Import parsed seat matrix data (SSE streaming progress)
// @route  POST /api/seat-matrix/import
// @access Admin
// ─────────────────────────────────────────────────────────────────────────────
const importParsedSeatMatrix = async (req, res) => {
    // Set SSE headers for live terminal streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const { colleges, examType, year, round } = req.body;

    if (!colleges || !Array.isArray(colleges) || colleges.length === 0) {
        sendEvent({ type: 'error', message: 'No colleges data provided' });
        return res.end();
    }

    sendEvent({ type: 'start', message: `Starting import for ${colleges.length} college(s)...`, total: colleges.length });

    let totalInserted = 0;
    let totalSkipped = 0;

    for (let i = 0; i < colleges.length; i++) {
        const collegeData = colleges[i];
        const { collegeName, dteCode, branches } = collegeData;

        sendEvent({
            type: 'progress',
            index: i,
            message: `[${i + 1}/${colleges.length}] Looking up: ${dteCode} - ${collegeName}`,
            collegeName,
            dteCode
        });

        try {
            // Find institution by DTE code with multiple variants
            const cleanDte = dteCode?.toString().trim();
            const dteQueryOptions = [cleanDte];
            if (cleanDte) {
                const numDte = parseInt(cleanDte, 10);
                if (!isNaN(numDte)) {
                    dteQueryOptions.push(numDte.toString());
                    dteQueryOptions.push(numDte.toString().padStart(5, '0'));
                    dteQueryOptions.push(numDte.toString().padStart(4, '0'));
                }
            }

            let institution = await Institution.findOne({ dteCode: { $in: dteQueryOptions } });

            if (!institution && collegeName) {
                institution = await Institution.findOne({ name: { $regex: new RegExp(collegeName.trim(), 'i') } });
            }

            if (!institution) {
                sendEvent({
                    type: 'warn',
                    message: `⚠ Not found in DB: "${collegeName}" (DTE: ${dteCode}) — skipped`,
                    dteCode
                });
                totalSkipped++;
                continue;
            }

            sendEvent({
                type: 'log',
                message: `✓ Matched: "${institution.name}" → processing ${branches?.length || 0} branch(es)`,
            });

            // Delete existing seat matrices for this college/year/round/examType (replace mode)
            await SeatMatrix.deleteMany({
                collegeId: institution._id,
                examType,
                year: parseInt(year),
                round: parseInt(round)
            });

            let branchCount = 0;

            for (const branchData of (branches || [])) {
                const {
                    branch, choiceCode,
                    totalSeats, msSeats, minoritySeats, allIndiaSeats, instituteSeats,
                    orphanI, orphanN, vacantCAPSeats,
                    categorySeats,
                    pwdCommonReserved, defCommonReserved,
                    ewsSeats, tfwsChoiceCode, tfwsSeats
                } = branchData;

                if (!branch) continue;

                try {
                    await SeatMatrix.findOneAndUpdate(
                        {
                            collegeId: institution._id,
                            branch,
                            examType,
                            year: parseInt(year),
                            round: parseInt(round)
                        },
                        {
                            $set: {
                                collegeId: institution._id,
                                dteCode: cleanDte,
                                branch,
                                choiceCode: choiceCode || null,
                                examType,
                                year: parseInt(year),
                                round: parseInt(round),
                                totalSeats: totalSeats || 0,
                                msSeats: msSeats || 0,
                                minoritySeats: minoritySeats || 0,
                                allIndiaSeats: allIndiaSeats || 0,
                                instituteSeats: instituteSeats || 0,
                                orphanI: orphanI || 0,
                                orphanN: orphanN || 0,
                                vacantCAPSeats: vacantCAPSeats || 0,
                                categorySeats: categorySeats || [],
                                pwdCommonReserved: pwdCommonReserved || 0,
                                defCommonReserved: defCommonReserved || 0,
                                ewsSeats: ewsSeats || 0,
                                tfwsChoiceCode: tfwsChoiceCode || null,
                                tfwsSeats: tfwsSeats || 0
                            }
                        },
                        { upsert: true, new: true }
                    );
                    branchCount++;
                    totalInserted++;
                } catch (branchErr) {
                    sendEvent({ type: 'warn', message: `  ⚠ Branch "${branch}" error: ${branchErr.message}` });
                }
            }

            sendEvent({
                type: 'college_done',
                message: `✅ ${institution.name}: ${branchCount} branch(es) saved`,
                institutionId: institution._id.toString(),
                institutionName: institution.name,
                branchCount
            });

        } catch (err) {
            sendEvent({ type: 'error', message: `Error processing "${collegeName}": ${err.message}` });
        }
    }

    sendEvent({
        type: 'complete',
        message: `🎉 Import complete! ${totalInserted} branch seat matrix entries saved. ${totalSkipped} colleges skipped (not in DB).`,
        totalInserted,
        totalSkipped
    });

    res.end();
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc   Get seat matrix for a specific college (year/round filter)
// @route  GET /api/seat-matrix/:institutionId
// @access Public
// ─────────────────────────────────────────────────────────────────────────────
const getSeatMatrixByCollege = async (req, res) => {
    try {
        const { year, round, examType } = req.query;
        const query = { collegeId: req.params.institutionId };

        if (year && year !== 'All') query.year = parseInt(year);
        if (round && round !== 'All') query.round = parseInt(round);
        if (examType) query.examType = examType;

        const matrices = await SeatMatrix.find(query).sort({ branch: 1 }).lean();
        res.json({ success: true, data: matrices });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc   Summary of available years/rounds per college
// @route  GET /api/seat-matrix/summary/all
// @access Admin
// ─────────────────────────────────────────────────────────────────────────────
const getSeatMatrixSummary = async (req, res) => {
    try {
        const summary = await SeatMatrix.aggregate([
            {
                $group: {
                    _id: { collegeId: '$collegeId', year: '$year', round: '$round', examType: '$examType' },
                    branchCount: { $sum: 1 },
                    totalVacant: { $sum: '$vacantCAPSeats' }
                }
            },
            {
                $group: {
                    _id: '$_id.collegeId',
                    rounds: {
                        $push: {
                            year: '$_id.year',
                            round: '$_id.round',
                            examType: '$_id.examType',
                            branchCount: '$branchCount',
                            totalVacant: '$totalVacant'
                        }
                    }
                }
            }
        ]);

        const summaryDict = {};
        summary.forEach(item => {
            if (item._id) summaryDict[item._id.toString()] = item.rounds;
        });

        res.json({ success: true, data: summaryDict });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc   Get vacant seat counts for prediction cards (batch by collegeIds)
// @route  GET /api/seat-matrix/vacant
// @access Public
// ─────────────────────────────────────────────────────────────────────────────
const getVacantSeats = async (req, res) => {
    try {
        const { collegeIds, year, round, examType } = req.query;

        if (!collegeIds) return res.json({ success: true, data: {} });

        const idArray = Array.isArray(collegeIds) ? collegeIds : collegeIds.split(',');

        const query = {
            collegeId: { $in: idArray },
            year: parseInt(year) || new Date().getFullYear(),
            round: parseInt(round) || 1
        };
        if (examType) {
            const eUpper = examType.toUpperCase();
            if (eUpper.includes('PCM') || eUpper === 'MHTCET') {
                query.examType = { $in: ['MHTCET PCM'] };
            } else if (eUpper.includes('PCB') || eUpper === 'PHARMACY') {
                query.examType = { $in: ['MHTCET PCB', 'PHARMACY'] };
            }
        }

        const results = await SeatMatrix.find(query)
            .select('collegeId branch vacantCAPSeats totalSeats year round')
            .lean();

        // Build a map: collegeId → { branch → { vacantCAPSeats, totalSeats } }
        const vacantMap = {};
        for (const r of results) {
            const cid = r.collegeId.toString();
            if (!vacantMap[cid]) vacantMap[cid] = {};
            vacantMap[cid][r.branch] = {
                vacantCAPSeats: r.vacantCAPSeats,
                totalSeats: r.totalSeats,
                year: r.year,
                round: r.round
            };
        }

        res.json({ success: true, data: vacantMap });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc   Delete seat matrix for a college/year/round
// @route  DELETE /api/seat-matrix/:institutionId
// @access Admin
// ─────────────────────────────────────────────────────────────────────────────
const deleteSeatMatrix = async (req, res) => {
    try {
        const { year, round, examType } = req.query;
        const query = { collegeId: req.params.institutionId };
        if (year) query.year = parseInt(year);
        if (round) query.round = parseInt(round);
        if (examType) query.examType = examType;

        const result = await SeatMatrix.deleteMany(query);
        res.json({ success: true, message: `Deleted ${result.deletedCount} seat matrix entries.` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    parseSeatMatrixPdf,
    importParsedSeatMatrix,
    getSeatMatrixByCollege,
    getSeatMatrixSummary,
    getVacantSeats,
    deleteSeatMatrix
};
