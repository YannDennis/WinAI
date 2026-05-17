exports.handler = async function(event, context) {
  const today = new Date().toISOString().split('T')[0];
  const API_KEY = process.env.API_FOOTBALL_KEY;
  
  try {
    const res = await fetch(`https://v3.football.api-sports.io/fixtures?date=${today}&timezone=Europe/Paris`, {
      method: 'GET',
      headers: {
        'x-apisports-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io'
      }
    });
    const data = await res.json();
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    };
  } catch(e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
