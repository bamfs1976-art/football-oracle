// Netlify serverless function — API-Football proxy
// Endpoint: /.netlify/functions/af-proxy?path=/fixtures&league=39&season=2025
// All API-Football v3 calls go through here — key never exposed in browser

const AF_KEY  = 'feaf41f2026c5d8b1a2256a52b7c2061';
const AF_BASE = 'https://v3.football.api-sports.io';

exports.handler = async (event) => {
  const qs   = { ...event.queryStringParameters };
  const path = qs.path || '';
  delete qs.path;

  if (!path || !path.startsWith('/')) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing or invalid path param' }),
    };
  }

  const queryString = new URLSearchParams(qs).toString();
  const url = `${AF_BASE}${path}${queryString ? '?' + queryString : ''}`;

  try {
    const response = await fetch(url, {
      headers: {
        'x-apisports-key': AF_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io',
      },
    });

    const data = await response.json();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'AF proxy fetch failed', detail: err.message }),
    };
  }
};
