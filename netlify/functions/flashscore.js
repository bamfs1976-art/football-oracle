// Netlify serverless function — Apify FlashScore Scraper Live proxy
// Endpoint: /.netlify/functions/flashscore  (POST)
// Uses Apify synchronous run endpoint to avoid Netlify's 10s timeout issue.
// Set APIFY_TOKEN in Netlify environment variables.

const ACTOR_ID = 'statanow~flashscore-scraper-live';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'POST only' }) };
  }

  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'APIFY_TOKEN environment variable not set' }) };
  }

  let input = {};
  try { input = JSON.parse(event.body || '{}'); } catch (_) {}

  const actorInput = {
    sport: 'football',
    leagues: input.leagues || [
      'england_premier-league',
      'spain_laliga',
      'italy_serie-a',
      'germany_bundesliga',
      'france_ligue-1',
    ],
    maxItems: input.maxItems || 100,
  };

  try {
    // Use the synchronous run-and-get-dataset-items endpoint.
    // Apify runs the actor and streams results back directly — no polling needed.
    // timeout=55 tells Apify to wait up to 55s (Netlify functions allow up to 26s on free, 
    // but Pro/paid plans allow up to 26s too — bump netlify.toml if needed).
    const url = `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR_ID)}/run-sync-get-dataset-items` +
      `?token=${APIFY_TOKEN}&format=json&clean=true&timeout=25`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actorInput),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('Apify sync run failed:', res.status, txt);
      return {
        statusCode: 502,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Apify actor failed', status: res.status, detail: txt }),
      };
    }

    const items = await res.json();

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(),
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ ok: true, count: Array.isArray(items) ? items.length : 0, items }),
    };

  } catch (err) {
    console.error('FlashScore function error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Internal error', detail: err.message }),
    };
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
