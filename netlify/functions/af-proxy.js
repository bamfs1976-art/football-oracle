// Netlify serverless function — API-Football proxy
// Endpoint: /.netlify/functions/af-proxy?path=/fixtures&league=39&season=2025
// All API-Football v3 calls go through here — key never exposed in browser
//
// Auth: api-sports.io direct endpoint uses ONLY x-apisports-key header.
// Do NOT send x-rapidapi-key or x-rapidapi-host — they conflict and cause
// empty responses even when the HTTP status is 200.

const AF_KEY  = '047aaa8a05f7ade8abbb4c91bc8dff1f';
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
        // NOTE: x-rapidapi-host intentionally omitted — sending it alongside
        // x-apisports-key causes the API to return empty response arrays.
      },
    });

    const data = await response.json();

    // Surface API-level errors in logs for easier debugging
    if (data.errors && Object.keys(data.errors).length > 0) {
      console.error('AF API error for', path, JSON.stringify(data.errors));
    }

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store', // always fresh — never cache API responses
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error('AF proxy fetch failed:', err.message);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'AF proxy fetch failed', detail: err.message }),
    };
  }
};
