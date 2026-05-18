export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, homeTeamKey, awayTeamKey, hist = 10 } = req.body;

    if (!prompt || prompt.trim().length < 10) {
      return res.status(400).json({ error: 'Prompt invalide ou manquant.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const sportsKey = process.env.ALL_SPORTS_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Clé API manquante.' });

    // Récupérer les vrais matchs des équipes
    let statsContext = '';
    if (sportsKey && homeTeamKey && awayTeamKey) {
      try {
        const today = new Date();
        const toDate = today.toISOString().split('T')[0];
        const fromDate = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const [homeRes, awayRes] = await Promise.all([
          fetch(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${sportsKey}&teamId=${homeTeamKey}&from=${fromDate}&to=${toDate}`),
          fetch(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${sportsKey}&teamId=${awayTeamKey}&from=${fromDate}&to=${toDate}`)
        ]);

        const homeData = await homeRes.json();
        const awayData = await awayRes.json();

        const limit = hist === 0 ? 50 : hist;

        const filterMatches = (data) => {
          if (!data.result) return [];
          return data.result
            .filter(m => ['FT', 'AET', 'PEN'].includes(m.event_status) || (m.event_final_result?.includes('-') && m.event_final_result !== '-'))
            .sort((a, b) => new Date(b.event_date) - new Date(a.event_date))
            .slice(0, limit);
        };

        const homeMatches = filterMatches(homeData);
        const awayMatches = filterMatches(awayData);

        const formatMatches = (matches, teamKey) => {
          return matches.map(m => {
            const isHome = m.home_team_key == teamKey;
            const opponent = isHome ? m.event_away_team : m.event_home_team;
            const score = m.event_final_result || '-';
            const [homeGoals, awayGoals] = score.split(' - ').map(Number);
            let result = 'N';
            if (!isNaN(homeGoals) && !isNaN(awayGoals)) {
              if (isHome) result = homeGoals > awayGoals ? 'V' : homeGoals < awayGoals ? 'D' : 'N';
              else result = awayGoals > homeGoals ? 'V' : awayGoals < homeGoals ? 'D' : 'N';
            }
            const venue = isHome ? 'D' : 'E';
            return `${m.event_date} | ${venue} | vs ${opponent} | ${score} | ${result}`;
          }).join('\n');
        };

        if (homeMatches.length > 0 || awayMatches.length > 0) {
          statsContext = `\n\n=== DONNÉES RÉELLES AllSports API ===\n`;
          if (homeMatches.length > 0) {
            statsContext += `\nDERNIERS MATCHS ÉQUIPE DOMICILE (${limit} max) :\nDate | D/E | Adversaire | Score | Résultat\n${formatMatches(homeMatches, homeTeamKey)}\n`;
          }
          if (awayMatches.length > 0) {
            statsContext += `\nDERNIERS MATCHS ÉQUIPE EXTÉRIEUR (${limit} max) :\nDate | D/E | Adversaire | Score | Résultat\n${formatMatches(awayMatches, awayTeamKey)}\n`;
          }
          statsContext += `\nUtilise UNIQUEMENT ces données réelles pour ton analyse. Ne invente aucune statistique.`;
        }
      } catch (statsErr) {
        console.error('Stats fetch error:', statsErr);
      }
    }

    const finalPrompt = prompt + statsContext;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20251001',
        max_tokens: 1500,
        system: `Tu es BetMind, un moteur d'intelligence artificielle propriétaire spécialisé en pronostics sportifs, développé exclusivement par WinAI. Tu ne mentionnes jamais Claude, Anthropic ou toute autre IA existante. Si on te demande quelle IA tu es, tu réponds uniquement "BetMind · Neural Sports, le moteur IA de WinAI". Tu analyses les matchs de football avec précision et rigueur. Tu donnes des pronostics clairs, structurés et honnêtes. Tu n'utilises JAMAIS de majuscules dans le corps du texte — écris normalement, en minuscules avec majuscules uniquement en début de phrase. Tu n'utilises jamais ## ou ### pour les titres — écris les titres en texte simple suivi de deux-points. Tu termines TOUJOURS ta réponse par une ligne commençant EXACTEMENT par : "✅ CONCLUSION : " suivi de la mise conseillée, la cote et la raison en 5 mots. Tu rappelles toujours après que c'est un outil d'aide à la décision uniquement. Tu réponds en français. Tu es concis et direct.`,
        messages: [
          { role: 'user', content: finalPrompt }
        ],
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
