const https = require('https');

module.exports = async function(req, res) {
  const API_KEY = process.env.ALL_SPORTS_KEY;
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

  const [ligue1, pl, ucl, laliga, bundesliga, seriea] = await Promise.all([
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${API_KEY}&from=${from}&to=${to}&leagueId=168`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${API_KEY}&from=${from}&to=${to}&leagueId=152`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${API_KEY}&from=${from}&to=${to}&leagueId=175`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${API_KEY}&from=${from}&to=${to}&leagueId=302`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${API_KEY}&from=${from}&to=${to}&leagueId=175`),
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${API_KEY}&from=${from}&to=${to}&leagueId=207`),
  ]);

  const all = [ligue1, pl, ucl, laliga, bundesliga, seriea]
    .filter(d => d && d.result)
    .flatMap(d => d.result);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ football: { result: all } });
};
