# TypeFall Leaderboard Server

A Node.js server that provides leaderboard functionality for the TypeFall game using Google Sheets as a backend database.

## Version 2.0.0

This major release includes:
- Complete API for global and level-specific leaderboards
- Improved error handling and diagnostics
- Authentication with Google Sheets API using service account
- CORS support for cross-origin requests

## Overview

This server acts as a middleware between the TypeFall game and Google Sheets, allowing players to submit scores and view leaderboards. It uses a service account to authenticate with the Google Sheets API and provides endpoints for submitting and retrieving scores.

## Setup

### Prerequisites

- Node.js 16 or higher
- A Google Cloud project with the Google Sheets API enabled
- A service account with access to the Google Sheets API
- A Google Sheets spreadsheet with the appropriate structure

### Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Set up environment variables (see below)
4. Start the server:
   ```
   npm start
   ```

### Environment Variables

The server requires the following environment variable:

- `GOOGLE_SERVICE_ACCOUNT_JSON`: The JSON credentials for the Google service account, stringified.
- `PORT` (optional): The port to run the server on. Defaults to 3000.

### Google Sheets Structure

The server expects a Google Sheets spreadsheet with the following sheets:

1. **global_scores**: For overall game scores
   - Columns: player_id, player_name, score, timestamp

2. **level_scores**: For level-specific scores
   - Columns: player_id, player_name, level_id, language, difficulty, score, timestamp

## API Endpoints

### Test Endpoints

- `GET /`: Simple test to check if the server is running
- `GET /test-connection`: Test connection to Google Sheets
- `GET /check-credentials`: Check the format of the service account credentials
- `GET /test-auth`: Test authentication with Google Sheets API

### Leaderboard Endpoints

- `POST /global-score`: Submit a global score
  - Request body: `{ "player_id": "string", "player_name": "string", "score": number }`

- `POST /level-score`: Submit a level-specific score
  - Request body: `{ "player_id": "string", "player_name": "string", "level_id": "string", "language": "string", "difficulty": "string", "score": number }`

- `GET /global-leaderboard`: Get the global leaderboard
  - Returns an array of scores sorted by highest score

- `GET /level-leaderboard`: Get a level-specific leaderboard
  - Query parameters: `level_id` (required), `language` (optional), `difficulty` (optional)
  - Returns an array of scores for the specified level, filtered by language and difficulty if provided

- `GET /leaderboard`: Legacy endpoint for backward compatibility
  - Returns the global leaderboard in a different format

## Deployment

### Render.com

This server is designed to be deployed on Render.com:

1. Create a new Web Service on Render
2. Connect your repository
3. Set the build command to `npm install`
4. Set the start command to `npm start`
5. Add the environment variables
6. Deploy the service

### Google Sheets Permissions

Make sure to share the Google Sheets spreadsheet with the service account email address (visible in the `/check-credentials` response) and give it edit permissions.

## Error Handling

The server includes comprehensive error handling:

- All endpoints return appropriate HTTP status codes
- Error responses include detailed information about the error
- The server logs errors to the console for debugging

## Security Considerations

- The server uses CORS to allow cross-origin requests
- The service account credentials are stored as an environment variable
- The server only exposes the necessary endpoints for the game
- Authentication tokens are never exposed in responses
