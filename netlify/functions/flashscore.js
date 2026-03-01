// ============================================================
// flashscore.js — FlashScore live scores via Apify
// Returns today's live/finished/upcoming matches for given leagues
// ============================================================
// Env vars needed:
//   APIFY_TOKEN — your Apify API token
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Apify actor for FlashScore scraping
const ACTOR_ID = 'junglee~flashscore-scraper';
const APIFY_RUN = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST only' }) };
  }

  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'APIFY_TOKEN not configured' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const leagues = body.leagues || [
    'england_premier-league', 'spain_laliga', 'italy_serie-a',
    'germany_bundesliga', 'france_ligue-1'
  ];

  // Build today's date string
  const today = new Date().toISOString().slice(0, 10);

  try {
    const res = await fetch(`${APIFY_RUN}?token=${APIFY_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leagues: leagues,
        date: today,
        maxItems: 100,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Apify error:', res.status, errText);
      return {
        statusCode: res.status,
        headers: CORS,
        body: JSON.stringify({ ok: false, error: `Apify returned ${res.status}` }),
      };
    }

    const items = await res.json();

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ ok: true, items, count: items.length, date: today }),
    };
  } catch (err) {
    console.error('flashscore error:', err);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
