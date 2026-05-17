export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt } = req.body;

    if (!prompt || prompt.trim().length < 10) {
      return res.status(400).json({ error: 'Prompt invalide ou manquant.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Clé API manquante.' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: `Tu es WinAI, un expert en pronostics sportifs. Tu analyses les matchs de football avec précision et rigueur. Tu donnes des pronostics clairs, structurés et honnêtes. Tu termines TOUJOURS ta réponse par une ligne commençant EXACTEMENT par ces caractères : "✅ CONCLUSION : " suivi de la mise conseillée, la cote et la raison en 5 mots. Exemple : "✅ CONCLUSION : Mise sur Brest @ 1.72 — solide à domicile." Tu rappelles toujours après que c'est un outil d'aide à la décision uniquement. Tu réponds en français. Tu es concis et direct.`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Erreur API Anthropic.' });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return res.status(200).json({ result: text });

  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur : ' + err.message });
  }
}
