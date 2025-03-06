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
            error: "Failed to fetch leaderboard", 
            details: errorDetails
        });
    }
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
