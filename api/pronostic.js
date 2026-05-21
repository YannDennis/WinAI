export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, homeTeamKey, awayTeamKey, hist = 10, leagueId, homeTeamName, awayTeamName } = req.body;

    if (!prompt || prompt.trim().length < 10) {
      return res.status(400).json({ error: 'Prompt invalide ou manquant.' });
    }

    const apiKey       = process.env.ANTHROPIC_API_KEY;
    const sportsKey    = process.env.ALL_SPORTS_KEY;
    const footballKey  = process.env.FOOTBALL_API_KEY;

    if (!apiKey) return res.status(500).json({ error: 'Clé API manquante.' });

    // ── AllSports historical data ──────────────────────────────────────────
    const allSportsPromise = (async () => {
      if (!sportsKey || !homeTeamKey || !awayTeamKey) return '';
      try {
        const today    = new Date();
        const toDate   = today.toISOString().split('T')[0];
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
            .filter(m => ['FT','AET','PEN'].includes(m.event_status) || (m.event_final_result?.includes('-') && m.event_final_result !== '-'))
            .sort((a, b) => new Date(b.event_date) - new Date(a.event_date))
            .slice(0, limit);
        };

        const homeMatches = filterMatches(homeData);
        const awayMatches = filterMatches(awayData);

        const parseResult = (m, teamKey) => {
          const isHome = m.home_team_key == teamKey;
          const score  = m.event_final_result || '-';
          const [hg, ag] = score.split(' - ').map(Number);
          let res = 'N';
          if (!isNaN(hg) && !isNaN(ag)) {
            res = isHome ? (hg > ag ? 'V' : hg < ag ? 'D' : 'N') : (ag > hg ? 'V' : ag < hg ? 'D' : 'N');
          }
          return { isHome, opponent: isHome ? m.event_away_team : m.event_home_team, score, hg, ag, res };
        };

        const computeStats = (matches, teamKey) => {
          const homeGames = [], awayGames = [];
          let goalsFor = 0, goalsAgainst = 0, cleanSheets = 0, over25 = 0;
          const form = [];

          matches.forEach(m => {
            const { isHome, res, hg, ag } = parseResult(m, teamKey);
            const gf = isHome ? hg : ag;
            const ga = isHome ? ag : hg;
            if (!isNaN(gf)) goalsFor += gf;
            if (!isNaN(ga)) { goalsAgainst += ga; if (ga === 0) cleanSheets++; }
            if (!isNaN(hg) && !isNaN(ag) && (hg + ag) > 2.5) over25++;
            form.push(res);
            if (isHome) homeGames.push(res); else awayGames.push(res);
          });

          const n = matches.length || 1;
          const winRate = (g) => g.length ? Math.round(g.filter(r => r === 'V').length / g.length * 100) : 0;

          let streak = 0, streakType = '';
          for (const r of form) {
            if (!streakType) { streakType = r; streak = 1; }
            else if (r === streakType) streak++;
            else break;
          }
          const streakStr = streak > 1
            ? `${streak} ${streakType === 'V' ? 'victoires' : streakType === 'D' ? 'défaites' : 'nuls'} de suite`
            : '—';

          return {
            form: form.slice(0, 5).join(' '),
            homeForm: homeGames.slice(0, 5).join(' ') || '—',
            awayForm: awayGames.slice(0, 5).join(' ') || '—',
            avgFor: (goalsFor / n).toFixed(1),
            avgAgainst: (goalsAgainst / n).toFixed(1),
            homeAvgFor: homeGames.length ? (homeGames.reduce((s,_,i) => { const {gf} = (() => { const mm = matches.filter(m => parseResult(m,teamKey).isHome)[i]; return mm ? {gf: parseResult(mm,teamKey).hg} : {gf:0}; })(); return s + (isNaN(gf)?0:gf); }, 0) / homeGames.length).toFixed(1) : '—',
            awayAvgAgainst: awayGames.length ? (goalsAgainst / awayGames.length).toFixed(1) : '—',
            cleanSheets,
            over25Pct: Math.round(over25 / n * 100),
            homeWin: winRate(homeGames),
            awayWin: winRate(awayGames),
            streak: streakStr,
            n,
          };
        };

        const fmt = (m, teamKey) => {
          const { isHome, opponent, score, res } = parseResult(m, teamKey);
          return `${m.event_date} | ${isHome ? 'Dom' : 'Ext'} | vs ${opponent} | ${score} | ${res}`;
        };

        const homeStats = computeStats(homeMatches, homeTeamKey);
        const awayStats = computeStats(awayMatches, awayTeamKey);

        let ctx = '';

        if (standingsData?.result?.length) {
          const rows = standingsData.result.filter(r => r.team_key == homeTeamKey || r.team_key == awayTeamKey);
          if (rows.length) {
            ctx += '\nCLASSEMENT LIGUE :\n';
            rows.forEach(r => {
              ctx += `#${r.standing_place} ${r.standing_team} — ${r.standing_PTS} pts | ${r.standing_W}V ${r.standing_D}N ${r.standing_L}D | Buts: ${r.standing_F}/${r.standing_A}\n`;
            });
          }
        }

        const h2hMatches = h2hData?.result?.H2H || [];
        if (h2hMatches.length) {
          ctx += '\nCONFRONTATIONS DIRECTES (5 dernières) :\n';
          h2hMatches.slice(0, 5).forEach(m => {
            ctx += `${m.event_date} : ${m.event_home_team} ${m.event_final_result} ${m.event_away_team}\n`;
          });
        }

        if (homeMatches.length > 0) {
          ctx += `\nÉQUIPE DOMICILE — Forme: ${homeStats.form} | Dom: ${homeStats.homeForm} | Ext: ${homeStats.awayForm}\n`;
          ctx += `Buts marqués: ${homeStats.avgFor}/match | Encaissés: ${homeStats.avgAgainst}/match | CS: ${homeStats.cleanSheets}/${homeStats.n} | +2.5 buts: ${homeStats.over25Pct}% | Série: ${homeStats.streak}\n`;
          ctx += `% victoires dom: ${homeStats.homeWin}%\n`;
          ctx += `Détail (${limit} matchs) :\n` + homeMatches.map(m => fmt(m, homeTeamKey)).join('\n') + '\n';
        }

        if (awayMatches.length > 0) {
          ctx += `\nÉQUIPE EXTÉRIEUR — Forme: ${awayStats.form} | Dom: ${awayStats.homeForm} | Ext: ${awayStats.awayForm}\n`;
          ctx += `Buts marqués: ${awayStats.avgFor}/match | Encaissés: ${awayStats.avgAgainst}/match | CS: ${awayStats.cleanSheets}/${awayStats.n} | +2.5 buts: ${awayStats.over25Pct}% | Série: ${awayStats.streak}\n`;
          ctx += `% victoires ext: ${awayStats.awayWin}% | Moy buts enc ext: ${awayStats.awayAvgAgainst}/match\n`;
          ctx += `Détail (${limit} matchs) :\n` + awayMatches.map(m => fmt(m, awayTeamKey)).join('\n') + '\n';
        }

        if (ctx) ctx = '\n\n=== DONNÉES ALLSPORTS API ===\n' + ctx + '\nUtilise UNIQUEMENT ces données réelles.';
        return ctx;
      } catch (e) {
        console.error('AllSports error:', e);
        return '';
      }
    })();

    // ── API-Football (saison en cours) ────────────────────────────────────
    const footballPromise = (async () => {
      if (!footballKey || !homeTeamName || !awayTeamName) return '';
      try {
        const yr = new Date().getFullYear();
        const season = new Date().getMonth() < 6 ? yr - 1 : yr;
        const hdrs = { 'x-rapidapi-key': footballKey, 'x-rapidapi-host': 'v3.football.api-sports.io' };
        const base = 'https://v3.football.api-sports.io';

        const [homeSearch, awaySearch] = await Promise.all([
          fetch(`${base}/teams?search=${encodeURIComponent(homeTeamName.trim())}`, { headers: hdrs }).then(r => r.json()).catch(() => null),
          fetch(`${base}/teams?search=${encodeURIComponent(awayTeamName.trim())}`, { headers: hdrs }).then(r => r.json()).catch(() => null),
        ]);

        const homeId = homeSearch?.response?.[0]?.team?.id;
        const awayId = awaySearch?.response?.[0]?.team?.id;
        if (!homeId || !awayId) return '';

        const [hStat, aStat, h2h, hInj, aInj] = await Promise.all([
          fetch(`${base}/teams/statistics?team=${homeId}&season=${season}`, { headers: hdrs }).then(r => r.json()).catch(() => null),
          fetch(`${base}/teams/statistics?team=${awayId}&season=${season}`, { headers: hdrs }).then(r => r.json()).catch(() => null),
          fetch(`${base}/fixtures/headtohead?h2h=${homeId}-${awayId}&last=5`, { headers: hdrs }).then(r => r.json()).catch(() => null),
          fetch(`${base}/injuries?team=${homeId}&season=${season}`, { headers: hdrs }).then(r => r.json()).catch(() => null),
          fetch(`${base}/injuries?team=${awayId}&season=${season}`, { headers: hdrs }).then(r => r.json()).catch(() => null),
        ]);

        let ctx = '\n\n=== DONNÉES API-FOOTBALL (SAISON EN COURS) ===\n';
        let hasData = false;

        const fmtTeamStats = (s, name, side) => {
          if (!s?.response) return '';
          const r  = s.response;
          const pl = r.fixtures?.played?.total || 0;
          const w  = r.fixtures?.wins?.total   || 0;
          const d  = r.fixtures?.draws?.total  || 0;
          const l  = r.fixtures?.loses?.total  || 0;
          const gf = r.goals?.for?.total?.total     || 0;
          const ga = r.goals?.against?.total?.total || 0;
          const sideGF = side === 'home' ? (r.goals?.for?.total?.home || 0) : (r.goals?.for?.total?.away || 0);
          const sideGA = side === 'home' ? (r.goals?.against?.total?.home || 0) : (r.goals?.against?.total?.away || 0);
          const sidePl = side === 'home' ? (r.fixtures?.played?.home || 0) : (r.fixtures?.played?.away || 0);
          let out = `\n${name} (${side === 'home' ? 'DOMICILE' : 'EXTÉRIEUR'}) — Saison ${season}/${season+1} :\n`;
          out += `Total: ${pl}J ${w}V ${d}N ${l}D | Buts: ${gf} marqués / ${ga} encaissés\n`;
          out += `${side === 'home' ? 'À domicile' : 'À l\'extérieur'}: ${sidePl}J | ${sideGF} buts marqués | ${sideGA} encaissés\n`;
          if (r.clean_sheet?.total !== undefined) out += `Clean sheets: ${r.clean_sheet.total}/${pl}\n`;
          if (r.biggest?.streak?.wins) out += `Meilleure série victoires: ${r.biggest.streak.wins}\n`;
          return out;
        };

        const homeStatCtx = fmtTeamStats(hStat, homeTeamName, 'home');
        const awayStatCtx = fmtTeamStats(aStat, awayTeamName, 'away');
        if (homeStatCtx) { ctx += homeStatCtx; hasData = true; }
        if (awayStatCtx) { ctx += awayStatCtx; hasData = true; }

        if (h2h?.response?.length) {
          ctx += '\nH2H (5 derniers) :\n';
          h2h.response.slice(0, 5).forEach(f => {
            const hN = f.teams?.home?.name, aN = f.teams?.away?.name;
            const hg = f.goals?.home ?? '?', ag = f.goals?.away ?? '?';
            ctx += `${f.fixture?.date?.split('T')[0]} : ${hN} ${hg}-${ag} ${aN}\n`;
          });
          hasData = true;
        }

        const fmtInj = (inj, name) => {
          if (!inj?.response?.length) return '';
          const list = inj.response.slice(0, 6).map(i => `${i.player?.name} (${i.player?.type || 'blessé'})`).join(', ');
          return `\nBLESSURES ${name.toUpperCase()} : ${list}\n`;
        };
        ctx += fmtInj(hInj, homeTeamName);
        ctx += fmtInj(aInj, awayTeamName);

        return hasData ? ctx : '';
      } catch (e) {
        console.error('API-Football error:', e);
        return '';
      }
    })();

    const [allSportsCtx, footballCtx] = await Promise.all([allSportsPromise, footballPromise]);
    const statsContext = allSportsCtx + footballCtx;

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
        max_tokens: 1800,
        system: `Tu es BetMind, moteur d'IA propriétaire de WinAI spécialisé en pronostics sportifs. Tu n'es pas Claude, tu ne mentionnes jamais Anthropic ou toute autre IA. Si on te demande quelle IA tu es, réponds uniquement "BetMind · Neural Sports, le moteur IA de WinAI".

Tu analyses comme un tipster professionnel avec accès aux vraies données. Tu détectes les value bets (cote bookmaker supérieure à la valeur réelle), proposes des combinés pertinents, et donnes un verdict net.

Tu DOIS structurer chaque réponse en respectant EXACTEMENT ces 7 sections dans cet ordre, avec ces titres exacts :

ACCROCHE :
[1 phrase percutante et directe sur ce match — ex : "Un choc explosif où l'attaque de X contre la défense poreuse de Y promet des buts." Sois accrocheur.]

VALUE BET :
[OUI — [raison courte : ex : "la cote de X à 2.30 est sous-estimée vu sa forme dom"] | ou NON]

FORME RÉCENTE :
[NomEquipe → V N D V V | buts/match: X.X | CS: N | série: description ou —]
[NomEquipe → D N V D N | buts/match: X.X | CS: N | série: description ou —]

STATS CLÉS :
Buts dom: X.X/match | Buts enc ext: X.X/match | +2.5 buts: X% | Série: [description courte]

ANALYSE :
[3 à 5 phrases précises. Cite les vraies statistiques reçues. Identifie forces/faiblesses. Mentionne blessures si connues. Ne jamais inventer une stat.]

COTES CONSEILLÉES :
🎯 PRINCIPALE : [pari recommandé] @ [cote estimée][ — VALUE BET si applicable]
🔀 SÉCURISÉE : [pari alternatif plus sûr] @ [cote estimée]
📊 COMBINÉ : [proposition de combiné pertinent, ex : "Victoire X + Plus 1.5 buts"] @ [cote combinée estimée]

CONCLUSION :
✅ [pari principal en clair] @ [cote] → [mise]€ × [cote] = [gain calculé]€
🔀 SÉCURISÉ : [pari sécurisé en 1 ligne]
📊 VERDICT : [Recommandé|Neutre|Déconseillé] — [raison en 1 phrase courte]
🔥 [1 phrase courte et dynamique donnant envie de lancer une autre analyse sur WinAI]

⚠️ Outil d'aide à la décision uniquement. Pariez de manière responsable.

Règles strictes : ne jamais inventer de statistiques ; utiliser UNIQUEMENT les données réelles fournies ; ne jamais utiliser ## ou ### ; répondre en français ; être direct et précis.`,
        messages: [{ role: 'user', content: finalPrompt }],
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
