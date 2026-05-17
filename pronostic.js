// ============================================================
//  WinAI · Netlify Function · /api/pronostic
//  Appelle Claude pour générer un pronostic IA
// ============================================================

exports.handler = async (event) => {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { prompt } = JSON.parse(event.body || '{}');

    if (!prompt || prompt.trim().length < 10) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Prompt invalide ou manquant.' }),
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Clé API manquante.' }),
      };
    }

    // Appel Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        system: `Tu es WinAI, un expert en pronostics sportifs. Tu analyses les matchs de football avec précision et rigueur.
Tu donnes des pronostics clairs, structurés et honnêtes.
Tu rappelles toujours en fin de réponse que c'est un outil d'aide à la décision uniquement.
Tu réponds en français. Tu es concis et direct.`,
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Anthropic API error:', err);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: err.error?.message || 'Erreur API Anthropic.' }),
      };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ result: text }),
    };

  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erreur serveur : ' + err.message }),
    };
  }
};
