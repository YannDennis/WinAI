export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, homeTeamKey, awayTeamKey, hist = 10, leagueId } = req.body;

    if (!prompt || prompt.trim().length < 10) {
      return res.status(400).json({ error: 'Prompt invalide ou manquant.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const sportsKey = process.env.ALL_SPORTS_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Clé API manquante.' });

    // Récupérer les vrais matchs, H2H et classement en parallèle
    let statsContext = '';
    if (sportsKey && homeTeamKey && awayTeamKey) {
      try {
        const today = new Date();
        const toDate = today.toISOString().split('T')[0];
        const fromDate = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const apiCalls = [
          fetch(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${sportsKey}&teamId=${homeTeamKey}&from=${fromDate}&to=${toDate}`),
          fetch(`https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${sportsKey}&teamId=${awayTeamKey}&from=${fromDate}&to=${toDate}`),
          fetch(`https://apiv2.allsportsapi.com/football/?met=H2H&APIkey=${sportsKey}&firstTeamId=${homeTeamKey}&secondTeamId=${awayTeamKey}`),
        ];
        if (leagueId) {
          apiCalls.push(fetch(`https://apiv2.allsportsapi.com/football/?met=Standings&APIkey=${sportsKey}&leagueId=${leagueId}`));
        }

        const responses = await Promise.all(apiCalls);
        const [homeData, awayData, h2hData, standingsData] = await Promise.all(responses.map(r => r.json().catch(() => null)));

        const limit = hist === 0 ? 50 : hist;

        const filterMatches = (data) => {
          if (!data?.result) return [];
          return data.result
            .filter(m => ['FT', 'AET', 'PEN'].includes(m.event_status) || (m.event_final_result?.includes('-') && m.event_final_result !== '-'))
            .sort((a, b) => new Date(b.event_date) - new Date(a.event_date))
            .slice(0, limit);
        };

        const homeMatches = filterMatches(homeData);
        const awayMatches = filterMatches(awayData);

        // Parse result helper
        const parseResult = (m, teamKey) => {
          const isHome = m.home_team_key == teamKey;
          const score = m.event_final_result || '-';
          const [hg, ag] = score.split(' - ').map(Number);
          let res = 'N';
          if (!isNaN(hg) && !isNaN(ag)) {
            res = isHome ? (hg > ag ? 'V' : hg < ag ? 'D' : 'N') : (ag > hg ? 'V' : ag < hg ? 'D' : 'N');
          }
          return { isHome, opponent: isHome ? m.event_away_team : m.event_home_team, score, hg, ag, res };
        };

        // Compute stats: form, home/away split, goal averages
        const computeStats = (matches, teamKey) => {
          const homeGames = [], awayGames = [];
          let goalsFor = 0, goalsAgainst = 0;
          const form = [];

          matches.forEach(m => {
            const { isHome, res, hg, ag } = parseResult(m, teamKey);
            const gf = isHome ? hg : ag;
            const ga = isHome ? ag : hg;
            if (!isNaN(gf)) goalsFor += gf;
            if (!isNaN(ga)) goalsAgainst += ga;
            form.push(res);
            if (isHome) homeGames.push(res); else awayGames.push(res);
          });

          const n = matches.length || 1;
          const winRate = (g) => g.length ? Math.round(g.filter(r => r === 'V').length / g.length * 100) : 0;

          return {
            form: form.slice(0, 5).join(' '),
            homeForm: homeGames.slice(0, 5).join(' ') || '—',
            awayForm: awayGames.slice(0, 5).join(' ') || '—',
            avgFor: (goalsFor / n).toFixed(1),
            avgAgainst: (goalsAgainst / n).toFixed(1),
            homeWin: winRate(homeGames),
            awayWin: winRate(awayGames),
          };
        };

        const formatMatchLine = (m, teamKey) => {
          const { isHome, opponent, score, res } = parseResult(m, teamKey);
          return `${m.event_date} | ${isHome ? 'Dom' : 'Ext'} | vs ${opponent} | ${score} | ${res}`;
        };

        const homeStats = computeStats(homeMatches, homeTeamKey);
        const awayStats = computeStats(awayMatches, awayTeamKey);

        // Build standings context
        let standingsContext = '';
        if (standingsData?.result?.length) {
          const rows = standingsData.result.filter(r =>
            r.team_key == homeTeamKey || r.team_key == awayTeamKey
          );
          if (rows.length) {
            standingsContext = '\nCLASSEMENT LIGUE :\n';
            rows.forEach(r => {
              standingsContext += `#${r.standing_place} ${r.standing_team} — ${r.standing_PTS} pts | ${r.standing_W}V ${r.standing_D}N ${r.standing_L}D | Buts: ${r.standing_F}/${r.standing_A}\n`;
            });
          }
        }

        // Build H2H context
        let h2hContext = '';
        const h2hMatches = h2hData?.result?.H2H || [];
        if (h2hMatches.length) {
          h2hContext = '\nCONFRONTATIONS DIRECTES (5 dernières) :\n';
          h2hMatches.slice(0, 5).forEach(m => {
            h2hContext += `${m.event_date} : ${m.event_home_team} ${m.event_final_result} ${m.event_away_team}\n`;
          });
        }

        if (homeMatches.length > 0 || awayMatches.length > 0) {
          statsContext = `\n\n=== DONNÉES RÉELLES AllSports API ===\n`;
          statsContext += standingsContext;
          statsContext += h2hContext;

          if (homeMatches.length > 0) {
            statsContext += `\nÉQUIPE DOMICILE — Forme: ${homeStats.form} | Dom: ${homeStats.homeForm} | Ext: ${homeStats.awayForm}\n`;
            statsContext += `Moy buts marqués: ${homeStats.avgFor}/match | Moy buts encaissés: ${homeStats.avgAgainst}/match\n`;
            statsContext += `Détail (${limit} derniers matchs) :\nDate | Lieu | Adversaire | Score | Résultat\n`;
            statsContext += homeMatches.map(m => formatMatchLine(m, homeTeamKey)).join('\n') + '\n';
          }

          if (awayMatches.length > 0) {
            statsContext += `\nÉQUIPE EXTÉRIEUR — Forme: ${awayStats.form} | Dom: ${awayStats.homeForm} | Ext: ${awayStats.awayForm}\n`;
            statsContext += `Moy buts marqués: ${awayStats.avgFor}/match | Moy buts encaissés: ${awayStats.avgAgainst}/match\n`;
            statsContext += `Détail (${limit} derniers matchs) :\nDate | Lieu | Adversaire | Score | Résultat\n`;
            statsContext += awayMatches.map(m => formatMatchLine(m, awayTeamKey)).join('\n') + '\n';
          }

          statsContext += `\nUtilise UNIQUEMENT ces données réelles. Ne invente aucune statistique.`;
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
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: `Tu es BetMind, un moteur d'intelligence artificielle propriétaire spécialisé en pronostics sportifs, développé exclusivement par WinAI. Tu ne mentionnes jamais Claude, Anthropic ou toute autre IA existante. Si on te demande quelle IA tu es, tu réponds uniquement "BetMind · Neural Sports, le moteur IA de WinAI".

Tu DOIS structurer chaque réponse en respectant EXACTEMENT ces 4 sections dans cet ordre, avec ces titres exacts :

FORME RÉCENTE :
[Résume les résultats récents de chaque équipe. Format : NomEquipe → V N D V V | NomEquipe → D N V D N. V = victoire, N = nul, D = défaite. Utilise uniquement les données réelles fournies.]

ANALYSE :
[Analyse factuelle et concise : forme globale, buts marqués/encaissés, forces et faiblesses de chaque équipe. Écris en minuscules normaux. 3 à 5 phrases maximum.]

COTES CONSEILLÉES :
🎯 PRINCIPALE : [pari recommandé] @ [cote estimée]
🔀 SÉCURISÉE : [pari alternatif plus sûr] @ [cote estimée]
📊 OUTSIDER : [pari risqué mais intéressant] @ [cote estimée]

CONCLUSION :
✅ [pari principal] @ [cote] → [mise]€ × [cote] = [gain calculé]€ | [pari sécurisé en 1 ligne]
📊 Confiance : [X]/10 — [facteur de risque principal en 1 phrase]

⚠️ Outil d'aide à la décision uniquement. Pariez de manière responsable.

Règles strictes : ne jamais inventer de statistiques ; utiliser uniquement les données réelles fournies ; ne jamais utiliser ## ou ### ; répondre en français ; être concis et direct.`,
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
