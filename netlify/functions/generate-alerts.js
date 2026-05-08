/* ================================================
   netlify/functions/generate-alerts.js
   Tâche planifiée — génère les alertes LG1 et LG2
   pour les 3 prochains jours.
   Tourne toutes les 12h via Netlify Scheduled Functions.
   ================================================ */

const { footyRequest, supabaseQuery } = require('./lib/api');
const { analyzeStreakAlert } = require('./lib/lg1.cjs');
const { analyzeLG2 } = require('./lib/lg2.cjs');
const { requireAuth } = require('./lib/auth.cjs');
const { corsHeaders, handlePreflight } = require('./lib/cors.cjs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// --- Helpers ---

async function supabaseDelete(matchIds) {
  if (!matchIds.length) return true;
  const url = `${SUPABASE_URL}/rest/v1/alerts?match_id=in.(${matchIds.join(',')})&signal_type=in.(LG1_DOM,LG1_EXT,LG1)`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
    signal: AbortSignal.timeout(8000),
  });
  return res.ok;
}

async function supabaseInsert(table, rows) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=match_id,signal_type`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error(`[supabaseInsert] HTTP ${res.status}: ${errBody}`);
    throw new Error(`Insert HTTP ${res.status}: ${errBody.slice(0, 200)}`);
  }
  return true;
}

function getDateStr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

// --- Helpers ---

async function getRecentMatches(teamId, context, limit = 10) {
  const col = context === 'home' ? 'home_team_id' : 'away_team_id';
  const today = getDateStr(0);
  return await supabaseQuery('h2h_matches',
    `${col}=eq.${teamId}&match_date=lt.${today}&order=match_date.desc&limit=${limit}`
  );
}

async function getH2H(teamAId, teamBId) {
  return await supabaseQuery('h2h_matches',
    `or=(and(home_team_id.eq.${teamAId},away_team_id.eq.${teamBId}),and(home_team_id.eq.${teamBId},away_team_id.eq.${teamAId}))&order=match_date.asc`
  );
}

// --- Main ---

exports.handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  const cors = corsHeaders(event.headers?.origin || event.headers?.Origin);

  const auth = requireAuth(event, { allowScheduled: true });
  if (!auth.authorized) return { ...auth.response, headers: { ...(auth.response.headers || {}), ...cors } };

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 503, headers: cors, body: JSON.stringify({ error: 'Supabase non configuré' }) };
  }

  // Paramètre optionnel : ?type=LG1 | LG2 pour filtrer le type d'alerte
  const typeFilter = (event.queryStringParameters?.type || '').toUpperCase();
  const doLG1 = !typeFilter || typeFilter === 'LG1';
  const doLG2 = !typeFilter || typeFilter === 'LG2';

  const results = { type: typeFilter || 'ALL', analyzed: 0, alerts_created: 0, errors: [] };

  try {
    // Charger les matchs des 3 prochains jours
    const dates = [getDateStr(0), getDateStr(1), getDateStr(2)];
    console.log(`[generate-alerts] START — processing dates: ${dates.join(', ')}`);
    const allMatches = [];
    for (let i = 0; i <= 2; i++) {
      try {
        const data = await footyRequest('todays-matches', { date: dates[i] });
        const count = data?.data?.length || 0;
        if (data?.data) allMatches.push(...data.data);
        console.log(`[generate-alerts] Day ${dates[i]}: ${count} matches fetched`);
      } catch (e) {
        console.error(`[generate-alerts] Error fetching day ${dates[i]}: ${e.message}`);
        results.errors.push(`day ${i}: ${e.message}`);
      }
    }

    // Build season_id → league_name map
    const leagueMap = {};
    try {
      const leaguesData = await footyRequest('league-list', { chosen_leagues_only: 'true' });
      if (leaguesData?.data) {
        for (const l of leaguesData.data) {
          for (const s of (Array.isArray(l.season) ? l.season : [])) {
            if (s.id) leagueMap[s.id] = l.name;
          }
        }
      }
    } catch (e) {
      console.warn('[generate-alerts] league-list fetch failed, league_name will be null:', e.message);
    }

    // Récupérer les alertes existantes pour ne pas dupliquer, scopées aux types qu'on génère
    // (LG1 ne bloque pas LG2 ; idem symétriquement)
    const matchIds = allMatches.map(m => m.id).filter(Boolean);
    const lg1Types = 'LG1_A,LG1_B,LG1_A%2BB,LG1_C,LG1_D';
    const lg2Types = 'LG2_A,LG2_B,LG2_A%2BB';
    const blockParts = [];
    if (doLG1) blockParts.push(lg1Types);
    if (doLG2) blockParts.push(lg2Types);
    const blockTypes = blockParts.join(',');
    // Map match_id → Set des signal_types existants (pour décider, type par type, s'il faut recalculer)
    const existingByMatch = new Map();
    if (blockTypes && matchIds.length > 0) {
      const existing = await supabaseQuery('alerts',
        `match_id=in.(${matchIds.join(',')})&signal_type=in.(${blockTypes})&select=match_id,signal_type`
      );
      for (const a of existing) {
        if (!existingByMatch.has(a.match_id)) existingByMatch.set(a.match_id, new Set());
        existingByMatch.get(a.match_id).add(a.signal_type);
      }
    }
    // Un match est "entièrement existant" si toutes les familles actives ont au moins un type déjà présent
    const hasLG1Already = (set) => set && ['LG1_A','LG1_B','LG1_A+B','LG1_C','LG1_D'].some(t => set.has(t));
    const hasLG2Already = (set) => set && ['LG2_A','LG2_B','LG2_A+B'].some(t => set.has(t));
    function matchFullyCovered(mid) {
      const s = existingByMatch.get(mid);
      if (!s) return false;
      if (doLG1 && !hasLG1Already(s)) return false;
      if (doLG2 && !hasLG2Already(s)) return false;
      return true;
    }

    const newAlerts = [];

    // Filter matches to analyze : on garde ceux qui ont au moins une famille active non couverte
    const matchesToAnalyze = allMatches.filter(m => m.id && m.homeID && m.awayID && !matchFullyCovered(m.id));
    results.analyzed = matchesToAnalyze.length;
    results.existingBlocked = allMatches.length - matchesToAnalyze.length;
    results.debug_sample = []; // sera rempli avec les 5 premiers matchs analysés

    // Process matches in batches of 5 for concurrency control
    const BATCH_SIZE = 5;
    for (let i = 0; i < matchesToAnalyze.length; i += BATCH_SIZE) {
      const batch = matchesToAnalyze.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(batch.map(async (m) => {
        // Parallelize all Supabase queries per match
        const [homeMatches, awayMatches, h2h, oppMatchesForHome, oppMatchesForAway] = await Promise.all([
          getRecentMatches(m.homeID, 'home', 10),
          getRecentMatches(m.awayID, 'away', 10),
          getH2H(m.homeID, m.awayID),
          getRecentMatches(m.awayID, 'away', 5),   // adversaire joue ext
          getRecentMatches(m.homeID, 'home', 5),    // adversaire joue dom
        ]);

        let bestLG1 = null;
        if (doLG1) {
          const lg1Home = analyzeStreakAlert(homeMatches, m.homeID, oppMatchesForHome, m.awayID, h2h, true);   // équipe joue dom
          const lg1Away = analyzeStreakAlert(awayMatches, m.awayID, oppMatchesForAway, m.homeID, h2h, false);  // équipe joue ext

          // Debug sample : 5 premiers matchs
          if (results.debug_sample.length < 5) {
            results.debug_sample.push({
              match: `${m.home_name} vs ${m.away_name}`,
              homeMatches: homeMatches.length,
              awayMatches: awayMatches.length,
              h2h: h2h.length,
              oppForHome: oppMatchesForHome.length,
              oppForAway: oppMatchesForAway.length,
              lg1Home: { isAlert: lg1Home?.isAlert, conf: lg1Home?.confidence, block: lg1Home?.cleanSheetBlock },
              lg1Away: { isAlert: lg1Away?.isAlert, conf: lg1Away?.confidence, block: lg1Away?.cleanSheetBlock },
              // lg2 n'est pas encore calculé à ce stade, ajouté plus bas dans les logs si besoin
            });
          }

          // Hiérarchie de confidence : fort > moyen
          const priority = { fort: 2, moyen: 1 };
          const scoreHome = lg1Home?.isAlert ? (priority[lg1Home.confidence] || 0) : 0;
          const scoreAway = lg1Away?.isAlert ? (priority[lg1Away.confidence] || 0) : 0;
          if (scoreHome === 0 && scoreAway === 0) {
            bestLG1 = null;
          } else if (scoreHome >= scoreAway) {
            bestLG1 = { ...lg1Home, team: 'home', teamId: m.homeID, teamName: m.home_name };
          } else {
            bestLG1 = { ...lg1Away, team: 'away', teamId: m.awayID, teamName: m.away_name };
          }
        }

        let lg2 = null;
        if (doLG2) {
          lg2 = analyzeLG2(homeMatches, awayMatches);
        }

        const hasLG1 = bestLG1 !== null;
        const hasLG2 = lg2?.isAlert === true;
        if (!hasLG1 && !hasLG2) return null;

        const baseFields = {
          match_date: m.date_unix ? new Date(m.date_unix * 1000).toISOString().split('T')[0] : getDateStr(0),
          kickoff_unix: m.date_unix || null,
          home_team_id: m.homeID,
          away_team_id: m.awayID,
          home_team_name: m.home_name || null,
          away_team_name: m.away_name || null,
          league_name: leagueMap[m.competition_id] || null,
          h2h_count: h2h.length,
          status: 'pending',
        };

        const alerts = [];
        if (hasLG1) {
          alerts.push({
            ...baseFields,
            match_id: m.id,
            signal_type: bestLG1.signalType,         // LG1_A | LG1_B | LG1_A+B
            lg1_pct: null,                           // obsolete avec streak v2
            lg1_confidence: bestLG1.confidence,      // moyen | fort
            lg1_factors: {                           // jsonb avec streak, rates, samples + team
              ...bestLG1.factors,
              team: bestLG1.team,
              teamId: bestLG1.teamId,
              teamName: bestLG1.teamName,
            },
            confidence: bestLG1.confidence,
            algo_version: 'lg1_v2',
          });
        }
        if (hasLG2) {
          alerts.push({
            ...baseFields,
            match_id: m.id,
            signal_type: lg2.signalType,          // LG2_A | LG2_B | LG2_A+B
            lg1_pct: null,
            lg1_confidence: null,
            lg1_factors: lg2.factors,             // { streakHome, streakAway }
            confidence: lg2.confidence,            // moyen | fort
            algo_version: 'lg2_v1',
          });
        }
        return alerts;
      }));

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value !== null) {
          newAlerts.push(...result.value);
        } else if (result.status === 'rejected') {
          console.error(`[generate-alerts] Match analysis failed: ${result.reason?.message}`);
          results.errors.push(result.reason?.message || 'Unknown error');
        }
      }
    }

    // Insérer les nouvelles alertes
    console.log(`[generate-alerts] Analysis done — ${results.analyzed} matches analyzed, ${newAlerts.length} new alerts to insert`);
    results.newAlerts = newAlerts.length;
    if (newAlerts.length > 0) {
      // Supprimer les vieilles alertes LG1_DOM/LG1_EXT/LG1 avant insert (évite les conflits match_id)
      const matchIdsToClean = newAlerts.map(a => a.match_id);
      if (matchIdsToClean.length > 0) {
        await supabaseDelete(matchIdsToClean);
      }
      try {
        await supabaseInsert('alerts', newAlerts);
        results.alerts_created = newAlerts.length;
      } catch (e) {
        results.errors.push(`Insert failed: ${e.message}`);
      }
    }

    console.log(`[generate-alerts] END — ${results.alerts_created} alerts created, ${results.errors.length} errors`);
  } catch (e) {
    console.error(`[generate-alerts] FATAL: ${e.message}`);
    results.errors.push(e.message);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...cors },
    body: JSON.stringify(results),
  };
};

// Netlify Scheduled Function — toutes les 12h
exports.config = {
  schedule: '0 */12 * * *',
};
