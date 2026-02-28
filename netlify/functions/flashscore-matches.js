// Netlify serverless function — FlashScore Matches (Results + Fixtures)
// Endpoint: /.netlify/functions/flashscore-matches  (GET)
// Fetches recent results (last 7 days) and upcoming fixtures (next 7 days)
// via two parallel Apify runs, then merges the datasets.
// Set APIFY_TOKEN in Netlify environment variables.

const ACTOR_ID = 'extractify-labs~flashscore-extractor';
const POLL_INTERVAL_MS = 5000;
const MAX_RETRIES = 12;

const LEAGUES = [
  'england_premier-league',
  'spain_laliga',
  'italy_serie-a',
  'germany_bundesliga',
  'france_ligue-1',
];

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

async function startRun(APIFY_TOKEN, actorInput) {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR_ID)}/runs?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actorInput),
    }
  );
  if (!res.ok) throw new Error(`Start run failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return { runId: json.data?.id, datasetId: json.data?.defaultDatasetId };
}

async function pollUntilDone(APIFY_TOKEN, runId) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
    const json = await res.json();
    const status = json.data?.status;
    if (status === 'SUCCEEDED') return true;
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Apify run ${status}`);
    }
  }
  throw new Error('Max retries exceeded waiting for Apify run');
}

async function fetchDataset(APIFY_TOKEN, datasetId) {
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&format=json&clean=true`
  );
  return res.json();
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

  try {
    // Launch two runs in parallel: recent results + upcoming fixtures
    const [resultsRun, fixturesRun] = await Promise.all([
      startRun(APIFY_TOKEN, {
        sport: 'football',
        dateOffset: -7,          // last 7 days
        status: 'FINISHED',
        leagues: LEAGUES,
        maxItems: 100,
      }),
      startRun(APIFY_TOKEN, {
        sport: 'football',
        dateOffset: 7,           // next 7 days
        status: 'SCHEDULED',
        leagues: LEAGUES,
        maxItems: 100,
      }),
    ]);

    // Poll both runs in parallel
    await Promise.all([
      pollUntilDone(APIFY_TOKEN, resultsRun.runId),
      pollUntilDone(APIFY_TOKEN, fixturesRun.runId),
    ]);

    // Fetch both datasets in parallel
    const [results, fixtures] = await Promise.all([
      fetchDataset(APIFY_TOKEN, resultsRun.datasetId),
      fetchDataset(APIFY_TOKEN, fixturesRun.datasetId),
    ]);

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(),
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900', // cache 15 min
      },
      body: JSON.stringify({
        ok: true,
        results: Array.isArray(results) ? results : [],
        fixtures: Array.isArray(fixtures) ? fixtures : [],
        count: (Array.isArray(results) ? results.length : 0) + (Array.isArray(fixtures) ? fixtures.length : 0),
      }),
    };

  } catch (err) {
    console.error('flashscore-matches error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Internal error', detail: err.message }),
    };
  }
};
