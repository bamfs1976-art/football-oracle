// Flashscore History Proxy — recent results for Weekend Wrap
// POST body: { dateOffset: -1 }  (days back to scan, negative)

const APIFY_BASE = 'https://api.apify.com/v2';
const ACTOR_ID  = 'junglee~flashscore-scraper';

const LEAGUES = [
  'england/premier-league',
  'spain/laliga',
  'italy/serie-a',
  'germany/bundesliga',
  'france/ligue-1'
];

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'POST only' }) };

  const token = process.env.APIFY_TOKEN;
  if (!token) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Missing APIFY_TOKEN' }) };

  let daysBack = 1;
  try {
    const body = JSON.parse(event.body || '{}');
    if (body.dateOffset !== undefined) daysBack = Math.min(Math.max(Math.abs(parseInt(body.dateOffset) || 1), 1), 7);
  } catch (_) {}

  // Build date range going backwards
  const now = new Date();
  const dates = [];
  for (let i = daysBack; i >= 1; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  // Also include today for any finished matches
  dates.push(now.toISOString().slice(0, 10));

  try {
    const input = {
      sport: 'football',
      leagues: LEAGUES,
      dateFrom: dates[0],
      dateTo: dates[dates.length - 1],
      includeFormData: false
    };

    const runUrl = `${APIFY_BASE}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}&timeout=60`;
    const res = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apify ${res.status}: ${text.slice(0, 200)}`);
    }

    const items = await res.json();

    // Normalize and filter to finished matches
    const normalized = (Array.isArray(items) ? items : []).map(m => ({
      home_team:  m.homeTeam?.name || m.home_team || '',
      away_team:  m.awayTeam?.name || m.away_team || '',
      league:     m.league || m.tournament?.name || '',
      date:       m.startTime || m.date || '',
      status:     (m.status || '').toLowerCase(),
      home_score: parseInt(m.homeScore ?? m.home_score) || 0,
      away_score: parseInt(m.awayScore ?? m.away_score) || 0,
      home_form:  m.homeTeam?.form || m.home_form || [],
      away_form:  m.awayTeam?.form || m.away_form || []
    })).filter(m => {
      const s = m.status;
      return s === 'ft' || s === 'finished' || s === 'aet' || s === 'pen';
    });

    return {
      statusCode: 200,
      headers: { ...headers, 'Cache-Control': 'public, max-age=600' },
      body: JSON.stringify({ ok: true, items: normalized, count: normalized.length, dates })
    };
  } catch (err) {
    console.error('[flashscore-history]', err);
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
