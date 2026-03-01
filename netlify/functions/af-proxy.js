// ============================================================
// af-proxy.js — API-Football proxy (v3.football.api-sports.io)
// Keeps API key server-side. Handles standings, fixtures, status.
// ============================================================
// Env vars needed in Netlify dashboard:
//   API_FOOTBALL_KEY — your API-Football (RapidAPI) key
// ============================================================

const BASE = 'https://v3.football.api-sports.io';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const params = event.queryStringParameters || {};
  const path = params.path;       // e.g. "/standings", "/fixtures", "/status"
  
  if (!path) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Missing ?path= parameter' }),
    };
  }

  // Use env var if set, otherwise fall back to embedded key
  const API_KEY = process.env.API_FOOTBALL_KEY || '047aaa8a05f7ade8abbb4c91bc8dff1f';

  // Build query string from remaining params (exclude 'path')
  const qs = Object.entries(params)
    .filter(([k]) => k !== 'path')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const url = `${BASE}${path}${qs ? '?' + qs : ''}`;

  try {
    const res = await fetch(url, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });

    const data = await res.json();

    // Pass through rate limit headers so frontend can track quota
    const respHeaders = { ...CORS };
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining) respHeaders['X-RateLimit-Remaining'] = remaining;

    return {
      statusCode: res.status,
      headers: respHeaders,
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error('af-proxy error:', err);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Upstream API error', message: err.message }),
    };
  }
};
