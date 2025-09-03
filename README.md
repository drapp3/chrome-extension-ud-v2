# Underdog DFS Assistant - Complete Guide

## What This Extension Does

### 1. **Auto-Detects Your Draft Position**
- Fetches draft data using Underdog's API (`/v2/drafts/{id}`)
- Tries 5 different methods to identify your position:
  1. Checks localStorage for saved entry from previous pick
  2. Looks for `current_user_id` in API response
  3. Checks global user ID from previous drafts
  4. Analyzes existing picks to match snake draft pattern
  5. Monitors when pick button enables (you're on the clock)
- Shows "Pos ?" until detected, then updates to "Pos 3" etc.

### 2. **Tracks Every Pick From Everyone**
- WebSocket interceptor captures all `pick_made` events
- Saves ALL picks to shared PostgreSQL database
- Tracks which player was picked, by whom, at what position
- Database shared across all users (you, friends, everyone using extension)

### 3. **Shows Player Projections**
- **ETR Projections**: Upload CSV via popup (Wed night+)
- **Market Projections**: Calculated from betting odds (Mon-Tue)
- Manual toggle between sources - no automatic switching
- If no projections available, shows "-" instead of number
- Sorts players by projection when available

### 4. **Calculates Exposure Percentages**
- Shows % of total drafts each player appears in
- Updates after every completed draft
- Color-coded: Green (<20%), Yellow (20-30%), Orange (30-50%), Red (>50%)
- Based on ALL drafts in the shared database

### 5. **Team Duplication Warnings**
- Compares your current picks to ALL completed teams
- **⚠️ 4/6** = Orange warning (4 teams with 5+ same players)
- **⚠️ 5/6** = Red flashing warning (5 teams with 5+ same players)
- Only checks after you have 4+ picks

### 6. **Queue Players**
- Click ★ button to queue player in Underdog's system
- Finds player's star button on page and clicks it
- Visual feedback when queued

## Installation

### Backend Setup (Railway)

1. Create account at https://railway.app
2. Create new project
3. Add PostgreSQL database
4. Deploy from GitHub or CLI:

```bash
cd backend
railway init
railway add
railway up
```

5. Set environment variable:
- `SECRET_KEY` = any random string

### Chrome Extension Setup

1. Save all extension files to a folder
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select your folder

## File Structure

```
extension/
├── manifest.json      # Extension config
├── background.js      # Auth token capture, API handler
├── content.js         # Main logic, UI, position detection
├── inject.js          # WebSocket/API interceptor
├── styles.css         # Floating UI styles
├── popup.html         # Settings popup
└── popup.js           # CSV upload handler

backend/
├── app.py            # Flask API
└── requirements.txt  # Python deps
```

## How Each Part Works

### Authentication Flow
1. You log into Underdog normally
2. `background.js` intercepts API calls with `webRequest` API
3. Captures JWT token from Authorization header
4. Stores in memory for API calls

### Position Detection Flow
1. Extract draft ID from URL
2. Call `/v2/drafts/{id}` with captured token
3. Get response with `draft_entries` array
4. Try multiple methods to find which entry is yours
5. Monitor pick button and WebSocket events as fallback

### Pick Tracking Flow
1. `inject.js` intercepts Pusher WebSocket messages
2. Captures `pick_made` events with player data
3. Forwards to `content.js` via postMessage
4. Saves EVERY pick to backend database
5. Updates UI in real-time

### Projection Management
1. Upload ETR CSV through popup
2. Parser looks for specific columns:
   - "Player" → name
   - "UD Projection" → projection value
   - "id" → appearance_id
3. Backend stores in PostgreSQL
4. Toggle between ETR/Market with checkbox

### Duplication Detection
1. After each pick, sends your lineup to backend
2. Compares against ALL completed 6-player teams
3. Counts teams with 5+ matching players
4. Returns count for warning display

## CSV Upload Format

The extension expects ETR CSV with these columns:
- **Player**: Player name (required)
- **UD Projection**: Fantasy points projection (required)
- **id**: Underdog's appearance_id (optional but helpful)
- **Position**: QB/RB/WR/TE (optional)
- **Team**: NFL team (optional)

## Troubleshooting

### "Pos ?" Won't Update
- Make a pick - position detected after
- Refresh page to retry API call
- Check console for detection attempts

### No Projections Showing
- Upload CSV via popup
- Check toggle (ETR vs Market)
- Verify CSV has "UD Projection" column

### Picks Not Saving
- Check Railway logs for errors
- Ensure backend is running
- Verify CORS allows your extension

### Can't Queue Players
- Make sure star buttons visible on page
- Try clicking manually first
- Check if player already queued

## Database Schema

All data stored in PostgreSQL on Railway:

- **players**: Name, projections, appearance_id
- **drafts**: Draft ID, completion status
- **picks**: Every pick from every draft
- **teams**: Completed 6-player lineups for duplication checking

## Multi-User Workflow

1. Everyone installs same extension
2. All connect to same Railway backend
3. Every pick tracked regardless of who makes it
4. Late week users see accumulated exposure data
5. Duplication checks against entire group's teams

The extension is designed to be simple - no complex configuration, just smart tracking of everything happening across all drafts.