const https = require('https');

exports.handler = async function(event, context) {
  const API_KEY = '713c0b1dc923292c158451123c1e301c50ac2e09dba4b3bf6c6959c983510a2d';
  const today = new Date().toISOString().split('T')[0];
  
  const urls = [
    `https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${API_KEY}&from=${today}&to=${today}`,
    `https://apiv2.allsportsapi.com/basketball/?met=Fixtures&APIkey=${API_KEY}&from=${today}&to=${today}`,
    `https://apiv2.allsportsapi.com/tennis/?met=Fixtures&APIkey=${API_KEY}&from=${today}&to=${today}`,
  ];

  function fetchUrl(url) {
    return new Promise((resolve) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
      }).on('error', () => resolve(null));
    });
  }

  try {
    const [football, basketball, tennis] = await Promise.all(urls.map(fetchUrl));
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ football, basketball, tennis })
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
