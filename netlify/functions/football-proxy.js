// ============================================================
// football-proxy.js — Football-Data.org proxy
// Keeps API key server-side. Proxies all FD.org v4 endpoints.
// ============================================================
// Env vars needed:
//   FOOTBALL_DATA_KEY — your football-data.org API key
// ============================================================

const BASE = 'https://api.football-data.org/v4';

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
  const path = params.path; // e.g. "/competitions/PL/standings"

  if (!path) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Missing ?path= parameter' }),
    };
  }

  const API_KEY = process.env.FOOTBALL_DATA_KEY || 'a707e148d9614e688fcc9b248c9961ee';

  const url = `${BASE}${path}`;

  try {
    const res = await fetch(url, {
      headers: {
        'X-Auth-Token': API_KEY,
      },
    });

    const data = await res.json();

    return {
      statusCode: res.status,
      headers: CORS,
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error('football-proxy error:', err);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Upstream API error', message: err.message }),
    };
  }
};
