const https = require('https');

module.exports = async function(req, res) {
  const SPORTS_KEY = process.env.ALL_SPORTS_KEY;
  const today = new Date();
  const from = today.toISOString().split('T')[0];
  const to = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const fromHistory = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  function fetchUrl(url) {
    return new Promise((resolve) => {
      https.get(url, (r) => {
        let data = '';
        r.on('data', chunk => data += chunk);
        r.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch(e) { resolve({ error: data.substring(0,200) }); }
        });
      }).on('error', (e) => resolve({ error: e.message }));
    });
  }

  // Récupérer les fixtures de la semaine
  const [ligue1, pl, ucl, laliga, seriea] = await Promise.all([
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=168`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=152`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=175`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=302`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=207`),
  ]);

  const allMatches = [ligue1, pl, ucl, laliga, seriea]
    .filter(d => d && d.result)
    .flatMap(d => d.result)
    .filter(m => !['FT','AET','PEN','ABD','CANC'].includes(m.event_status));

  // Récupérer l'historique des équipes uniques
  const teamIds = [...new Set(allMatches.flatMap(m => [m.home_team_key, m.away_team_key].filter(Boolean)))];

  // On prend max 20 équipes pour ne pas exploser les requêtes
  const teamsToFetch = teamIds.slice(0, 20);

  const teamHistories = await Promise.all(
    teamsToFetch.map(id =>
      fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&teamId=${id}&from=${fromHistory}&to=${from}`)
        .then(data => ({ id, data }))
    )
  );

  // Calculer les stats de forme pour chaque équipe
  function getTeamStats(teamId, history) {
    if (!history?.result) return { w: 33, d: 33, l: 34, goalsFor: 1.2, goalsAgainst: 1.2, form: 50 };

    const finished = history.result
      .filter(m => ['FT','AET','PEN'].includes(m.event_status) && m.event_final_result?.includes(' - '))
      .slice(0, 10);

    if (finished.length === 0) return { w: 33, d: 33, l: 34, goalsFor: 1.2, goalsAgainst: 1.2, form: 50 };

    let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;

    finished.forEach(m => {
      const isHome = m.home_team_key == teamId;
      const [hg, ag] = m.event_final_result.split(' - ').map(Number);
      const myGoals = isHome ? hg : ag;
      const oppGoals = isHome ? ag : hg;
      goalsFor += myGoals;
      goalsAgainst += oppGoals;
      if (myGoals > oppGoals) wins++;
      else if (myGoals === oppGoals) draws++;
      else losses++;
    });

    const total = finished.length;
    // Pondération récente (derniers matchs comptent plus)
    const recentFinished = finished.slice(0, 5);
    let recentWins = 0;
    recentFinished.forEach(m => {
      const isHome = m.home_team_key == teamId;
      const [hg, ag] = m.event_final_result.split(' - ').map(Number);
      const myGoals = isHome ? hg : ag;
      const oppGoals = isHome ? ag : hg;
      if (myGoals > oppGoals) recentWins++;
    });

    return {
      w: Math.round((wins / total) * 100),
      d: Math.round((draws / total) * 100),
      l: Math.round((losses / total) * 100),
      goalsFor: goalsFor / total,
      goalsAgainst: goalsAgainst / total,
      form: Math.round(((wins * 3 + draws) / (total * 3)) * 100),
      recentForm: Math.round((recentWins / Math.min(5, recentFinished.length)) * 100),
    };
  }

  // Indexer les stats par teamId
  const statsMap = {};
  teamHistories.forEach(({ id, data }) => {
    statsMap[id] = getTeamStats(id, data);
  });

  // Calculer les cotes dynamiques pour chaque match
  function calculateOdds(homeStats, awayStats) {
    // Avantage domicile : +8% de forme
    const homeStrength = (homeStats.form * 1.08 + homeStats.recentForm * 0.5) / 1.5;
    const awayStrength = (awayStats.form * 0.92 + awayStats.recentForm * 0.5) / 1.5;

    const total = homeStrength + awayStrength + 25; // 25 = part du nul

    const pHome = Math.max(0.25, Math.min(0.75, homeStrength / total));
    const pAway = Math.max(0.10, Math.min(0.60, awayStrength / total));
    const pDraw = Math.max(0.15, Math.min(0.35, 1 - pHome - pAway));

    // Normaliser
    const sum = pHome + pDraw + pAway;
    const margin = 1.08; // marge bookmaker 8%

    const coteHome = parseFloat((1 / (pHome / sum) / margin).toFixed(2));
    const coteDraw = parseFloat((1 / (pDraw / sum) / margin).toFixed(2));
    const coteAway = parseFloat((1 / (pAway / sum) / margin).toFixed(2));

    return {
      coteHome: Math.max(1.15, Math.min(8.00, coteHome)),
      coteDraw: Math.max(2.80, Math.min(5.50, coteDraw)),
      coteAway: Math.max(1.15, Math.min(12.00, coteAway)),
      pHome: Math.round((pHome / sum) * 100),
      pDraw: Math.round((pDraw / sum) * 100),
      pAway: Math.round((pAway / sum) * 100),
    };
  }

  // Enrichir les matchs avec les cotes calculées
  const matchesWithOdds = allMatches.map(m => {
    const homeStats = statsMap[m.home_team_key] || { form: 50, recentForm: 50 };
    const awayStats = statsMap[m.away_team_key] || { form: 50, recentForm: 50 };

    const odds = calculateOdds(homeStats, awayStats);

    m.computed_odds = {
      home: odds.coteHome,
      draw: odds.coteDraw,
      away: odds.coteAway,
    };
    m.w = odds.pHome;
    m.d = odds.pDraw;
    m.l = odds.pAway;

    return m;
  });

  res.setHeader('Access-Control-Allow-Origin', '*');
  console.log('Stats sample:', JSON.stringify(Object.entries(statsMap).slice(0,2)));
console.log('Odds sample:', JSON.stringify(matchesWithOdds.slice(0,2).map(m=>({
  home: m.event_home_team,
  away: m.event_away_team,
  computed: m.computed_odds,
  w: m.w
}))));
  res.json({ football: { result: matchesWithOdds }, odds: [] });
};
