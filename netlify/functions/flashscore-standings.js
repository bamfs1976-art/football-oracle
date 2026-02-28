// Netlify serverless function — FlashScore League Standings via Apify
// Endpoint: /.netlify/functions/flashscore-standings  (GET)
// Uses apify~web-scraper or extractify-labs~flashscore-extractor for standings.
// Set APIFY_TOKEN in Netlify environment variables.

const ACTOR_ID = 'extractify-labs~flashscore-extractor';
const POLL_INTERVAL_MS = 5000;
const MAX_RETRIES = 12; // up to 60 seconds

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
      body: JSON.stringify({ error: 'APIFY_TOKEN environment variable not set.' }),
    };
  }

  const actorInput = {
    sport: 'football',
    dataType: 'standings',   // request standings data from the actor
    leagues: [
      'england_premier-league',
      'spain_laliga',
      'italy_serie-a',
      'germany_bundesliga',
      'france_ligue-1',
    ],
    maxItems: 200,
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
        'Cache-Control': 'public, max-age=3600', // cache 1 hour
      },
      body: JSON.stringify({ ok: true, count: Array.isArray(items) ? items.length : 0, items }),
    };

  } catch (err) {
    console.error('flashscore-standings error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Internal error', detail: err.message }),
    };
  }
};
