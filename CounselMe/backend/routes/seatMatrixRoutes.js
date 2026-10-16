const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
    parseSeatMatrixPdf,
    importParsedSeatMatrix,
    getSeatMatrixByCollege,
    getSeatMatrixSummary,
    getVacantSeats,
    deleteSeatMatrix
} = require('../controllers/seatMatrixController');
const { protect, authorize } = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB for large seat matrix PDFs
});

// Admin routes
router.post('/parse-pdf', protect, authorize('admin'), upload.single('file'), parseSeatMatrixPdf);
router.post('/import', protect, authorize('admin'), importParsedSeatMatrix);
router.get('/summary/all', protect, authorize('admin'), getSeatMatrixSummary);
router.delete('/:institutionId', protect, authorize('admin'), deleteSeatMatrix);

// Public routes
router.get('/vacant', getVacantSeats);
router.get('/:institutionId', getSeatMatrixByCollege);

module.exports = router;
