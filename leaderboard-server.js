// TypeFall Leaderboard Server - Version 2.0.0
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
const GLOBAL_SCORES_SHEET = "global_scores"; // Sheet for global scores
const LEVEL_SCORES_SHEET = "level_scores"; // Sheet for level-specific scores
const PLAYERS_SHEET = "players"; // Sheet for player information
const SHEET_NAME = GLOBAL_SCORES_SHEET; // For backward compatibility

/**
 * Check if a player exists in the players sheet
 * @param {string} player_id - The player ID to check
 * @returns {Promise<{exists: boolean, index: number, data: any[]}>} Player data and row index
 */
async function checkPlayerExists(player_id) {
    const sheets = await authenticateGoogleSheets();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: PLAYERS_SHEET
    });
    
    const values = response.data.values || [];
    const startIndex = values.length > 0 && values[0][0] === "player_id" ? 1 : 0;
    
    for (let i = startIndex; i < values.length; i++) {
        if (values[i][0] === player_id) {
            return { exists: true, index: i + 1, data: values[i] }; // +1 because sheets are 1-indexed
        }
    }
    
    return { exists: false, index: -1, data: null };
}

/**
 * Create or update a player in the players sheet
 * @param {string} player_id - The player ID
 * @param {string} player_name - The player name
 * @param {boolean} isNewPlayer - Whether this is a new player
 * @param {number} total_score - The player's total score (optional)
 * @param {number} global_position - The player's global position (optional)
 * @returns {Promise<void>}
 */
async function createOrUpdatePlayer(player_id, player_name, isNewPlayer = false, total_score = 0, global_position = 0) {
    const sheets = await authenticateGoogleSheets();
    const timestamp = new Date().toISOString();
    
    // Check if player exists
    const playerCheck = await checkPlayerExists(player_id);
    
    if (playerCheck.exists) {
        // Update existing player
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${PLAYERS_SHEET}!B${playerCheck.index}`, // Update name
            valueInputOption: "RAW",
            resource: {
                values: [[player_name]]
            }
        });
        
        // Update last_record timestamp
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${PLAYERS_SHEET}!D${playerCheck.index}`, // Update last_record
            valueInputOption: "RAW",
            resource: {
                values: [[timestamp]]
            }
        });
        
        // Update total_score and global_position if provided
        if (total_score > 0 || global_position > 0) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${PLAYERS_SHEET}!K${playerCheck.index}:L${playerCheck.index}`,
                valueInputOption: "RAW",
                resource: {
                    values: [[total_score || 0, global_position || 0]]
                }
            });
        }
    } else {
        // Create new player
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${PLAYERS_SHEET}!A:L`,
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            resource: {
                values: [[
                    player_id,
                    player_name,
                    timestamp, // created
                    timestamp, // last_record
                    0, // total_games
                    0, // highest_score
                    "", // hs_level
                    "", // hs_difficulty
                    "", // hs_language
                    0,  // hs_time
                    total_score || 0, // total_score
                    global_position || 0 // global_position
                ]]
            }
        });
    }
}

/**
 * Update player statistics
 * @param {string} player_id - The player ID
 * @param {number} score - The score achieved
 * @param {string} level_id - The level ID (optional)
 * @param {string} difficulty - The difficulty (optional)
 * @param {string} language - The language (optional)
 * @param {number} time - The time taken (optional)
 * @returns {Promise<void>}
 */
async function updatePlayerStats(player_id, score, level_id = "", difficulty = "", language = "", time = 0) {
    const playerCheck = await checkPlayerExists(player_id);
    
    if (!playerCheck.exists) {
        console.error(`Player ${player_id} not found for stats update`);
        return;
    }
    
    const sheets = await authenticateGoogleSheets();
    const rowIndex = playerCheck.index;
    
    // Increment total_games
    const currentGames = parseInt(playerCheck.data[4]) || 0;
    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${PLAYERS_SHEET}!E${rowIndex}`, // total_games
        valueInputOption: "RAW",
        resource: {
            values: [[currentGames + 1]]
        }
    });
    
    // Update highest score if new score is higher
    const currentHighScore = parseInt(playerCheck.data[5]) || 0;
    if (score > currentHighScore) {
        // Update highest score and related fields
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${PLAYERS_SHEET}!F${rowIndex}:J${rowIndex}`, // highest_score to hs_time
            valueInputOption: "RAW",
            resource: {
                values: [[
                    score,
                    level_id,
                    difficulty,
                    language,
                    time
                ]]
            }
        });
    }
}

