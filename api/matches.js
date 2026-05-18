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

  const [ligue1, pl, ucl, laliga, seriea,
    odds_l1, odds_pl, odds_ucl, odds_liga, odds_serie] = await Promise.all([
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=168`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=152`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=175`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=302`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${SPORTS_KEY}&from=${from}&to=${to}&leagueId=207`),
    fetchUrl(`https://api.the-odds-api.com/v4/sports/soccer_france_ligue1/odds/?apiKey=${ODDS_KEY}&regions=eu&markets=h2h&bookmakers=winamax,betclic,unibet&oddsFormat=decimal`),
    fetchUrl(`https://api.the-odds-api.com/v4/sports/soccer_england_premier_league/odds/?apiKey=${ODDS_KEY}&regions=eu&markets=h2h&bookmakers=winamax,betclic,unibet&oddsFormat=decimal`),
    fetchUrl(`https://api.the-odds-api.com/v4/sports/soccer_uefa_champs_league/odds/?apiKey=${ODDS_KEY}&regions=eu&markets=h2h&bookmakers=winamax,betclic,unibet&oddsFormat=decimal`),
    fetchUrl(`https://api.the-odds-api.com/v4/sports/soccer_spain_la_liga/odds/?apiKey=${ODDS_KEY}&regions=eu&markets=h2h&bookmakers=winamax,betclic,unibet&oddsFormat=decimal`),
    fetchUrl(`https://api.the-odds-api.com/v4/sports/soccer_italy_serie_a/odds/?apiKey=${ODDS_KEY}&regions=eu&markets=h2h&bookmakers=winamax,betclic,unibet&oddsFormat=decimal`),
  ]);

  const allMatches = [ligue1, pl, ucl, laliga, seriea]
    .filter(d => d && d.result)
    .flatMap(d => d.result)
    .filter(m => !['FT','AET','PEN','ABD','CANC'].includes(m.event_status));

  // Fusionner toutes les cotes
  const allOdds = [odds_l1, odds_pl, odds_ucl, odds_liga, odds_serie]
    .flatMap(o => Array.isArray(o) ? o : []);

  // Matcher les cotes avec les matchs
  const matchesWithOdds = allMatches.map(m => {
  const normalize = s => s?.toLowerCase()
    .replace(/\s+/g,'')
    .replace(/[^a-z0-9]/g,'')
    .replace('paris saint germain','psg')
    .replace('psg','psg')
    .replace('atletico','atl')
    .replace('manchester','man')
    .replace('internazionale','inter');

  const homeName = normalize(m.event_home_team);
  const awayName = normalize(m.event_away_team);

  const oddsMatch = allOdds.find(o => {
    const oHome = normalize(o.home_team);
    const oAway = normalize(o.away_team);
    return (oHome?.slice(0,6) === homeName?.slice(0,6) && oAway?.slice(0,6) === awayName?.slice(0,6)) ||
           (oHome?.slice(0,6) === awayName?.slice(0,6) && oAway?.slice(0,6) === homeName?.slice(0,6));
  });

  if (oddsMatch) {
    const bookmakers = {};
    oddsMatch.bookmakers?.forEach(bk => {
      const h2h = bk.markets?.find(mk => mk.key === 'h2h');
      if (h2h) {
        bookmakers[bk.key] = {
          home: h2h.outcomes?.find(o => o.name === oddsMatch.home_team)?.price,
          draw: h2h.outcomes?.find(o => o.name === 'Draw')?.price,
          away: h2h.outcomes?.find(o => o.name === oddsMatch.away_team)?.price,
        };
      }
    });
    if(Object.keys(bookmakers).length > 0) m.bookmakers = bookmakers;
  }
  return m;
});

  res.setHeader('Access-Control-Allow-Origin', '*');
console.log('Matched:', matchesWithOdds.filter(m=>m.bookmakers).length, 'sur', matchesWithOdds.length);
console.log('Odds teams:', allOdds.map(o=>o.home_team+' vs '+o.away_team));
console.log('Match teams:', allMatches.slice(0,5).map(m=>m.event_home_team+' vs '+m.event_away_team));
  res.json({ football: { result: matchesWithOdds }, odds: allOdds });
};
