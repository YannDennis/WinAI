const https = require('https');

exports.handler = async function(event, context) {
  return new Promise((resolve) => {
    https.get('https://www.thesportsdb.com/api/v1/json/3/eventsdaynow.php?sport=Soccer', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: 200,
          headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
          body: data
        });
      });
    }).on('error', (e) => {
      resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) });
    });
  });
};
