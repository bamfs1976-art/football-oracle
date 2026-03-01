// ============================================================
// flashscore-standings.js — FlashScore standings via Apify
// GET endpoint: returns current league tables for top 5 leagues
// ============================================================
// Env vars needed:
//   APIFY_TOKEN — your Apify API token
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

const ACTOR_ID = 'junglee~flashscore-scraper';
const APIFY_RUN = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`;

const LEAGUE_MAP = {
  'england_premier-league': 'pl',
  'spain_laliga': 'laliga',
  'italy_serie-a': 'seriea',
  'germany_bundesliga': 'bundesliga',
  'france_ligue-1': 'ligue1',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: 'APIFY_TOKEN not configured' }),
    };
  }

  try {
    const leagues = Object.keys(LEAGUE_MAP);
    
    const res = await fetch(`${APIFY_RUN}?token=${APIFY_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leagues: leagues,
        scrapeType: 'standings',
        maxItems: 200,
      }),
    });

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: CORS,
        body: JSON.stringify({ ok: false, error: `Apify returned ${res.status}` }),
      };
    }

    const items = await res.json();

    // Group by league for easier frontend consumption
    const standings = {};
    for (const [fsLeague, key] of Object.entries(LEAGUE_MAP)) {
      standings[key] = items
        .filter(item => {
          const l = (item.league || item.tournament || '').toLowerCase();
          return l.includes(fsLeague.split('_')[1]) || l.includes(key);
        })
        .map(item => ({
          pos: item.position || item.rank || 0,
          team: item.team || item.teamName || '',
          p: item.played || item.matches || 0,
          w: item.wins || item.won || 0,
          d: item.draws || item.drawn || 0,
          l: item.losses || item.lost || 0,
          gf: item.goalsFor || item.scored || 0,
          ga: item.goalsAgainst || item.conceded || 0,
          gd: item.goalDifference || item.gd || 0,
          pts: item.points || item.pts || 0,
          form: item.form || '',
        }))
        .sort((a, b) => a.pos - b.pos);
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Cache-Control': 'public, max-age=3600' },
      body: JSON.stringify({ ok: true, standingsOk: true, standings }),
    };
  } catch (err) {
    console.error('flashscore-standings error:', err);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ ok: false, standingsOk: false, error: err.message }),
    };
  }
};
