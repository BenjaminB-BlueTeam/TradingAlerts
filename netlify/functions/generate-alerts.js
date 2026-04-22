/* ================================================
   netlify/functions/generate-alerts.js
   Tâche planifiée — génère les alertes FHG/DC
   pour les 3 prochains jours.
   Tourne toutes les 12h via Netlify Scheduled Functions.
   ================================================ */

const { footyRequest, supabaseQuery } = require('./lib/api');
const { analyzeFHGFromMatches, analyzeDCFromH2H } = require('./lib/analysis.cjs');

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
  return await supabaseQuery('h2h_matches',
    `${col}=eq.${teamId}&order=match_date.desc&limit=${limit}`
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

  const results = { analyzed: 0, alerts_created: 0, errors: [] };

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

    for (const m of allMatches) {
      if (!m.id || !m.homeID || !m.awayID) continue;
      if (existingIds.has(m.id)) continue;
      results.analyzed++;

      // FHG analyse — chaque équipe dans son contexte + matchs adversaire
      const homeMatches = await getRecentMatches(m.homeID, 'home', 10);
      const awayMatches = await getRecentMatches(m.awayID, 'away', 10);
      const h2h = await getH2H(m.homeID, m.awayID);
      // Matchs de l'adversaire dans son contexte (5 derniers)
      const oppMatchesForHome = await getRecentMatches(m.awayID, 'away', 5);  // adversaire joue ext
      const oppMatchesForAway = await getRecentMatches(m.homeID, 'home', 5);  // adversaire joue dom

      const fhgHome = analyzeFHGFromMatches(homeMatches, 'home', h2h, m.homeID, oppMatchesForHome);
      const fhgAway = analyzeFHGFromMatches(awayMatches, 'away', h2h, m.awayID, oppMatchesForAway);

      const bestFHG = (fhgHome?.isAlert && fhgAway?.isAlert)
        ? (fhgHome.score >= fhgAway.score ? fhgHome : fhgAway)
        : fhgHome?.isAlert ? fhgHome
        : fhgAway?.isAlert ? fhgAway
        : null;

      // DC analyse
      const dc = analyzeDCFromH2H(h2h, m.homeID);

      const hasFHG = bestFHG !== null;
      const hasDC = dc?.isAlert === true;
      if (!hasFHG && !hasDC) continue;

      const signalType = hasFHG && hasDC ? 'FHG+DC' : hasFHG ? 'FHG' : 'DC';
      const confidence = (hasFHG && bestFHG.confidence === 'fort') || (hasDC && dc.confidence === 'fort')
        ? 'fort' : 'moyen';

      newAlerts.push({
        match_id: m.id,
        match_date: m.date_unix ? new Date(m.date_unix * 1000).toISOString().split('T')[0] : getDateStr(0),
        kickoff_unix: m.date_unix || null,
        home_team_id: m.homeID,
        away_team_id: m.awayID,
        home_team_name: m.home_name || null,
        away_team_name: m.away_name || null,
        league_name: m.competition_name || null,
        signal_type: signalType,
        fhg_pct: bestFHG?.score || null,
        fhg_confidence: bestFHG?.confidence || null,
        fhg_factors: bestFHG?.factors || null,
        dc_defeat_pct: hasDC ? dc.bestDefeatPct : null,
        dc_best_side: hasDC ? dc.bestSide : null,
        dc_confidence: hasDC ? dc.confidence : null,
        h2h_count: h2h.length,
        confidence,
        status: 'pending',
      });
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
