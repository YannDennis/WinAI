const https = require('https');

module.exports = async function(req, res) {
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
          catch(e) { resolve({ error: data.substring(0,200) }); }
        });
      }).on('error', (e) => resolve({ error: e.message }));
    });
  }

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

  // Cotes basées sur le classement et league_round
  function computeOdds(m) {
    const homePos = parseInt(m.home_team_standing) || 10;
    const awayPos = parseInt(m.away_team_standing) || 10;
    const totalTeams = 20;

    // Force relative basée sur classement (1er = fort, dernier = faible)
    const homeStr = ((totalTeams - homePos) / totalTeams) * 100 + 8; // +8 avantage domicile
    const awayStr = ((totalTeams - awayPos) / totalTeams) * 100;
    const drawStr = 22;

    const total = homeStr + awayStr + drawStr;
    const pH = homeStr / total;
    const pD = drawStr / total;
    const pA = awayStr / total;

    const margin = 1.08;
    return {
      home: Math.max(1.15, Math.min(8.0, parseFloat((1 / pH / margin).toFixed(2)))),
      draw: Math.max(2.80, Math.min(5.50, parseFloat((1 / pD / margin).toFixed(2)))),
      away: Math.max(1.15, Math.min(12.0, parseFloat((1 / pA / margin).toFixed(2)))),
      w: Math.round(pH * 100),
      d: Math.round(pD * 100),
      l: Math.round(pA * 100),
    };
  }

  const matchesWithOdds = allMatches.map(m => {
    const odds
