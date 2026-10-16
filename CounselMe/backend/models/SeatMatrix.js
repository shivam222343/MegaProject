const mongoose = require('mongoose');

// Stores a single category-gender combination row (e.g., OPEN-G, OPEN-L, SC-G, etc.)
const categorySeatSchema = new mongoose.Schema({
    category: { type: String, required: true }, // OPEN, SC, ST, VJ/DT, NTB, NTC, NTD, OBC, SEBC
    gender: { type: String, enum: ['G', 'L', 'GL'], default: 'G' }, // G=General, L=Ladies, GL=Combined
    subType: { type: String, default: 'State Level' }, // State Level, PWD, DEF
    seats: { type: Number, default: 0 }
}, { _id: false });

const seatMatrixSchema = new mongoose.Schema({
    collegeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Institution',
        required: true
    },
    dteCode: { type: String }, // e.g. "01002"
    branch: { type: String, required: true }, // "Civil Engineering"
    choiceCode: { type: String }, // "0100219110"
    examType: {
        type: String,
        enum: ['MHTCET PCM', 'MHTCET PCB', 'JEE', 'NEET', 'PHARMACY', 'BBA'],
        required: true
    },
    year: { type: Number, required: true },
    round: { type: Number, required: true }, // 1, 2, 3...

    // Header columns — seat totals
    totalSeats: { type: Number, default: 0 },      // SI column
    msSeats: { type: Number, default: 0 },          // MS Seats
    minoritySeats: { type: Number, default: 0 },
    allIndiaSeats: { type: Number, default: 0 },
    instituteSeats: { type: Number, default: 0 },
    orphanI: { type: Number, default: 0 },          // OrphanI
    orphanN: { type: Number, default: 0 },          // OrphanN
    vacantCAPSeats: { type: Number, default: 0 },   // "Vacant CAP Seats: N"

    // Category-wise seat rows (State Level, PWD, DEF rows per category)
    categorySeats: [categorySeatSchema],

    // Common Reserved totals
    pwdCommonReserved: { type: Number, default: 0 },
    defCommonReserved: { type: Number, default: 0 },

    // Footer fields
    ewsSeats: { type: Number, default: 0 },
    tfwsChoiceCode: { type: String, default: null },
    tfwsSeats: { type: Number, default: 0 }
}, {
    timestamps: true
});

// Compound unique index — one seat matrix per college/branch/year/round/examType
seatMatrixSchema.index({
    collegeId: 1,
    branch: 1,
    examType: 1,
    year: 1,
    round: 1
}, { unique: true });

// Fast lookup indexes
seatMatrixSchema.index({ collegeId: 1, year: 1, round: 1 });
seatMatrixSchema.index({ vacantCAPSeats: 1 });

const SeatMatrix = mongoose.model('SeatMatrix', seatMatrixSchema);
module.exports = SeatMatrix;
