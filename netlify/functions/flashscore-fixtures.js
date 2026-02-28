// Netlify serverless function — FlashScore Fixtures (Scheduled matches)
// Endpoint: /.netlify/functions/flashscore-fixtures  (GET or POST)
// Uses extractify-labs~flashscore-extractor via Apify polling pattern.
// Set APIFY_TOKEN in Netlify environment variables.

const ACTOR_ID = 'extractify-labs~flashscore-extractor';
const POLL_INTERVAL_MS = 5000;
const MAX_RETRIES = 12; // 60 seconds max

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'APIFY_TOKEN environment variable not set. Add it in Netlify → Site settings → Environment variables.' }),
    };
  }

  // Accept dateOffset from query or body (+1 to +7 for upcoming fixtures)
  let dateOffset = 3;
  try {
    const body = JSON.parse(event.body || '{}');
    if (body.dateOffset !== undefined) dateOffset = body.dateOffset;
  } catch (_) {}
  if (event.queryStringParameters?.dateOffset !== undefined) {
    dateOffset = parseInt(event.queryStringParameters.dateOffset) || 3;
  }

  const actorInput = {
    sport: 'football',
    dateOffset,
    status: 'SCHEDULED',
    leagues: [
      'england_premier-league',
      'spain_laliga',
      'italy_serie-a',
      'germany_bundesliga',
      'france_ligue-1',
    ],
    maxItems: 100,
  };

  try {
    // 1. Start the run
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR_ID)}/runs?token=${APIFY_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actorInput),
      }
    );

    if (!startRes.ok) {
      const txt = await startRes.text();
      return {
        statusCode: 502,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Failed to start Apify actor', detail: txt }),
      };
    }

    const startJson = await startRes.json();
    const runId = startJson.data?.id;
    const datasetId = startJson.data?.defaultDatasetId;

    if (!runId) {
      return {
        statusCode: 502,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'No runId returned from Apify' }),
      };
    }

    // 2. Poll until SUCCEEDED
    let attempts = 0;
    while (attempts < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      attempts++;

      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
      );
      const statusJson = await statusRes.json();
      const status = statusJson.data?.status;

      if (status === 'SUCCEEDED') break;
      if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        return {
          statusCode: 503,
          headers: corsHeaders(),
          body: JSON.stringify({ error: `Apify run ${status}` }),
        };
      }
      // RUNNING or READY — keep polling
    }

    // 3. Fetch dataset items
    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&format=json&clean=true`
    );
    const items = await itemsRes.json();

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
    console.error('flashscore-fixtures error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Internal error', detail: err.message }),
    };
  }
};
