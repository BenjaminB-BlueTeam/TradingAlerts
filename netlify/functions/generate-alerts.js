/* ================================================
   netlify/functions/generate-alerts.js
   Tâche planifiée — génère les alertes FHG/DC
   pour les 3 prochains jours.
   Tourne toutes les 12h via Netlify Scheduled Functions.
   ================================================ */

const { footyRequest, supabaseQuery } = require('./lib/api');
const { analyzeStreakAlert, analyzeDCFromH2H } = require('./lib/analysis.cjs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// --- Helpers ---

async function supabaseInsert(table, rows) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=match_id`;
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
  return res.ok;
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
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 503, body: JSON.stringify({ error: 'Supabase non configuré' }) };
  }

  // Paramètre optionnel : ?type=FHG ou ?type=DC pour filtrer le type d'alerte
  const typeFilter = (event.queryStringParameters?.type || '').toUpperCase();
  const doFHG = !typeFilter || typeFilter === 'FHG';
  const doDC = !typeFilter || typeFilter === 'DC';

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

    // Récupérer les alertes existantes pour ne pas dupliquer
    const matchIds = allMatches.map(m => m.id).filter(Boolean);
    const existing = await supabaseQuery('alerts',
      `match_id=in.(${matchIds.join(',')})&select=match_id`
    );
    const existingIds = new Set(existing.map(a => a.match_id));

    const newAlerts = [];

    // Filter matches to analyze
    const matchesToAnalyze = allMatches.filter(m => m.id && m.homeID && m.awayID && !existingIds.has(m.id));
    results.analyzed = matchesToAnalyze.length;

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

        let bestFHG = null;
        if (doFHG) {
          const fhgHome = analyzeStreakAlert(homeMatches, m.homeID, oppMatchesForHome, m.awayID, h2h);
          const fhgAway = analyzeStreakAlert(awayMatches, m.awayID, oppMatchesForAway, m.homeID, h2h);
          // Hiérarchie de confidence : fort_double > fort > moyen
          const priority = { fort_double: 3, fort: 2, moyen: 1 };
          const scoreHome = fhgHome?.isAlert ? (priority[fhgHome.confidence] || 0) : 0;
          const scoreAway = fhgAway?.isAlert ? (priority[fhgAway.confidence] || 0) : 0;
          if (scoreHome === 0 && scoreAway === 0) {
            bestFHG = null;
          } else if (scoreHome >= scoreAway) {
            bestFHG = { ...fhgHome, team: 'home', teamId: m.homeID, teamName: m.home_name };
          } else {
            bestFHG = { ...fhgAway, team: 'away', teamId: m.awayID, teamName: m.away_name };
          }
        }

        let dc = null;
        if (doDC) {
          dc = analyzeDCFromH2H(h2h, m.homeID);
        }

        const hasFHG = bestFHG !== null;
        const hasDC = dc?.isAlert === true;
        if (!hasFHG && !hasDC) return null;

        const baseFields = {
          match_date: m.date_unix ? new Date(m.date_unix * 1000).toISOString().split('T')[0] : getDateStr(0),
          kickoff_unix: m.date_unix || null,
          home_team_id: m.homeID,
          away_team_id: m.awayID,
          home_team_name: m.home_name || null,
          away_team_name: m.away_name || null,
          league_name: m.competition_name || null,
          h2h_count: h2h.length,
          status: 'pending',
        };

        // Créer des alertes séparées pour FHG et DC (pas de tag combiné)
        const alerts = [];
        if (hasFHG) {
          alerts.push({
            ...baseFields,
            match_id: m.id,
            signal_type: bestFHG.signalType,        // FHG_A | FHG_B | FHG_A+B
            fhg_pct: null,                           // obsolete avec streak v2
            fhg_confidence: bestFHG.confidence,      // moyen | fort | fort_double
            fhg_factors: bestFHG.factors,            // jsonb avec streak, rates, samples
            dc_defeat_pct: null,
            dc_best_side: null,
            dc_confidence: null,
            confidence: bestFHG.confidence,
            algo_version: 'v2',
          });
        }
        if (hasDC) {
          alerts.push({
            ...baseFields,
            match_id: hasFHG ? m.id * -1 : m.id, // ID unique si les deux existent
            signal_type: 'DC',
            fhg_pct: null,
            fhg_confidence: null,
            fhg_factors: null,
            dc_defeat_pct: dc.bestDefeatPct,
            dc_best_side: dc.bestSide,
            dc_confidence: dc.confidence,
            confidence: dc.confidence,
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
    if (newAlerts.length > 0) {
      const ok = await supabaseInsert('alerts', newAlerts);
      if (ok) results.alerts_created = newAlerts.length;
      else results.errors.push('Insert alerts failed');
    }

    console.log(`[generate-alerts] END — ${results.alerts_created} alerts created, ${results.errors.length} errors`);
  } catch (e) {
    console.error(`[generate-alerts] FATAL: ${e.message}`);
    results.errors.push(e.message);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(results),
  };
};

// Netlify Scheduled Function — toutes les 12h
exports.config = {
  schedule: '0 */12 * * *',
};