/**
 * Function to authenticate with Google Sheets
 * @returns {Promise<Object>} Google Sheets API client
 */
async function authenticateGoogleSheets() {
    try {
        const sheets = google.sheets({ version: "v4", auth });
        return sheets;
    } catch (error) {
        console.error("Authentication error:", error);
        throw new Error(`Failed to authenticate with Google Sheets: ${error.message}`);
    }
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
app.post("/global-score", async (req, res) => {
    console.log("🔥 Received global score submission:");
    console.log("Body:", req.body); // Log received data

    try {
        const { nickname, total_score, total_games = 1 } = req.body;

        // Check for missing fields
        if (!nickname || !total_score) {
            console.error("❌ Missing required fields:", req.body);
            return res.status(400).json({ error: "Missing required fields" });
        }

        const sheets = await authenticateGoogleSheets();
        const timestamp = new Date().toISOString();

        // Add to global_scores sheet
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${GLOBAL_SCORES_SHEET}!A:D`,
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            resource: {
                values: [[nickname, total_score, total_games, timestamp]]
            }
        });
        
        // Get all global scores to calculate position
        const scoresResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: GLOBAL_SCORES_SHEET
        });
        
        const scores = scoresResponse.data.values || [];
        const startIndex = scores.length > 0 && scores[0][0] === "nickname" ? 1 : 0;
        
        // Format score data
        const scoreData = [];
        for (let i = startIndex; i < scores.length; i++) {
            const row = scores[i];
            if (row.length >= 2) {
                scoreData.push({
                    nickname: row[0],
                    score: parseInt(row[1]) || 0
                });
            }
        }
        
        // Sort by score (descending)
        scoreData.sort((a, b) => b.score - a.score);
        
        // Find the current entry's position
        const position = scoreData.findIndex(entry => 
            entry.nickname === nickname && entry.score === total_score
        ) + 1;

        console.log("✅ Global score submitted successfully:", nickname, total_score);
        res.json({ 
            message: "Global score submitted successfully!",
            position: position > 0 ? position : null
        });

    } catch (error) {
        console.error("❌ Error processing global score:", error);
        res.status(500).json({ error: "Failed to process global score", details: error.message });
    }
});


/**
 * Submit level score
 */
app.post("/level-score", async (req, res) => {
    console.log("🔥 Received level score submission:");
    console.log("Body:", req.body); // Log received data

    try {
        const { nickname, level_id, language, difficulty, score, time = 0 } = req.body;

        // Check for missing fields
        if (!nickname || !level_id || !language || !difficulty || !score) {
            console.error("❌ Missing required fields:", req.body);
            return res.status(400).json({ error: "Missing required fields" });
        }

        const sheets = await authenticateGoogleSheets();
        const timestamp = new Date().toISOString();

        // Add to level_scores sheet
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${LEVEL_SCORES_SHEET}!A:F`,
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            resource: {
                values: [[nickname, level_id, language, difficulty, score, timestamp]]
            }
        });

        // Get all scores for this level to calculate position
        const levelScoresResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: LEVEL_SCORES_SHEET
        });
        
        const allScores = levelScoresResponse.data.values || [];
        const startIndex = allScores.length > 0 && allScores[0][0] === "nickname" ? 1 : 0;
        
        // Filter and format scores for this level, language, and difficulty
        const levelScores = [];
        for (let i = startIndex; i < allScores.length; i++) {
            const row = allScores[i];
            if (row.length >= 5 && 
                row[1] === level_id && 
                row[2] === language && 
                row[3] === difficulty) {
                
                levelScores.push({
                    nickname: row[0],
                    score: parseInt(row[4]) || 0
                });
            }
        }
        
        // Sort by score (descending)
        levelScores.sort((a, b) => b.score - a.score);
        
        // Find the current entry's position
        const position = levelScores.findIndex(entry => 
            entry.nickname === nickname && entry.score === score
        ) + 1;

        console.log("✅ Level score submitted successfully:", nickname, score);
        res.json({ 
            message: "Level score submitted successfully!",
            position: position > 0 ? position : null
        });

    } catch (error) {
        console.error("❌ Error writing level score to Google Sheets:", error);
        res.status(500).json({ error: "Failed to submit level score", details: error.message });
    }
});


/**
 * Get global leaderboard
 */
