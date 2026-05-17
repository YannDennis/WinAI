const https = require('https');

module.exports = async function(req, res) {
  const API_KEY = process.env.ALL_SPORTS_KEY;
  const today = new Date().toISOString().split('T')[0];

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

  const [football, basketball, tennis] = await Promise.all([
    fetchUrl(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${API_KEY}&from=${today}&to=${today}`),
    fetchUrl(`https://apiv2.allsportsapi.com/basketball/?met=Fixtures&APIkey=${API_KEY}&from=${today}&to=${today}`),
    fetchUrl(`https://apiv2.allsportsapi.com/tennis/?met=Fixtures&APIkey=${API_KEY}&from=${today}&to=${today}`),
  ]);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ football, basketball, tennis });
};
