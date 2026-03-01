// Flashscore Fixtures Proxy — upcoming matches for Oracle Tips
// POST body: { dateOffset: 3 }  (days ahead to scan)

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

  let dateOffset = 3;
  try {
    const body = JSON.parse(event.body || '{}');
    if (body.dateOffset !== undefined) dateOffset = Math.min(Math.max(parseInt(body.dateOffset) || 3, 1), 7);
  } catch (_) {}

  // Build date range
  const dates = [];
  const now = new Date();
  for (let i = 1; i <= dateOffset; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  try {
    const input = {
      sport: 'football',
      leagues: LEAGUES,
      dateFrom: dates[0],
      dateTo: dates[dates.length - 1],
      includeFormData: true
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

    // Normalize to expected fields
    const normalized = (Array.isArray(items) ? items : []).map(m => ({
      home_team:      m.homeTeam?.name || m.home_team || '',
      away_team:      m.awayTeam?.name || m.away_team || '',
      league:         m.league || m.tournament?.name || '',
      date:           m.startTime || m.date || '',
      status:         m.status || 'scheduled',
      home_form:      m.homeTeam?.form || m.home_form || [],
      away_form:      m.awayTeam?.form || m.away_form || [],
      home_goals_avg: m.homeTeam?.goalsAvg || m.home_goals_avg || 0,
      away_goals_avg: m.awayTeam?.goalsAvg || m.away_goals_avg || 0,
      home_score:     m.homeScore ?? m.home_score ?? null,
      away_score:     m.awayScore ?? m.away_score ?? null
    }));

    return {
      statusCode: 200,
      headers: { ...headers, 'Cache-Control': 'public, max-age=1800' },
      body: JSON.stringify({ ok: true, items: normalized, count: normalized.length, dates })
    };
  } catch (err) {
    console.error('[flashscore-fixtures]', err);
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