app.get('/global-leaderboard', async (req, res) => {
    try {
        // Get all global scores
        const sheets = await authenticateGoogleSheets();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: GLOBAL_SCORES_SHEET
        });
        
        const values = response.data.values || [];
        const startIndex = values.length > 0 && values[0][0] === "nickname" ? 1 : 0;
        
        // Format data for the client
        const scoreMap = new Map(); // Use a map to consolidate scores by nickname
        
        for (let i = startIndex; i < values.length; i++) {
            const row = values[i];
            if (row.length >= 2) {
                const nickname = row[0];
                const score = parseInt(row[1]) || 0;
                
                // Keep only the highest score for each nickname
                if (!scoreMap.has(nickname) || score > scoreMap.get(nickname).score) {
                    scoreMap.set(nickname, {
                        nickname: nickname,
                        score: score,
                        timestamp: row.length > 3 ? row[3] : ""
                    });
                }
            }
        }
        
        // Convert map to array
        let formattedData = Array.from(scoreMap.values());
        
        // Sort by score (descending)
        formattedData.sort((a, b) => b.score - a.score);
        
        // Add position to each entry
        formattedData = formattedData.map((entry, index) => ({
            ...entry,
            position: index + 1
        }));
        
        // Limit to top 100
        const topEntries = formattedData.slice(0, 100);
        
        res.json(topEntries);
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
        const startIndex = values.length > 0 && values[0][0] === "nickname" ? 1 : 0;
        
        // Use a map to consolidate scores by nickname (keeping highest score)
        const scoreMap = new Map();
        
        for (let i = startIndex; i < values.length; i++) {
            const row = values[i];
            if (row.length >= 5) {
                // Filter by level_id, language, and difficulty if provided
                if (row[1] === level_id && 
                    (!language || row[2] === language) && 
                    (!difficulty || row[3] === difficulty)) {
                    
                    const nickname = row[0];
                    const score = parseInt(row[4]) || 0;
                    const timestamp = row.length > 5 ? row[5] : "";
                    
                    // Keep only the highest score for each nickname
                    if (!scoreMap.has(nickname) || score > scoreMap.get(nickname).score) {
                        scoreMap.set(nickname, {
                            nickname: nickname,
                            level_id: row[1],
                            language: row[2],
                            difficulty: row[3],
                            score: score,
                            timestamp: timestamp
                        });
                    }
                }
            }
        }
        
        // Convert map to array
        let formattedData = Array.from(scoreMap.values());
        
        // Sort by score (descending)
        formattedData.sort((a, b) => b.score - a.score);
        
        // Add position to each entry
        formattedData = formattedData.map((entry, index) => ({
            ...entry,
            position: index + 1
        }));
        
        // Limit to top 100
        const topEntries = formattedData.slice(0, 100);
        
        res.json(topEntries);
    } catch (error) {
        console.error("Level leaderboard error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Legacy route to fetch the leaderboard from Google Sheets
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

// Test route to check if server is running
app.get("/", (req, res) => {
    res.send("TypeFall Leaderboard API v2.0.0 is running!");
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


app.get("/test-write", async (req, res) => {
    try {
        const sheets = google.sheets({ version: "v4", auth });
        const request = {
            spreadsheetId: SPREADSHEET_ID,
            range: "global_scores!A2:B2", // Make sure this range is correct
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            resource: {
                values: [["TestUser", 9999]] // Dummy data
            }
        };

        const response = await sheets.spreadsheets.values.append(request);
        console.log("✅ Write Test Successful!", response.data);
        res.json({ message: "✅ Write Test Successful!", response: response.data });

    } catch (error) {
        console.error("❌ Write Test Failed:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Write Test Failed!", details: error.response ? error.response.data : error.message });
    }
});

/**
 * Get player information
 */
app.get('/player-info', async (req, res) => {
    try {
        const { player_id } = req.query;
        
        if (!player_id) {
            return res.status(400).json({
                success: false,
                error: "Missing required parameter: player_id"
            });
        }
        
        const playerCheck = await checkPlayerExists(player_id);
        
        if (!playerCheck.exists) {
            return res.status(404).json({
                success: false,
                error: "Player not found"
            });
        }
        
        // Format player data with new fields
        const playerData = {
            player_id: playerCheck.data[0],
            player_name: playerCheck.data[1],
            created: playerCheck.data[2],
            last_record: playerCheck.data[3],
            total_games: parseInt(playerCheck.data[4]) || 0,
            highest_score: parseInt(playerCheck.data[5]) || 0,
            hs_level: playerCheck.data[6] || "",
            hs_difficulty: playerCheck.data[7] || "",
            hs_language: playerCheck.data[8] || "",
            hs_time: parseInt(playerCheck.data[9]) || 0,
            total_score: parseInt(playerCheck.data[10]) || 0,
            global_position: parseInt(playerCheck.data[11]) || 0
        };
        
        res.json(playerData);
    } catch (error) {
        console.error("Player info error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Register a new player
 */
app.post('/register-player', async (req, res) => {
    try {
        const { player_id, player_name } = req.body;
        
        if (!player_id || !player_name) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: player_id, player_name"
            });
        }
        
        // Check if player already exists
        const playerCheck = await checkPlayerExists(player_id);
        
        if (playerCheck.exists) {
            return res.status(409).json({
                success: false,
                error: "Player ID already exists"
            });
        }
        
        // Create new player
        await createOrUpdatePlayer(player_id, player_name, true);
        
        res.json({
            success: true,
            message: "Player registered successfully"
        });
    } catch (error) {
        console.error("Player registration error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Update player information
 */
app.post('/update-player', async (req, res) => {
    try {
        const { player_id, player_name } = req.body;
        
        if (!player_id || !player_name) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: player_id, player_name"
            });
        }
        
        // Check if player exists
        const playerCheck = await checkPlayerExists(player_id);
        
        if (!playerCheck.exists) {
            return res.status(404).json({
                success: false,
                error: "Player not found"
            });
        }
        
        // Update player
        await createOrUpdatePlayer(player_id, player_name);
        
        res.json({
            success: true,
            message: "Player updated successfully"
        });
    } catch (error) {
        console.error("Player update error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get sheet ID by name
 * @param {string} sheetName - The name of the sheet
 * @returns {Promise<number>} The sheet ID
 */
async function getSheetId(sheetName) {
    const sheets = await authenticateGoogleSheets();
    const response = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID
    });
    
    for (const sheet of response.data.sheets) {
        if (sheet.properties.title === sheetName) {
            return sheet.properties.sheetId;
        }
    }
    
    throw new Error(`Sheet not found: ${sheetName}`);
}

/**
 * Delete rows with matching identifier from a sheet
 * @param {string} sheetName - The name of the sheet
 * @param {string} identifier - The identifier to match (player_id or nickname)
 * @param {boolean} isNickname - Whether the identifier is a nickname
 * @returns {Promise<number>} Number of rows deleted
 */
async function deleteRowsWithIdentifier(sheetName, identifier, isNickname = false) {
    const sheets = await authenticateGoogleSheets();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: sheetName
    });
    
    const values = response.data.values || [];
    const rowsToDelete = [];
    
    // Find all rows with matching identifier (column A)
    for (let i = 0; i < values.length; i++) {
        if (values[i][0] === identifier) {
            rowsToDelete.push(i);
        }
    }
    
    if (rowsToDelete.length === 0) {
        return 0;
    }
    
    // Get sheet ID
    const sheetId = await getSheetId(sheetName);
    
    // Delete rows in reverse order to avoid index shifting issues
    const deleteRequests = [];
    for (const rowIndex of rowsToDelete.sort((a, b) => b - a)) {
        deleteRequests.push({
            deleteDimension: {
                range: {
                    sheetId: sheetId,
                    dimension: "ROWS",
                    startIndex: rowIndex,
                    endIndex: rowIndex + 1
                }
            }
        });
    }
    
    // Execute batch update
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
            requests: deleteRequests
        }
    });
    
    return rowsToDelete.length;
}

/**
 * Delete rows with matching player_id from a sheet (legacy function)
 * @param {string} sheetName - The name of the sheet
 * @param {string} player_id - The player ID to match
 * @returns {Promise<number>} Number of rows deleted
 */
async function deleteRowsWithPlayerId(sheetName, player_id) {
    return deleteRowsWithIdentifier(sheetName, player_id, false);
}

/**
 * Delete rows with matching nickname from a sheet
 * @param {string} sheetName - The name of the sheet
 * @param {string} nickname - The nickname to match
 * @returns {Promise<number>} Number of rows deleted
 */
async function deleteRowsWithNickname(sheetName, nickname) {
    return deleteRowsWithIdentifier(sheetName, nickname, true);
}

/**
 * Recalculate global positions for all players
 * @returns {Promise<void>}
 */
async function recalculateGlobalPositions() {
    const sheets = await authenticateGoogleSheets();
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: PLAYERS_SHEET
    });
    
    const values = response.data.values || [];
    const startIndex = values.length > 0 && values[0][0] === "player_id" ? 1 : 0;
    
    // Format player data with total scores
    const playerData = [];
    for (let i = startIndex; i < values.length; i++) {
        const row = values[i];
        if (row.length >= 11) {
            playerData.push({
                player_id: row[0],
                total_score: parseInt(row[10]) || 0,
                row_index: i + 1 // +1 because sheets are 1-indexed
            });
        }
    }
    
    // Sort by total_score (descending)
    playerData.sort((a, b) => b.total_score - a.total_score);
    
    // Update global positions for all players
    for (let i = 0; i < playerData.length; i++) {
        const player = playerData[i];
        const position = i + 1; // Position is 1-indexed
        
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${PLAYERS_SHEET}!L${player.row_index}`, // global_position
            valueInputOption: "RAW",
            resource: {
                values: [[position]]
            }
        });
    }
}

/**
 * Reset nickname data
 */
app.post('/reset-nickname', async (req, res) => {
    try {
        const { nickname } = req.body;
        
        if (!nickname) {
            return res.status(400).json({
                success: false,
                error: "Missing required field: nickname"
            });
        }
        
        console.log(`🗑️ Performing reset for nickname ${nickname}`);
        
        // Delete entries from global_scores and level_scores sheets
        const deletedFromGlobalScores = await deleteRowsWithNickname(GLOBAL_SCORES_SHEET, nickname);
        const deletedFromLevelScores = await deleteRowsWithNickname(LEVEL_SCORES_SHEET, nickname);
        
        console.log(`✅ Deleted ${deletedFromGlobalScores} rows from ${GLOBAL_SCORES_SHEET}`);
        console.log(`✅ Deleted ${deletedFromLevelScores} rows from ${LEVEL_SCORES_SHEET}`);
        
        res.json({
            success: true,
            message: "Nickname data reset (all scores deleted)",
            details: {
                global_scores_rows_deleted: deletedFromGlobalScores,
                level_scores_rows_deleted: deletedFromLevelScores
            }
        });
    } catch (error) {
        console.error("Nickname reset error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Reset player data (legacy endpoint)
 */
app.post('/reset-player', async (req, res) => {
    try {
        const { player_id, reset_type } = req.body;
        
        if (!player_id) {
            return res.status(400).json({
                success: false,
                error: "Missing required field: player_id"
            });
        }
        
        // Check if player exists
        const playerCheck = await checkPlayerExists(player_id);
        
        if (!playerCheck.exists) {
            return res.status(404).json({
                success: false,
                error: "Player not found"
            });
        }
        
        const sheets = await authenticateGoogleSheets();
        
        if (reset_type === "full") {
            console.log(`🗑️ Performing full reset for player ${player_id}`);
            
            // Get player name before deleting
            const player_name = playerCheck.data[1];
            
            // Delete player from all sheets
            const deletedFromPlayers = await deleteRowsWithPlayerId(PLAYERS_SHEET, player_id);
            
            // For backward compatibility, try to delete from global_scores and level_scores using player_id
            const deletedFromGlobalScores = await deleteRowsWithPlayerId(GLOBAL_SCORES_SHEET, player_id);
            const deletedFromLevelScores = await deleteRowsWithPlayerId(LEVEL_SCORES_SHEET, player_id);
            
            console.log(`✅ Deleted ${deletedFromPlayers} rows from ${PLAYERS_SHEET}`);
            console.log(`✅ Deleted ${deletedFromGlobalScores} rows from ${GLOBAL_SCORES_SHEET}`);
            console.log(`✅ Deleted ${deletedFromLevelScores} rows from ${LEVEL_SCORES_SHEET}`);
            
            // Recalculate global positions
            await recalculateGlobalPositions();
            console.log(`✅ Recalculated global positions`);
            
            res.json({
                success: true,
                message: "Player fully reset (all data deleted)",
                details: {
                    players_rows_deleted: deletedFromPlayers,
                    global_scores_rows_deleted: deletedFromGlobalScores,
                    level_scores_rows_deleted: deletedFromLevelScores
                }
            });
        } else {
            // Reset stats only
            const timestamp = new Date().toISOString();
            
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${PLAYERS_SHEET}!D${playerCheck.index}:L${playerCheck.index}`,
                valueInputOption: "RAW",
                resource: {
                    values: [[
                        timestamp, // last_record
                        0, // total_games
                        0, // highest_score
                        "", // hs_level
                        "", // hs_difficulty
                        "", // hs_language
                        0,  // hs_time
                        0,  // total_score
                        0   // global_position
                    ]]
                }
            });
            
            // Recalculate global positions
            await recalculateGlobalPositions();
            
            res.json({
                success: true,
                message: "Player statistics reset"
            });
        }
    } catch (error) {
        console.error("Player reset error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


// Start server
app.listen(PORT, () => {
    console.log(`🚀 TypeFall Leaderboard API v2.0.0 running on port ${PORT}`);
});
