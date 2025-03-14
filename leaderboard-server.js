// TypeFall Leaderboard Server - Version 3.1.0
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
const PLAYERS_SHEET = "players"; // Sheet for player information

// Maximum number of entries to keep per leaderboard
const MAX_LEADERBOARD_ENTRIES = 100;

/**
 * Get the sheet name for a specific level-language-difficulty combination
 * @param {string} level_id - The level ID (e.g., "1", "2", "3")
 * @param {string} language - The language code (e.g., "en", "pl", "ru")
 * @param {string} difficulty - The difficulty level (e.g., "easy", "normal")
 * @returns {string} The sheet name
 */
function getLevelSheetName(level_id, language, difficulty) {
    return `${level_id}_${language}_${difficulty}`;
}

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
 * @param {number} levels_completed - Number of levels completed (optional)
 * @returns {Promise<void>}
 */
async function createOrUpdatePlayer(player_id, player_name, isNewPlayer = false, total_score = 0, global_position = 0, levels_completed = 0) {
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
        
        // Update total_score, global_position, and levels_completed if provided
        if (total_score > 0 || global_position > 0 || levels_completed > 0) {
            // Get current values to only update what's provided
            const currentTotalScore = parseInt(playerCheck.data[4]) || 0;
            const currentGlobalPosition = parseInt(playerCheck.data[5]) || 0;
            const currentLevelsCompleted = parseInt(playerCheck.data[3]) || 0;
            
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${PLAYERS_SHEET}!C${playerCheck.index}:F${playerCheck.index}`,
                valueInputOption: "RAW",
                resource: {
                    values: [[
                        timestamp, // last_record
                        levels_completed > 0 ? levels_completed : currentLevelsCompleted,
                        total_score > 0 ? total_score : currentTotalScore,
                        global_position > 0 ? global_position : currentGlobalPosition
                    ]]
                }
            });
        }
    } else {
        // Create new player
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${PLAYERS_SHEET}!A:F`,
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            resource: {
                values: [[
                    player_id,
                    player_name,
                    timestamp, // created
                    levels_completed || 0,
                    total_score || 0,
                    global_position || 0
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
 * Get all available sheets in the spreadsheet
 * @returns {Promise<string[]>} Array of sheet names
 */
async function getAvailableSheets() {
    const sheets = await authenticateGoogleSheets();
    const response = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID
    });
    
    return response.data.sheets.map(sheet => sheet.properties.title);
}

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
 * Maintain only the latest MAX_LEADERBOARD_ENTRIES entries in a sheet
 * @param {string} sheetName - The name of the sheet to trim
 * @returns {Promise<void>}
 */
async function trimSheetToMaxEntries(sheetName) {
    const sheets = await authenticateGoogleSheets();
    
    // Get all entries from the sheet
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: sheetName
    });
    
    const values = response.data.values || [];
    
    // If we have a header row and more than MAX_LEADERBOARD_ENTRIES entries, trim the sheet
    if (values.length > MAX_LEADERBOARD_ENTRIES + 1) {
        // Get the sheet ID
        const sheetId = await getSheetId(sheetName);
        
        // Keep header row (index 0) and the latest MAX_LEADERBOARD_ENTRIES entries
        // Delete rows from index 1 to values.length - MAX_LEADERBOARD_ENTRIES
        const deleteRequest = {
            deleteDimension: {
                range: {
                    sheetId: sheetId,
                    dimension: "ROWS",
                    startIndex: 1, // Start after header row
                    endIndex: values.length - MAX_LEADERBOARD_ENTRIES // Keep the latest entries
                }
            }
        };
        
        // Execute the delete request
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                requests: [deleteRequest]
            }
        });
        
        console.log(`Trimmed sheet ${sheetName} to ${MAX_LEADERBOARD_ENTRIES} entries`);
    }
}

/**
 * Recalculate global positions for all players
 * @returns {Promise<void>}
 */
