const https = require('https');

module.exports = async function(req, res) {
  const SPORTS_KEY = process.env.ALL_SPORTS_KEY;
  const ODDS_KEY = process.env.ODDS_API_KEY;
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

  const [ligue1, pl, ucl, laliga, seriea, odds_ligue1, odds_pl] = await Promise.all([
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=168`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=152`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=175`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=302`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=207`),
    fetchUrl(`https://api.the-odds-api.com/v4/sports/soccer_france_ligue1/odds/?apiKey=${ODDS_KEY}&regions=eu&markets=h2h&bookmakers=winamax,betclic,unibet&oddsFormat=decimal`),
    fetchUrl(`https://api.the-odds-api.com/v4/sports/soccer_england_premier_league/odds/?apiKey=${ODDS_KEY}&regions=eu&markets=h2h&bookmakers=winamax,betclic,unibet&oddsFormat=decimal`),
  ]);

  const allMatches = [ligue1, pl, ucl, laliga, seriea]
    .filter(d => d && d.result)
    .flatMap(d => d.result);

  const allOdds = [...(Array.isArray(odds_ligue1) ? odds_ligue1 : []), ...(Array.isArray(odds_pl) ? odds_pl : [])];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ football: { result: allMatches }, odds: allOdds });
};
