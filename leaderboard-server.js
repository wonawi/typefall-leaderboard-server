const { google } = require("googleapis");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;


app.use(cors());
app.use(express.json());

// Authenticate with Google Sheets API
let SERVICE_ACCOUNT_JSON;
try {
    // Parse the JSON from environment variable
    SERVICE_ACCOUNT_JSON = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    
    // Fix the private key format if needed
    if (SERVICE_ACCOUNT_JSON.private_key) {
        // Replace escaped newlines with actual newlines if needed
        if (!SERVICE_ACCOUNT_JSON.private_key.includes("\n")) {
            SERVICE_ACCOUNT_JSON.private_key = SERVICE_ACCOUNT_JSON.private_key
                .replace(/\\n/g, "\n");
        }
    }
    
    console.log("Service account email:", SERVICE_ACCOUNT_JSON.client_email);
    console.log("Private key format looks good:", 
                SERVICE_ACCOUNT_JSON.private_key.startsWith("-----BEGIN PRIVATE KEY-----") && 
                SERVICE_ACCOUNT_JSON.private_key.endsWith("-----END PRIVATE KEY-----\n"));
} catch (error) {
    console.error("Error parsing service account JSON:", error);
    process.exit(1);
}

const auth = new google.auth.GoogleAuth({
    credentials: SERVICE_ACCOUNT_JSON,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

// Replace this with your actual Google Spreadsheet ID
const SPREADSHEET_ID = "1pK0z2vmPTB0q2_iXEdWZrlzXNEJDCvFL61uknaAoPRA";
const SHEET_NAME = "global_scores"; // Change to match your sheet name


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
//app.listen(port, () => {
//    console.log(`TypeType Leaderboard API server running at http://localhost:${port}`);
//});

// Test route to check if server is running
app.get("/", (req, res) => {
    res.send("Leaderboard API is running!");
});

// Route to submit a score
app.post("/submit-score", (req, res) => {
    res.json({ message: "Score submitted!" });
});

// Route to get the leaderboard
app.get("/leaderboard", (req, res) => {
    res.json({ leaderboard: [{ player: "TestPlayer", score: 1000 }] });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Leaderboard API running on port ${PORT}`);
});

// Endpoint to check the format of the service account JSON
app.get("/check-credentials", (req, res) => {
    try {
        const credentialCheck = {
            has_type: !!SERVICE_ACCOUNT_JSON.type,
            has_project_id: !!SERVICE_ACCOUNT_JSON.project_id,
            has_private_key_id: !!SERVICE_ACCOUNT_JSON.private_key_id,
            has_private_key: !!SERVICE_ACCOUNT_JSON.private_key,
            has_client_email: !!SERVICE_ACCOUNT_JSON.client_email,
            has_client_id: !!SERVICE_ACCOUNT_JSON.client_id,
            private_key_format_valid: SERVICE_ACCOUNT_JSON.private_key.startsWith("-----BEGIN PRIVATE KEY-----") && 
                                     SERVICE_ACCOUNT_JSON.private_key.endsWith("-----END PRIVATE KEY-----\n"),
            private_key_contains_newlines: SERVICE_ACCOUNT_JSON.private_key.includes("\n"),
            client_email: SERVICE_ACCOUNT_JSON.client_email,
            type: SERVICE_ACCOUNT_JSON.type
        };
        
        res.json({
            message: "Credential format check",
            credential_check: credentialCheck
        });
    } catch (error) {
        console.error("Error checking credentials:", error);
        res.status(500).json({ 
            error: "Failed to check credentials", 
            message: error.message 
        });
    }
});

app.get("/test-auth", async (req, res) => {
    try {
        console.log("Testing authentication...");
        const authClient = await auth.getClient();
        console.log("Got auth client successfully");
        const token = await authClient.getAccessToken();
        console.log("Got access token successfully");
        res.json({ 
            message: "✅ Google Auth Success!", 
            accessToken: token.token.substring(0, 10) + "..." // Only show part of the token for security
        });
    } catch (error) {
        console.error("❌ Google Auth Failed!", error);
        
        // More detailed error information
        const errorDetails = {
            message: error.message,
            stack: error.stack,
            code: error.code,
        };
        
        if (error.response) {
            errorDetails.response = {
                status: error.response.status,
                data: error.response.data
            };
        }
        
        res.status(500).json({ 
            error: "Google Auth failed!", 
            details: errorDetails
        });
    }
});