async function recalculateGlobalPositions() {
    const sheets = await authenticateGoogleSheets();
    
    // Get all global scores
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: GLOBAL_SCORES_SHEET
    });
    
    const values = response.data.values || [];
    const startIndex = values.length > 0 && values[0][0] === "position_global" ? 1 : 0;
    
    // Format score data
    const scoreMap = new Map(); // Use a map to consolidate scores by player_id
    
    for (let i = startIndex; i < values.length; i++) {
        const row = values[i];
        if (row.length >= 3) {
            const player_id = row[1];
            const score = parseInt(row[3]) || 0; // Updated index for total_score
            
            // Keep only the highest score for each player
            if (!scoreMap.has(player_id) || score > scoreMap.get(player_id).score) {
                scoreMap.set(player_id, {
                    player_id: player_id,
                    score: score,
                    row_index: i + 1 // +1 because sheets are 1-indexed
                });
            }
        }
    }
    
    // Convert map to array and sort by score (descending)
    const playerScores = Array.from(scoreMap.values());
    playerScores.sort((a, b) => b.score - a.score);
    
    // Update positions for all entries
    const updateRequests = [];
    for (let i = 0; i < playerScores.length; i++) {
        const position = i + 1;
        updateRequests.push({
            range: `${GLOBAL_SCORES_SHEET}!A${playerScores[i].row_index}`,
            values: [[position]]
        });
        
        // Also update the player's position in the players sheet
        const playerCheck = await checkPlayerExists(playerScores[i].player_id);
        if (playerCheck.exists) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${PLAYERS_SHEET}!F${playerCheck.index}`, // position_global
                valueInputOption: "RAW",
                resource: {
                    values: [[position]]
                }
            });
        }
    }
    
    // Execute all position updates in a single batch
    if (updateRequests.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                valueInputOption: "RAW",
                data: updateRequests
            }
        });
    }
    
    console.log(`Recalculated global positions for ${playerScores.length} players`);
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
        
        // Get all available sheets
        const availableSheets = response.data.sheets.map(sheet => sheet.properties.title);
        
        res.json({
            success: true,
            message: "Connection successful",
            spreadsheetTitle: response.data.properties.title,
            availableSheets: availableSheets
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
        const { player_id, nickname, total_score, levels_completed = 0 } = req.body;

        // Check for missing fields
        if (!nickname || !total_score) {
            console.error("❌ Missing required fields:", req.body);
            return res.status(400).json({ error: "Missing required fields" });
        }

        const sheets = await authenticateGoogleSheets();
        const timestamp = new Date().toISOString();

        // Add to global_scores sheet with nickname column
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${GLOBAL_SCORES_SHEET}!A:F`, // Updated to include nickname column
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            resource: {
                values: [[0, player_id, nickname, total_score, levels_completed, timestamp]]
            }
        });
        
        // Get all global scores to calculate position
        const scoresResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: GLOBAL_SCORES_SHEET
        });
        
        const scores = scoresResponse.data.values || [];
        const startIndex = scores.length > 0 && scores[0][0] === "position_global" ? 1 : 0;
        
        // Format score data
        const scoreData = [];
        for (let i = startIndex; i < scores.length; i++) {
            const row = scores[i];
            if (row.length >= 4) { // Updated to check for total_score at index 3
                scoreData.push({
                    player_id: row[1],
                    nickname: row[2], // Include nickname
                    score: parseInt(row[3]) || 0 // Updated index for total_score
                });
            }
        }
        
        // Sort by score (descending)
        scoreData.sort((a, b) => b.score - a.score);
        
        // Update positions for all entries
        const updateRequests = [];
        for (let i = 0; i < scoreData.length; i++) {
            const position = i + 1;
            const playerEntry = scoreData[i];
            
            // Find the row index for this player
            let rowIndex = -1;
            for (let j = startIndex; j < scores.length; j++) {
                if (scores[j][1] === playerEntry.player_id && parseInt(scores[j][3]) === playerEntry.score) {
                    rowIndex = j + 1; // +1 because sheets are 1-indexed
                    break;
                }
            }
            
            if (rowIndex > 0) {
                updateRequests.push({
                    range: `${GLOBAL_SCORES_SHEET}!A${rowIndex}`,
                    values: [[position]]
                });
            }
        }
        
        // Execute all position updates in a single batch
        if (updateRequests.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: {
                    valueInputOption: "RAW",
                    data: updateRequests
                }
            });
        }
        
        // Find the current entry's position
        const position = scoreData.findIndex(entry => 
            entry.player_id === player_id && entry.score === total_score
        ) + 1;
        
        // Update player record with total score and position
        if (player_id) {
            await createOrUpdatePlayer(player_id, nickname, false, total_score, position, levels_completed);
        }
        
        // Trim the global scores sheet to keep only the latest entries
        await trimSheetToMaxEntries(GLOBAL_SCORES_SHEET);

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
        const { player_id, nickname, level_id, language, difficulty, score, time = 0 } = req.body;

        // Check for missing fields
        if (!nickname || !level_id || !language || !difficulty || !score) {
            console.error("❌ Missing required fields:", req.body);
            return res.status(400).json({ error: "Missing required fields" });
        }

        const sheets = await authenticateGoogleSheets();
        const timestamp = new Date().toISOString();
        
        // Get the sheet name for this level-language-difficulty combination
        const sheetName = getLevelSheetName(level_id, language, difficulty);
        
        // Check if the sheet exists
        const availableSheets = await getAvailableSheets();
        if (!availableSheets.includes(sheetName)) {
            return res.status(404).json({
                success: false,
                error: `Sheet not found for level ${level_id}, language ${language}, difficulty ${difficulty}`
            });
        }

        // Add to the level-specific sheet
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:E`,
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            resource: {
                values: [[0, player_id, nickname, score, timestamp]]
            }
        });

        // Get all scores for this level to calculate position
        const levelScoresResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: sheetName
        });
        
        const allScores = levelScoresResponse.data.values || [];
        const startIndex = allScores.length > 0 && allScores[0][0] === "position_level" ? 1 : 0;
        
        // Format scores for this level
        const levelScores = [];
        for (let i = startIndex; i < allScores.length; i++) {
            const row = allScores[i];
            if (row.length >= 4) {
                levelScores.push({
                    player_id: row[1],
                    nickname: row[2],
                    score: parseInt(row[3]) || 0,
                    row_index: i + 1 // +1 because sheets are 1-indexed
                });
            }
        }
        
        // Sort by score (descending)
        levelScores.sort((a, b) => b.score - a.score);
        
        // Update positions for all entries
        const updateRequests = [];
        for (let i = 0; i < levelScores.length; i++) {
            const position = i + 1;
            updateRequests.push({
                range: `${sheetName}!A${levelScores[i].row_index}`,
                values: [[position]]
            });
        }
        
        // Execute all position updates in a single batch
        if (updateRequests.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: {
                    valueInputOption: "RAW",
                    data: updateRequests
                }
            });
        }
        
        // Find the current entry's position
        const position = levelScores.findIndex(entry => 
            entry.player_id === player_id && entry.score === score
        ) + 1;
        
        // Trim the level sheet to keep only the latest entries
        await trimSheetToMaxEntries(sheetName);
        
        // Update player's total score and recalculate global position
        if (player_id) {
            await updatePlayerTotalScore(player_id, nickname);
        }

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
 * Update a player's total score based on their best scores across all levels
 * @param {string} player_id - The player ID
 * @param {string} nickname - The player's nickname
 * @returns {Promise<void>}
 */
async function updatePlayerTotalScore(player_id, nickname) {
    try {
        const sheets = await authenticateGoogleSheets();
        
        // Get all available level sheets
        const availableSheets = await getAvailableSheets();
        const levelSheets = availableSheets.filter(sheet => 
            sheet !== PLAYERS_SHEET && 
            sheet !== GLOBAL_SCORES_SHEET &&
            /^\d+_(en|pl|ru)_(easy|normal)$/.test(sheet)
        );
        
        // Get the player's best score for each level
        let totalScore = 0;
        let completedLevels = 0;
        
        for (const sheetName of levelSheets) {
            // Get all scores for this level
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: sheetName
            });
            
            const values = response.data.values || [];
            const startIndex = values.length > 0 && values[0][0] === "position_level" ? 1 : 0;
            
            // Find the player's best score for this level
            let bestScore = 0;
            for (let i = startIndex; i < values.length; i++) {
                const row = values[i];
                if (row.length >= 4 && row[1] === player_id) {
                    const score = parseInt(row[3]) || 0;
                    if (score > bestScore) {
                        bestScore = score;
                    }
                }
            }
            
            // Add to total score if the player has a score for this level
            if (bestScore > 0) {
                totalScore += bestScore;
                completedLevels++;
            }
        }
        
        // Update the player's total score in the players sheet
        const playerCheck = await checkPlayerExists(player_id);
        if (playerCheck.exists) {
            await createOrUpdatePlayer(player_id, nickname, false, totalScore, 0, completedLevels);
        } else {
            await createOrUpdatePlayer(player_id, nickname, true, totalScore, 0, completedLevels);
        }
        
        // Update the global scores sheet with nickname
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${GLOBAL_SCORES_SHEET}!A:F`, // Updated to include nickname column
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            resource: {
                values: [[0, player_id, nickname, totalScore, completedLevels, new Date().toISOString()]]
            }
        });
        
        // Recalculate global positions
        await recalculateGlobalPositions();
        
        return totalScore;
    } catch (error) {
        console.error("Error updating player total score:", error);
        throw error;
    }
}

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
        const startIndex = values.length > 0 && values[0][0] === "position_global" ? 1 : 0;
        
        // Format data for the client
        const scoreMap = new Map(); // Use a map to consolidate scores by player_id
        
        for (let i = startIndex; i < values.length; i++) {
            const row = values[i];
            if (row.length >= 4) { // Updated to check for total_score at index 3
                const player_id = row[1];
                const nickname = row[2]; // Get nickname directly from global scores sheet
                const score = parseInt(row[3]) || 0; // Updated index for total_score
                const levels_completed = parseInt(row[4]) || 0; // Updated index for levels_completed
                const position = parseInt(row[0]) || 0;
                
                // Keep only the highest score for each player
                if (!scoreMap.has(player_id) || score > scoreMap.get(player_id).score) {
                    scoreMap.set(player_id, {
                        position: position,
                        player_id: player_id,
                        nickname: nickname,
                        score: score,
                        levels_completed: levels_completed,
                        timestamp: row.length > 5 ? row[5] : "" // Updated index for timestamp
                    });
                }
            }
        }
        
        // Convert map to array
        let formattedData = Array.from(scoreMap.values());
        
        // Sort by position
        formattedData.sort((a, b) => a.position - b.position);
        
        // Limit to top 100
        const topEntries = formattedData.slice(0, MAX_LEADERBOARD_ENTRIES);
        
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
        
        if (!level_id || !language || !difficulty) {
            return res.status(400).json({
                success: false,
                error: "Missing required parameters: level_id, language, difficulty"
            });
        }
        
        // Get the sheet name for this level-language-difficulty combination
        const sheetName = getLevelSheetName(level_id, language, difficulty);
        
        // Check if the sheet exists
        const availableSheets = await getAvailableSheets();
        if (!availableSheets.includes(sheetName)) {
            return res.status(404).json({
                success: false,
                error: `Sheet not found for level ${level_id}, language ${language}, difficulty ${difficulty}`
            });
        }
        
        const sheets = await authenticateGoogleSheets();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: sheetName
        });
        
        const values = response.data.values || [];
        
        // Skip header row if present
        const startIndex = values.length > 0 && values[0][0] === "position_level" ? 1 : 0;
        
        // Format data for the client
        const formattedData = [];
        
        for (let i = startIndex; i < values.length; i++) {
            const row = values[i];
            if (row.length >= 4) {
                formattedData.push({
                    position: parseInt(row[0]) || 0,
                    player_id: row[1],
                    nickname: row[2],
                    score: parseInt(row[3]) || 0,
                    timestamp: row.length > 4 ? row[4] : ""
                });
            }
        }
        
        // Sort by position
        formattedData.sort((a, b) => a.position - b.position);
        
        // Limit to top 100
        const topEntries = formattedData.slice(0, MAX_LEADERBOARD_ENTRIES);
        
        res.json(topEntries);
    } catch (error) {
        console.error("Level leaderboard error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
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
        
        // Format player data
        const playerData = {
            player_id: playerCheck.data[0],
            player_name: playerCheck.data[1],
            created: playerCheck.data[2],
            levels_completed: parseInt(playerCheck.data[3]) || 0,
            total_score: parseInt(playerCheck.data[4]) || 0,
            position_global: parseInt(playerCheck.data[5]) || 0
        };
        
        // Get player's level scores
        const availableSheets = await getAvailableSheets();
        const levelSheets = availableSheets.filter(sheet => 
            sheet !== PLAYERS_SHEET && 
            sheet !== GLOBAL_SCORES_SHEET &&
            /^\d+_(en|pl|ru)_(easy|normal)$/.test(sheet)
        );
        
        const levelScores = {};
        
        for (const sheetName of levelSheets) {
            // Parse the sheet name to get level, language, and difficulty
            const [level_id, language, difficulty] = sheetName.split("_");
            
            // Get all scores for this level
            const sheets = await authenticateGoogleSheets();
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: sheetName
            });
            
            const values = response.data.values || [];
            const startIndex = values.length > 0 && values[0][0] === "position_level" ? 1 : 0;
            
            // Find the player's best score and position for this level
            let bestScore = 0;
            let position = 0;
            
            for (let i = startIndex; i < values.length; i++) {
                const row = values[i];
                if (row.length >= 4 && row[1] === player_id) {
                    const score = parseInt(row[3]) || 0;
                    if (score > bestScore) {
                        bestScore = score;
                        position = parseInt(row[0]) || 0;
                    }
                }
            }
            
            // Add to level scores if the player has a score for this level
            if (bestScore > 0) {
                levelScores[sheetName] = {
                    level_id,
                    language,
                    difficulty,
                    score: bestScore,
                    position
                };
            }
        }
        
        // Add level scores to player data
        playerData.level_scores = levelScores;
        
        res.json(playerData);
    } catch (error) {
        console.error("Player info error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`TypeFall Leaderboard Server running on port ${PORT}`);
});
