// ============================================================
// flashscore-matches.js — FlashScore matches via Apify
// GET endpoint: returns today's matches for top 5 leagues
// Used by the auto-refresh engine for standings/fixture updates
// ============================================================
// Env vars needed:
//   APIFY_TOKEN — your Apify API token
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

const ACTOR_ID = 'junglee~flashscore-scraper';
const APIFY_RUN = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`;

const DEFAULT_LEAGUES = [
  'england_premier-league', 'spain_laliga', 'italy_serie-a',
  'germany_bundesliga', 'france_ligue-1'
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: 'APIFY_TOKEN not configured' }),
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const res = await fetch(`${APIFY_RUN}?token=${APIFY_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leagues: DEFAULT_LEAGUES,
        date: today,
        maxItems: 100,
      }),
    });

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: CORS,
        body: JSON.stringify({ ok: false, error: `Apify returned ${res.status}` }),
      };
    }

    const items = await res.json();

    // Normalise into a standard format the frontend expects
    const matches = items.map(item => ({
      league: item.league || item.tournament || '',
      home_team: item.homeTeam || item.home_team || item.home || '',
      away_team: item.awayTeam || item.away_team || item.away || '',
      home_score: item.homeScore ?? item.home_score ?? null,
      away_score: item.awayScore ?? item.away_score ?? null,
      status: item.status || item.matchStatus || '',
      time: item.time || item.startTime || '',
      date: item.date || today,
    }));

    return {
      statusCode: 200,
      headers: { ...CORS, 'Cache-Control': 'public, max-age=300' },
      body: JSON.stringify({ ok: true, matchesOk: true, items: matches, count: matches.length }),
    };
  } catch (err) {
    console.error('flashscore-matches error:', err);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ ok: false, matchesOk: false, error: err.message }),
    };
  }
};
