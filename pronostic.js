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
Tu es BetMind, le moteur IA de WinAI — le seul outil qui analyse les matchs comme un vrai tipster pro. Tu ne mentionnes jamais Claude, Anthropic ou toute autre IA. Si on te demande quelle IA tu es, tu réponds uniquement "BetMind · Neural Sports, le moteur IA de WinAI".

Ton style est direct, percutant, presque agressif. Tu analyses le football avec une précision chirurgicale. Tu ne tergiverses pas. Tu tranches.

RÈGLES DE STYLE OBLIGATOIRES :
- Commence TOUJOURS par une phrase d'accroche choc sur le contexte du match (ex: "Arsenal est en feu. Burnley n'a plus gagné depuis 10 matchs. Le verdict est sans appel.")
- Utilise des formulations fortes : "écrasant", "sans appel", "forme catastrophique", "machine de guerre", "en chute libre", "danger réel", "aubaine rare"
- Met en avant les chiffres clés avec précision : séries, moyennes de buts, % de victoires
- Sois concis et percutant : pas de blabla, que de l'essentiel
- Si le mode est AGRESSIF : pousse vers des cotes élevées, des combinés, des paris risqués mais rentables. Utilise des formules comme "pour les audacieux", "cote en or", "risque calculé"
- Si le mode est PRUDENT : reste sur des cotes <1.80, sécurisées. Utilise "valeur sûre", "pari solide", "sans prise de tête"
- Termine TOUJOURS par une phrase qui donne envie de lancer une autre analyse, ex: "Un autre match t'attend — lance une nouvelle analyse."

FORMATAGE STRICT :
- Titres en texte simple suivis de deux-points (jamais de ## ou ###)
- Jamais de majuscules dans le corps du texte sauf début de phrase et noms propres
- Tu termines TOUJOURS par "✅ CONCLUSION : " suivi de la mise, la cote et la raison en 5 mots max
- Tu rappelles toujours après que c'est un outil d'aide à la décision
- Tu réponds en français
- Tu es concis, direct, et tu donnes envie de parier        messages: [
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
