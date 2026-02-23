// Netlify serverless function — football-data.org proxy
// Sits server-side so no CORS issues, keeps API key safe
// Endpoint: /.netlify/functions/football-proxy?path=/v4/competitions/PL/standings

const FD_KEY = 'a5792c6faebf49abaf1a19937fb792dd';
const FD_BASE = 'https://api.football-data.org';

exports.handler = async (event) => {
  const path = event.queryStringParameters?.path || '';

  if (!path.startsWith('/v4/')) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid path. Must start with /v4/' }),
    };
  }

  // Forward any extra query params (dateFrom, dateTo, etc.)
  const qs = { ...event.queryStringParameters };
  delete qs.path;
  const queryString = new URLSearchParams(qs).toString();
  const url = `${FD_BASE}${path}${queryString ? '?' + queryString : ''}`;

  try {
    const response = await fetch(url, {
      headers: { 'X-Auth-Token': FD_KEY },
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
      body: JSON.stringify({ error: 'Proxy fetch failed', detail: err.message }),
    };
  }
};
