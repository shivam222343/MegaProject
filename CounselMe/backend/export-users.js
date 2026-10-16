require("dotenv").config();
const mongoose = require("mongoose");
const fs       = require("fs");
const path     = require("path");

const userSchema = new mongoose.Schema({
    displayName:  String,
    email:        String,
    phoneNumber:  String,
    isVerified:   Boolean,
    role:         String,
    examType:     String,
    scores:       { type: Map, of: { percentile: Number, rank: Number } },
    percentile:   Number,
    rank:         Number,
    location:     String,
    expectedRegion: String,
    admissionCategory: String,
    preferences: {
        preferredBranches:       [String],
        preferredRegions:        [String],
        collegeStatusPreference: [String],
        isProfileComplete:       Boolean,
        avatarSeed:              String,
    },
    lastPredictorPreferences: { type: Object, default: {} },
    subscription: {
        type:  { type: String },
        usage: { aiPrompts: Number, predictions: Number, exports: Number }
    },
    isOnline:  Boolean,
    lastActive: Date,
    createdAt:  Date,
    updatedAt:  Date,
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

const arr  = (v) => (Array.isArray(v) ? v.join(" | ") : (v != null ? v : ""));
const safe = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") return JSON.stringify(v).split('"').join('""');
    return String(v).split('"').join('""');
};
const q = (v) => '"' + safe(v) + '"';

async function main() {
    const MONGO_URI = process.env.MONGODB_URI;
    if (!MONGO_URI) { console.error("MONGODB_URI not found in .env"); process.exit(1); }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, { dbName: "test" });
    console.log("Connected.");

    const users = await User.find({}).lean();
    console.log("Found " + users.length + " users.");

    const lpKeys = new Set();
    for (const u of users) {
        Object.keys(u.lastPredictorPreferences || {}).forEach(k => lpKeys.add(k));
    }
    const lpCols = [...lpKeys].sort();

    const FIXED_HEADERS = [
        "user_id","display_name","email","phone_number","role","is_verified",
        "exam_type","admission_category","percentile","rank","scores_json",
        "location","expected_region","pref_branches","pref_regions",
        "pref_college_status","pref_profile_complete","subscription_type",
        "sub_usage_ai_prompts","sub_usage_predictions","sub_usage_exports",
        "is_online","last_active","created_at","updated_at",
    ];
    const ALL_HEADERS = [...FIXED_HEADERS, ...lpCols.map(k => "lp_" + k)];

    const rows = users.map(u => {
        const lp    = u.lastPredictorPreferences || {};
        const pref  = u.preferences || {};
        const sub   = u.subscription || {};
        const usage = sub.usage || {};
        let scoresObj = {};
        if (u.scores && typeof u.scores === "object") {
            if (u.scores instanceof Map) { u.scores.forEach((v, k) => { scoresObj[k] = v; }); }
            else { scoresObj = u.scores; }
        }
        const fixed = [
            q(u._id), q(u.displayName), q(u.email), q(u.phoneNumber),
            q(u.role), q(u.isVerified), q(u.examType), q(u.admissionCategory),
            q(u.percentile), q(u.rank),
            q(Object.keys(scoresObj).length ? JSON.stringify(scoresObj) : ""),
            q(u.location), q(u.expectedRegion),
            q(arr(pref.preferredBranches)), q(arr(pref.preferredRegions)),
            q(arr(pref.collegeStatusPreference)), q(pref.isProfileComplete),
            q(sub.type), q(usage.aiPrompts), q(usage.predictions), q(usage.exports),
            q(u.isOnline), q(u.lastActive), q(u.createdAt), q(u.updatedAt),
        ];
        const lpValues = lpCols.map(k => q(lp[k]));
        return [...fixed, ...lpValues].join(",");
    });

    const timestamp  = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const outputFile = path.join(__dirname, "users_export_" + timestamp + ".csv");
    const csvContent = [ALL_HEADERS.join(","), ...rows].join("\r\n");
    fs.writeFileSync(outputFile, "\uFEFF" + csvContent, "utf8");

    console.log("Exported " + users.length + " users to: " + outputFile);
    if (lpCols.length) {
        console.log("lastPredictorPreferences keys found: " + lpCols.join(", "));
    } else {
        console.log("No lastPredictorPreferences data found in any user.");
    }
    await mongoose.disconnect();
    console.log("Done!");
}

main().catch(err => { console.error("Error:", err.message); process.exit(1); });
