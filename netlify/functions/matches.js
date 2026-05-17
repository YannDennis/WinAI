exports.handler = async function(event, context) {
  try {
    const res = await fetch('https://www.thesportsdb.com/api/v1/json/3/eventsdaynow.php?sport=Soccer');
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
