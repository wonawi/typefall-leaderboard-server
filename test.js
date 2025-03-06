const axios = require("axios");

const SERVER_URL = "https://typefall-leaderboard-server.onrender.com"; // Your API URL

// Test data
const testScore = {
    player_id: "test123",
    player_name: "TestPlayer",
    score: Math.floor(Math.random() * 10000) + 1 // Random score for uniqueness
};

// Function to submit a test score
async function submitScore() {
    try {
        const response = await axios.post(`${SERVER_URL}/submit-score`, testScore, {
            headers: { "Content-Type": "application/json" }
        });
        console.log("✅ Score submitted successfully:", response.data);
    } catch (error) {
        console.error("❌ Error submitting score:", error.response ? error.response.data : error.message);
    }
}

// Function to fetch the leaderboard
async function fetchLeaderboard() {
    try {
        const response = await axios.get(`${SERVER_URL}/leaderboard`);
        console.log("📜 Leaderboard data:", response.data);
    } catch (error) {
        console.error("❌ Error fetching leaderboard:", error.response ? error.response.data : error.message);
    }
}

// Run tests
(async () => {
    console.log("🚀 Testing API Server at:", SERVER_URL);
    await submitScore();
    await fetchLeaderboard();
})();