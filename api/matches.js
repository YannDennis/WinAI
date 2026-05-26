const https = require('https');

// Log the first 50 AllSports leagues at cold-start
(function logLeagues() {
  https.get(
    'https://apiv2.allsportsapi.com/football/?met=Leagues&APIkey=713c0b1dc923292c158451123c1e301c50ac2e09dba4b3bf6c6959c983510a2d',
    (r) => {
      let raw = '';
      r.on('data', chunk => raw += chunk);
      r.on('end', () => {
        try {
          const data = JSON.parse(raw);
          const leagues = (data?.result || []).slice(0, 50);
          console.log('=== ALLSPORTS — 50 premières ligues ===');
          leagues.forEach((l, i) => {
            console.log(`[${String(i + 1).padStart(2, '0')}] ID: ${l.league_key} | ${l.league_name} | ${l.country_name}`);
          });
          console.log('=== FIN LISTE LIGUES ===');
        } catch (e) {
          console.error('logLeagues parse error:', e.message);
        }
      });
    }
  ).on('error', e => console.error('logLeagues fetch error:', e.message));
})();

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
  const from = new Date(today.getTime() - 24*60*60*1000).toISOString().split('T')[0]; // hier
  const to   = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // +10 jours

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
    { id: 3 },   // Champions League
    { id: 302 }, // La Liga
    { id: 207 }, // Serie A
    { id: 175 }, // Bundesliga
    { id: 164 }, // Ligue 2
    { id: 153 }, // Championship
    { id: 4 },   // Europa League
    { id: 683 }, // Conference League
    { id: 171 }, // Bundesliga 2
    { id: 206 }, // Serie B
    { id: 301 }, // Segunda Division
    { id: 266 }, // Liga Portugal
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
        .filter(m => {
          const s = (m.event_status || '').toLowerCase();
          if (!s) return true;
          return !['ft','aet','pen','abd','canc','finished','postponed','suspended','interrupted','cancelled'].some(x => s === x || s.startsWith(x));
        })
        .forEach(m => rawMatches.push({ ...m, league_id: l.id }));
    }
  });

  // Dédoublonnage par event_key
  const seenEvents = new Set();
  const uniqueMatches = rawMatches.filter(m => {
    if (seenEvents.has(m.event_key)) return false;
    seenEvents.add(m.event_key);
    return true;
  });

  // Fetch player photos + team banners from TheSportsDB (en parallèle, 1 paire par équipe unique)
  const teamPhotoMap = {};
  const teamBannerMap = {};
  const uniqueTeams = new Set();
  uniqueMatches.forEach(m => {
    if (m.event_home_team) uniqueTeams.add(m.event_home_team);
    if (m.event_away_team) uniqueTeams.add(m.event_away_team);
  });
  await Promise.all([...uniqueTeams].map(async team => {
    const enc = encodeURIComponent(team);
    const [playerData, teamData] = await Promise.all([
      fetchUrl(`https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?t=${enc}`),
      fetchUrl(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${enc}`),
    ]);
    const photo = playerData?.player?.[0]?.strThumb || null;
    if (photo) teamPhotoMap[team] = photo;
    const banner = teamData?.teams?.[0]?.strStadiumThumb || teamData?.teams?.[0]?.strTeamBanner || null;
    if (banner) teamBannerMap[team] = banner;
  }));

  // Fetch H2H for each unique match pair in parallel
  const seen = new Set();
  const h2hMap = {};
  const h2hCalls = uniqueMatches
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

  const allMatches = uniqueMatches.map(m => ({
    ...m,
    standings: standingsMap[m.league_id] || [],
    h2h: h2hMap[`${m.home_team_key}_${m.away_team_key}`] || [],
    home_player_photo: teamPhotoMap[m.event_home_team] || null,
    away_player_photo: teamPhotoMap[m.event_away_team] || null,
    home_team_banner: teamBannerMap[m.event_home_team] || null,
    away_team_banner: teamBannerMap[m.event_away_team] || null,
  }));

  console.log('LEAGUES TEST:', JSON.stringify(allMatches.slice(0,3).map(m=>({league:m.league_name, leagueId:m.league_key}))));
  res.json({ football: { result: allMatches }, odds: [] });
};
