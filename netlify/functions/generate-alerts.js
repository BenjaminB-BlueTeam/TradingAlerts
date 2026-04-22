/* ================================================
   netlify/functions/generate-alerts.js
   Tâche planifiée — génère les alertes FHG/DC
   pour les 3 prochains jours.
   Tourne toutes les 12h via Netlify Scheduled Functions.
   ================================================ */

const FOOTYSTATS_BASE = 'https://api.football-data-api.com';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const MIN_MATCHES = 5;
const FHG_SEUIL_MOYEN = 70;
const FHG_SEUIL_FORT = 80;
const DC_SEUIL_MOYEN = 30;
const DC_SEUIL_FORT = 20;

// --- Helpers ---

async function footyRequest(endpoint, params = {}) {
  const apiKey = process.env.FOOTYSTATS_API_KEY;
  if (!apiKey) throw new Error('FOOTYSTATS_API_KEY non configurée');
  const url = new URL(`${FOOTYSTATS_BASE}/${endpoint}`);
  url.searchParams.set('key', apiKey);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`FootyStats ${endpoint}: HTTP ${res.status}`);
  return await res.json();
}

async function supabaseQuery(table, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) return [];
  return await res.json();
}

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
  });
  return res.ok;
}

function getDateStr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

// --- Analyses ---

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

function analyzeFHGFromMatches(matches, context, h2h, teamId, opponentMatches) {
  if (matches.length < MIN_MATCHES) return null;

  const teamIsHome = context === 'home';

  // Compter les buts dans la fenêtre 31-45 min via goal_events
  const teamGoals3145 = matches.map(m => {
    const events = Array.isArray(m.goal_events) ? m.goal_events : [];
    return events.filter(e => e.min >= 31 && e.min <= 45 && e.home === teamIsHome).length;
  });
  const oppGoals3145 = matches.map(m => {
    const events = Array.isArray(m.goal_events) ? m.goal_events : [];
    return events.filter(e => e.min >= 31 && e.min <= 45 && e.home !== teamIsHome).length;
  });

  const pctGoal1MT = Math.round((teamGoals3145.filter(g => g > 0).length / matches.length) * 100);
  const pct2Plus1MT = Math.round((teamGoals3145.filter(g => g >= 2).length / matches.length) * 100);

  // Réaction quand adversaire marque en 31-45 min
  let pctReaction1MT = null;
  const oppScored = matches.filter((_, i) => oppGoals3145[i] > 0);
  if (oppScored.length >= 2) {
    const reactions = oppScored.filter((m, idx) => {
      const origIdx = matches.indexOf(m);
      return teamGoals3145[origIdx] > 0;
    }).length;
    pctReaction1MT = Math.round((reactions / oppScored.length) * 100);
  }

  // Clean sheet H2H — jamais marqué en 31-45 min contre cet adversaire
  let cleanSheetBlock = false;
  if (h2h.length >= 3) {
    const h2hGoals = h2h.filter(m => {
      const events = Array.isArray(m.goal_events) ? m.goal_events : [];
      const teamIsHomeInH2H = m.home_team_id === teamId;
      return events.some(e => e.min >= 31 && e.min <= 45 && e.home === teamIsHomeInH2H);
    }).length;
    if (h2hGoals === 0) cleanSheetBlock = true;
  }

  // Adversaire — encaisse-t-il assez ? (filtre : ≥3 matchs sur 5 avec but encaissé)
  const oppContext = context === 'home' ? 'away' : 'home';
  let opponentConcedesEnough = false;
  let oppConcedesCount = 0;
  let pctOpponentConcedes1MT = 0;

  if (opponentMatches && opponentMatches.length >= 3) {
    oppConcedesCount = opponentMatches.filter(m => {
      const conceded = oppContext === 'home'
        ? (m.away_goals || 0) : (m.home_goals || 0);
      return conceded > 0;
    }).length;
    opponentConcedesEnough = oppConcedesCount >= 2;

    const oppConceded1MT = opponentMatches.filter(m => {
      const conceded = oppContext === 'home'
        ? (m.away_goals_ht || 0) : (m.home_goals_ht || 0);
      return conceded > 0;
    }).length;
    pctOpponentConcedes1MT = Math.round((oppConceded1MT / opponentMatches.length) * 100);
  }

  // Score composite
  let score;
  if (pctReaction1MT !== null) {
    score = pctGoal1MT * 0.50 + pctOpponentConcedes1MT * 0.25 + pct2Plus1MT * 0.15 + pctReaction1MT * 0.10;
  } else {
    score = pctGoal1MT * 0.55 + pctOpponentConcedes1MT * 0.28 + pct2Plus1MT * 0.17;
  }
  score = Math.round(score);

  const confidence = score >= FHG_SEUIL_FORT ? 'fort' : score >= FHG_SEUIL_MOYEN ? 'moyen' : null;

  return {
    isAlert: confidence !== null && !cleanSheetBlock && opponentConcedesEnough,
    cleanSheetBlock,
    opponentConcedesEnough,
    confidence,
    score,
    factors: {
      recurrence1MT: pctGoal1MT,
      double1MT: pct2Plus1MT,
      adversaireConcede: pctOpponentConcedes1MT,
      adversaireEncaisse: `${oppConcedesCount}/${opponentMatches?.length || 0}`,
      reaction1MT: pctReaction1MT,
      cleanSheetH2H: cleanSheetBlock,
    },
  };
}

function analyzeDCFromH2H(h2h, homeId) {
  if (h2h.length < MIN_MATCHES) return null;

  let homeLosses = 0, awayLosses = 0;
  for (const m of h2h) {
    const hg = m.home_goals ?? 0;
    const ag = m.away_goals ?? 0;
    const isHome = m.home_team_id === homeId;
    if (hg > ag) {          // H2H home side won
      if (!isHome) homeLosses++;   // homeId was away in this H2H, so homeId lost
      else awayLosses++;           // awayId was away in this H2H, so awayId lost
    } else if (ag > hg) {   // H2H away side won
      if (isHome) homeLosses++;    // homeId was home in this H2H, still lost
      else awayLosses++;           // awayId was home in this H2H, still lost
    }
  }

  const total = h2h.length;
  const homeDefeatPct = Math.round((homeLosses / total) * 100);
  const awayDefeatPct = Math.round((awayLosses / total) * 100);
  const bestSide = homeDefeatPct <= awayDefeatPct ? 'home' : 'away';
  const bestDefeatPct = Math.min(homeDefeatPct, awayDefeatPct);
  const confidence = bestDefeatPct <= DC_SEUIL_FORT ? 'fort' : bestDefeatPct <= DC_SEUIL_MOYEN ? 'moyen' : null;

  return {
    isAlert: confidence !== null,
    confidence,
    bestSide,
    bestDefeatPct,
    h2hCount: total,
  };
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
