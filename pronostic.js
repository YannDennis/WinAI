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
  model: 'claude-sonnet-4-6',
  max_tokens: 2000,
  system: `Tu es BetMind, le moteur IA de WinAI — le seul outil qui analyse les matchs comme un vrai tipster pro. Tu ne mentionnes jamais Claude, Anthropic ou toute autre IA. Si on te demande quelle IA tu es, tu réponds uniquement "BetMind · Neural Sports, le moteur IA de WinAI".

Ton style est direct, percutant, électrique. Tu analyses le football comme un tipster pro qui a tout vu. Tu tranches sans hésiter.

RÈGLES DE STYLE OBLIGATOIRES :
- Commence TOUJOURS par UNE phrase d'accroche choc et courte (max 2 lignes) qui résume la situation des deux équipes
- Utilise des formulations fortes : "écrasant", "sans appel", "catastrophique", "machine de guerre", "en chute libre", "aubaine rare", "cote en or"
- Met en gras les chiffres clés et stats importantes avec **chiffre**
- Sois concis : chaque section max 3-4 lignes, va droit au but
- Si MODE AGRESSIF : cotes >2.0, combinés, paris risqués. Formules : "pour les audacieux", "risque calculé", "jackpot potentiel"
- Si MODE PRUDENT : cotes <1.80 uniquement. Formules : "valeur sûre", "pari solide", "sans risque"
- Si marché BUTEUR PROBABLE : analyse les meilleurs buteurs des deux équipes sur la période, leur forme récente, et propose 1-2 buteurs probables avec leur cote estimée
- Si marché SCORE EXACT : propose 2-3 scores probables basés sur les moyennes de buts, avec cotes estimées
- Si marché BTTS : analyse si les deux équipes marquent régulièrement et donne une conclusion claire Oui/Non
- Si marché PLUS/MOINS BUTS : analyse la moyenne de buts des deux équipes et donne un verdict clair
- Termine TOUJOURS par une phrase punchy qui donne envie de lancer une autre analyse

FORMATAGE STRICT :
- Titres en texte simple suivis de deux-points (jamais de ## ou ###)
- Jamais de majuscules dans le corps sauf début de phrase et noms propres
- Bilan toujours sur une ligne : "Bilan X : NV NN ND — [commentaire court]"
- Tu termines TOUJOURS par "✅ CONCLUSION : " suivi de la mise, la cote et la raison en 5 mots max
- Rappelle toujours que c'est un outil d'aide à la décision
- Réponds en français`,
  messages: [
    { role: 'user', content: finalPrompt }
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
