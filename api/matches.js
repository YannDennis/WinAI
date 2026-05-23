const https = require('https');

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Test endpoint — ?debug=leagues
  if (req.query?.debug === 'leagues') {
    try {
      const data = await new Promise((resolve) => {
        https.get(
          'https://apiv2.allsportsapi.com/football/?met=Leagues&APIkey=713c0b1dc923292c158451123c1e301c50ac2e09dba4b3bf6c6959c983510a2d',
          (r) => {
            let raw = '';
            r.on('data', chunk => raw += chunk);
            r.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { resolve(null); } });
          }
        ).on('error', () => resolve(null));
      });

      if (data?.result) {
        console.log('=== ALLSPORTS LEAGUES ===');
        data.result.forEach(l => {
          console.log(`ID: ${l.league_key} | ${l.league_name} | Pays: ${l.country_name}`);
        });
        console.log(`=== TOTAL: ${data.result.length} ligues ===`);
      } else {
        console.log('AllSports Leagues: pas de résultat', data);
      }

      return res.status(200).json(data);
    } catch (e) {
      console.error('Debug leagues error:', e);
      return res.status(500).json({ error: e.message });
    }
  }


  const SPORTS_KEY = process.env.ALL_SPORTS_KEY;
  const today = new Date();
  const from = today.toISOString().split('T')[0];
  const to = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  function fetchUrl(url) {
    return new Promise((resolve) => {
      https.get(url, (r) => {
        let data = '';
        r.on('data', chunk => data += chunk);
        r.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch(e) { resolve(null); }
        });
      }).on('error', () => resolve(null));
    });
  }

  const LEAGUES = [
    { id: 168 }, // Ligue 1
    { id: 152 }, // Premier League
    { id: 175 }, // Champions League
    { id: 302 }, // La Liga
    { id: 207 }, // Serie A
  ];

  // Fetch fixtures + standings for all leagues in one shot
  const calls = LEAGUES.flatMap(l => [
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=${l.id}`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Standings&APIkey=${SPORTS_KEY}&leagueId=${l.id}`),
  ]);

  const results = await Promise.all(calls);

  const standingsMap = {};
  const rawMatches = [];

  LEAGUES.forEach((l, i) => {
    const fixtures  = results[i * 2];
    const standings = results[i * 2 + 1];
    standingsMap[l.id] = standings?.result || [];

    if (fixtures?.result) {
      fixtures.result
        .filter(m => !['FT', 'AET', 'PEN', 'ABD', 'CANC'].includes(m.event_status))
        .forEach(m => rawMatches.push({ ...m, league_id: l.id }));
    }
  });

  // Fetch H2H for each unique match pair in parallel
  const seen = new Set();
  const h2hMap = {};
  const h2hCalls = rawMatches
    .filter(m => {
      const key = `${m.home_team_key}_${m.away_team_key}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(async m => {
      const key = `${m.home_team_key}_${m.away_team_key}`;
      const data = await fetchUrl(
        `https://apiv2.allsportsapi.com/football/?met=H2H&APIkey=${SPORTS_KEY}&firstTeamId=${m.home_team_key}&secondTeamId=${m.away_team_key}`
      );
      h2hMap[key] = (data?.result?.H2H || []).slice(0, 5);
    });

  await Promise.all(h2hCalls);

  const allMatches = rawMatches.map(m => ({
    ...m,
    standings: standingsMap[m.league_id] || [],
    h2h: h2hMap[`${m.home_team_key}_${m.away_team_key}`] || [],
  }));

  res.json({ football: { result: allMatches }, odds: [] });
};
