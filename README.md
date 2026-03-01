# ⚽ Football Oracle — Deployment Guide

## What This Does

Football Oracle automatically refreshes its data every 24 hours once deployed to Netlify. No manual HTML editing required — the app's built-in auto-refresh engine fetches live scores, standings, fixtures, and stats from multiple APIs via serverless proxy functions.

---

## Quick Deploy

### 1. Push to GitHub (or drag-and-drop to Netlify)

```bash
cd football-oracle
git init && git add -A && git commit -m "Initial deploy"
# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USER/football-oracle.git
git push -u origin main
```

### 2. Connect to Netlify

- Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
- Select your GitHub repo
- Build settings are auto-detected from `netlify.toml` (no build command needed)

### 3. Set Environment Variables

In Netlify dashboard → **Site settings** → **Environment variables**, add:

| Variable | Source | Required |
|----------|--------|----------|
| `API_FOOTBALL_KEY` | [RapidAPI API-Football](https://rapidapi.com/api-sports/api/api-football) | ✅ Yes |
| `FOOTBALL_DATA_KEY` | [football-data.org](https://www.football-data.org/client/register) | ✅ Yes |
| `APIFY_TOKEN` | [apify.com](https://console.apify.com/account#/integrations) | ✅ Yes |

### 4. Redeploy

Trigger a redeploy after adding env vars (Deploys → Trigger deploy).

---

## How Auto-Refresh Works

The app contains a sophisticated refresh engine (no cron jobs needed):

| Feature | Behaviour |
|---------|-----------|
| **Scheduled refresh** | Every 24 hours, preferring midnight UTC (when API-Football quota resets) |
| **Quota guard** | Tracks daily API calls (~78 per full refresh). Refuses auto-refresh if ≥90/100 calls used |
| **Visibility refresh** | If user returns after 1+ hour away and data is 6+ hours old, refreshes immediately |
| **Stale indicator** | Amber pulse dot if data >6 hours old; green when fresh |
| **Manual refresh** | Always available via the refresh button |
| **Countdown** | Shows "Next refresh in Xh Ym · 45/100 calls" |

### Data Flow

```
Browser → /.netlify/functions/af-proxy → API-Football (standings, scorers, fixtures)
Browser → /.netlify/functions/football-proxy → football-data.org (competition data)
Browser → /.netlify/functions/flashscore-* → Apify (live scores, form, results)
```

All API keys stay server-side in the Netlify functions. The browser never sees them.

---

## Serverless Functions

| Function | Method | Purpose |
|----------|--------|---------|
| `af-proxy` | GET | Proxies all API-Football v3 endpoints |
| `football-proxy` | GET | Proxies football-data.org v4 API |
| `flashscore` | POST | Live scores for today (top 5 leagues) |
| `flashscore-matches` | GET | Today's matches for auto-refresh |
| `flashscore-standings` | GET | Current league tables (all 5 leagues) |
| `flashscore-fixtures` | POST | Upcoming fixtures for Oracle Tips |
| `flashscore-history` | POST | Recent results for Weekend Wrap |

---

## Project Structure

```
football-oracle/
├── index.html                          # Main app (single-file, ~7000 lines)
├── netlify.toml                        # Netlify config + security headers
├── README.md                           # This file
└── netlify/
    └── functions/
        ├── af-proxy.js                 # API-Football proxy
        ├── football-proxy.js           # Football-Data.org proxy
        ├── flashscore.js               # Live scores (POST)
        ├── flashscore-matches.js       # Today's matches (GET)
        ├── flashscore-standings.js     # League tables (GET)
        ├── flashscore-fixtures.js      # Upcoming fixtures (POST)
        └── flashscore-history.js       # Recent results (POST)
```

---

## API Limits

| API | Free Tier | Notes |
|-----|-----------|-------|
| API-Football | 100 calls/day | Resets at midnight UTC |
| football-data.org | 10 calls/min | Very generous daily limit |
| Apify | 5 USD free credit/month | ~$0.01 per FlashScore run |

The app uses ~78 API-Football calls per full refresh, leaving headroom for 1 auto-refresh per day plus manual refreshes.

---

## Testing Locally

```bash
npm install -g netlify-cli
cd football-oracle

# Set env vars for local dev
export API_FOOTBALL_KEY="your-key"
export FOOTBALL_DATA_KEY="your-key"
export APIFY_TOKEN="your-token"

netlify dev
# Opens at http://localhost:8888
```

---

## Troubleshooting

- **Amber pulse dot won't go green**: Check Netlify function logs for API errors. Likely an env var is missing.
- **"Quota exhausted"**: Wait for midnight UTC or use the manual refresh (it overrides the quota guard for a single refresh).
- **FlashScore data empty**: Apify actor may have changed schema. Check function logs in Netlify dashboard.
- **CORS errors**: Functions include `Access-Control-Allow-Origin: *`. If issues persist, check `netlify.toml` headers.
