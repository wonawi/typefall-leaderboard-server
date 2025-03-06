const { google } = require("googleapis");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Authenticate with Google Sheets API
const SERVICE_ACCOUNT_JSON = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
    credentials: SERVICE_ACCOUNT_JSON,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

// Replace this with your actual Google Spreadsheet ID
const SPREADSHEET_ID = "1pK0z2vmPTB0q2_iXEdWZrlzXNEJDCvFL61uknaAoPRA";
const SHEET_NAME = "global_scores"; // Change to match your sheet name

// Route to fetch the leaderboard from Google Sheets
app.get("/leaderboard", async (req, res) => {
    try {
        const sheets = google.sheets({ version: "v4", auth });
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A2:C`, // Assuming A2:C contains player_id, player_name, score
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return res.json({ leaderboard: [] });
        }

        // Convert rows to a leaderboard format
        const leaderboard = rows.map(row => ({
            player_id: row[0] || "Unknown",
            player_name: row[1] || "Anonymous",
            score: parseInt(row[2]) || 0
        }));

        // Sort by highest score
        leaderboard.sort((a, b) => b.score - a.score);

        res.json({ leaderboard });
    } catch (error) {
        console.error("Error fetching leaderboard:", error);
        res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Leaderboard API running on port ${PORT}`);
});

try {
    const SERVICE_ACCOUNT_JSON = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    console.log("✅ Private Key:", SERVICE_ACCOUNT_JSON.private_key);
} catch (error) {
    console.error("❌ Failed to parse service account JSON:", error);
}