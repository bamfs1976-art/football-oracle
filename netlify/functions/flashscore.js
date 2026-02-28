// Netlify serverless function — Apify FlashScore Scraper Live proxy
// Endpoint: /.netlify/functions/flashscore  (POST)
// Body: { leagueId: "england_premier-league" }  — optional, defaults to all top 5

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID    = 'statanow~flashscore-scraper-live';
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS        = 24; // 2 minutes max

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'POST only' }) };
  }

  if (!APIFY_TOKEN) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'APIFY_TOKEN environment variable not set' }) };
  }

  let input = {};
  try { input = JSON.parse(event.body || '{}'); } catch (_) {}

  // Build Apify actor run input
  // The actor accepts sport/league filters — default to all top 5 leagues
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
    // 1. Start the actor run
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR_ID)}/runs?token=${APIFY_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actorInput),
      }
    );

    if (!runRes.ok) {
      const txt = await runRes.text();
      console.error('Apify run start failed:', runRes.status, txt);
      return {
        statusCode: 502,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Failed to start Apify actor', detail: txt }),
      };
    }

    const runData = await runRes.json();
    const runId      = runData.data?.id;
    const datasetId  = runData.data?.defaultDatasetId;

    if (!runId || !datasetId) {
      return {
        statusCode: 502,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'No runId/datasetId from Apify', raw: runData }),
      };
    }

    // 2. Poll until SUCCEEDED (or timeout)
    let succeeded = false;
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_INTERVAL_MS);

      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
      );
      const statusData = await statusRes.json();
      const status = statusData.data?.status;

      if (status === 'SUCCEEDED') { succeeded = true; break; }
      if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        return {
          statusCode: 502,
          headers: corsHeaders(),
          body: JSON.stringify({ error: `Apify run ${status}`, runId }),
        };
      }
    }

    if (!succeeded) {
      return {
        statusCode: 504,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Apify run timed out waiting for results', runId }),
      };
    }

    // 3. Fetch dataset items
    const dataRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&format=json&clean=true`
    );
    const items = await dataRes.json();

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(),
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ ok: true, count: items.length, items }),
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
