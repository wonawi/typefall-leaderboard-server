// leaderboard-server.js
const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const app = express();
const port = 3000;

// Constants
const SPREADSHEET_ID = "1pK0z2vmPTB0q2_iXEdWZrlzXNEJDCvFL61uknaAoPRA";
const GLOBAL_SCORES_SHEET = "global_scores";
const LEVEL_SCORES_SHEET = "level_scores";
const SERVICE_ACCOUNT_JSON = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
    credentials: SERVICE_ACCOUNT_JSON,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Authenticate with Google Sheets API using Service Account
 */
async function authenticateGoogleSheets() {
    const auth = new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_FILE,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    return google.sheets({ version: "v4", auth });
}

/**
 * Test connection to Google Sheets
 */
app.get('/test-connection', async (req, res) => {
    try {
        const sheets = await authenticateGoogleSheets();
        const response = await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID
        });
        
        res.json({
            success: true,
            message: "Connection successful",
            spreadsheetTitle: response.data.properties.title
        });
    } catch (error) {
        console.error("Connection test error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Submit global score
 */
app.post('/global-score', async (req, res) => {
    try {
        const { player_id, player_name, score } = req.body;
        
        if (!player_id || !player_name || score === undefined) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: player_id, player_name, score"
            });
        }
        
        const timestamp = new Date().toISOString();
        const sheets = await authenticateGoogleSheets();
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${GLOBAL_SCORES_SHEET}!A:D`,
            valueInputOption: "USER_ENTERED",
            resource: {
                values: [[player_id, player_name, score, timestamp]]
            }
        });
        
        res.json({
            success: true,
            message: "Global score submitted successfully"
        });
    } catch (error) {
        console.error("Global score submission error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Submit level score
 */
app.post('/level-score', async (req, res) => {
    try {
        const { player_id, player_name, level_id, language, difficulty, score } = req.body;
        
        if (!player_id || !player_name || !level_id || !language || !difficulty || score === undefined) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields"
            });
        }
        
        const timestamp = new Date().toISOString();
        const sheets = await authenticateGoogleSheets();
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${LEVEL_SCORES_SHEET}!A:G`,
            valueInputOption: "USER_ENTERED",
            resource: {
                values: [[player_id, player_name, level_id, language, difficulty, score, timestamp]]
            }
        });
        
        res.json({
            success: true,
            message: "Level score submitted successfully"
        });
    } catch (error) {
        console.error("Level score submission error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get global leaderboard
 */
app.get('/global-leaderboard', async (req, res) => {
    try {
        const sheets = await authenticateGoogleSheets();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: GLOBAL_SCORES_SHEET
        });
        
        const values = response.data.values || [];
        
        // Skip header row if present
        const startIndex = values.length > 0 && values[0][0] === "player_id" ? 1 : 0;
        
        // Format data for the client
        const formattedData = [];
        for (let i = startIndex; i < values.length; i++) {
            const row = values[i];
            if (row.length >= 3) {
                formattedData.push({
                    player_name: row[1],
                    score: parseInt(row[2]) || 0,
                    timestamp: row.length > 3 ? row[3] : ""
                });
            }
        }
        
        // Sort by score (descending)
        formattedData.sort((a, b) => b.score - a.score);
        
        res.json(formattedData);
    } catch (error) {
        console.error("Global leaderboard error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get level leaderboard
 */
app.get('/level-leaderboard', async (req, res) => {
    try {
        const { level_id, language, difficulty } = req.query;
        
        if (!level_id) {
            return res.status(400).json({
                success: false,
                error: "Missing required parameter: level_id"
            });
        }
        
        const sheets = await authenticateGoogleSheets();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: LEVEL_SCORES_SHEET
        });
        
        const values = response.data.values || [];
        
        // Skip header row if present
        const startIndex = values.length > 0 && values[0][0] === "player_id" ? 1 : 0;
        
        // Format and filter data for the client
        const formattedData = [];
        for (let i = startIndex; i < values.length; i++) {
            const row = values[i];
            if (row.length >= 6) {
                // Filter by level_id, language, and difficulty if provided
                if (row[2] === level_id && 
                    (!language || row[3] === language) && 
                    (!difficulty || row[4] === difficulty)) {
                    
                    formattedData.push({
                        player_name: row[1],
                        level_id: row[2],
                        language: row[3],
                        difficulty: row[4],
                        score: parseInt(row[5]) || 0,
                        timestamp: row.length > 6 ? row[6] : ""
                    });
                }
            }
        }
        
        // Sort by score (descending)
        formattedData.sort((a, b) => b.score - a.score);
        
        res.json(formattedData);
    } catch (error) {
        console.error("Level leaderboard error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`TypeType Leaderboard API server running at http://localhost:${port}`);
});