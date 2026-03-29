/* ================================================
   alertEngine.js — Moteur d'alertes autonome
   Analyse comportementale FHG + H2H DC
   ================================================ */

import { supabase } from '$lib/api/supabase.js';

const MIN_MATCHES = 5;       // Minimum de matchs récents pour analyser
const FHG_SEUIL_MOYEN = 70;  // % récurrence min pour signal moyen
const FHG_SEUIL_FORT = 80;   // % récurrence min pour signal fort
const DC_SEUIL_MOYEN = 30;   // % défaite max pour signal moyen
const DC_SEUIL_FORT = 20;    // % défaite max pour signal fort

// ============================================================
// QUERIES SUPABASE
// ============================================================

/**
 * Récupère les N derniers matchs d'une équipe à domicile.
 */
async function getRecentHomeMatches(teamId, limit = 10) {
  const { data, error } = await supabase
    .from('h2h_matches')
    .select('*')
    .eq('home_team_id', teamId)
    .order('match_date', { ascending: false })
    .limit(limit);
  if (error) { console.error('getRecentHomeMatches:', error); return []; }
  return data || [];
}

/**
 * Récupère les N derniers matchs d'une équipe à l'extérieur.
 */
async function getRecentAwayMatches(teamId, limit = 10) {
  const { data, error } = await supabase
    .from('h2h_matches')
    .select('*')
    .eq('away_team_id', teamId)
    .order('match_date', { ascending: false })
    .limit(limit);
  if (error) { console.error('getRecentAwayMatches:', error); return []; }
  return data || [];
}

/**
 * Récupère les H2H entre deux équipes (toutes saisons).
 */
async function getH2H(teamAId, teamBId) {
  const { data, error } = await supabase
    .from('h2h_matches')
    .select('*')
    .or(
      `and(home_team_id.eq.${teamAId},away_team_id.eq.${teamBId}),and(home_team_id.eq.${teamBId},away_team_id.eq.${teamAId})`
    )
    .order('match_date', { ascending: true });
  if (error) { console.error('getH2H:', error); return []; }
  return data || [];
}

// ============================================================
// ANALYSE FHG — Comportementale par équipe
// ============================================================

/**
 * Analyse FHG d'une équipe dans son contexte (dom ou ext).
 * @param {number} teamId - ID de l'équipe
 * @param {string} context - 'home' ou 'away'
 * @param {number} opponentId - ID adversaire (pour clean sheet H2H)
 * @returns {object} analyse FHG
 */
export async function analyzeFHG(teamId, context, opponentId) {
  // 1. Récupérer les derniers matchs dans le bon contexte
  const matches = context === 'home'
    ? await getRecentHomeMatches(teamId, 10)
    : await getRecentAwayMatches(teamId, 10);

  if (matches.length < MIN_MATCHES) {
    return { hasData: false, reason: 'Pas assez de matchs récents' };
  }

  // 2. Analyser la récurrence de buts en 1MT
  const teamGoalsHT = matches.map(m =>
    context === 'home' ? (m.home_goals_ht || 0) : (m.away_goals_ht || 0)
  );
  const opponentGoalsHT = matches.map(m =>
    context === 'home' ? (m.away_goals_ht || 0) : (m.home_goals_ht || 0)
  );

  // % de matchs où l'équipe marque en 1MT
  const matchesWithGoal1MT = teamGoalsHT.filter(g => g > 0).length;
  const pctGoal1MT = Math.round((matchesWithGoal1MT / matches.length) * 100);

  // % de matchs avec 2+ buts marqués en 1MT (capacité à marquer même si but tôt)
  const matchesWith2PlusGoals1MT = teamGoalsHT.filter(g => g >= 2).length;
  const pct2Plus1MT = Math.round((matchesWith2PlusGoals1MT / matches.length) * 100);

  // 3. Adversaire — encaisse-t-il ?
  // Contexte inversé : si notre équipe est dom, l'adversaire joue ext
  const oppContext = context === 'home' ? 'away' : 'home';
  const opponentMatches = oppContext === 'home'
    ? await getRecentHomeMatches(opponentId, 5)
    : await getRecentAwayMatches(opponentId, 5);

  let pctOpponentConcedes1MT = 0;
  let opponentConcedesEnough = false; // filtre : l'adversaire doit encaisser assez
  let oppConcedesCount = 0;

  if (opponentMatches.length >= 3) {
    // Compter les matchs où l'adversaire a encaissé au moins 1 but (FT, pas juste 1MT)
    oppConcedesCount = opponentMatches.filter(m => {
      const conceded = oppContext === 'home'
        ? (m.away_goals || 0)   // adversaire est dom, il encaisse les buts ext
        : (m.home_goals || 0);  // adversaire est ext, il encaisse les buts dom
      return conceded > 0;
    }).length;
    // Filtre : au moins 3 matchs sur 5 où il encaisse
    opponentConcedesEnough = oppConcedesCount >= 3;

    // % encaisse en 1MT (pour le score composite)
    const oppConceded1MT = opponentMatches.filter(m => {
      const conceded = oppContext === 'home'
        ? (m.away_goals_ht || 0)
        : (m.home_goals_ht || 0);
      return conceded > 0;
    }).length;
    pctOpponentConcedes1MT = Math.round((oppConceded1MT / opponentMatches.length) * 100);
  }

  // 4. Réaction quand mené en 1MT
  // Matchs où l'adversaire a marqué en 1MT ET l'équipe aussi
  const matchesOpponentScored1MT = matches.filter((m, i) => opponentGoalsHT[i] > 0);
  let pctReaction1MT = null;
  if (matchesOpponentScored1MT.length >= 2) {
    const reactions = matchesOpponentScored1MT.filter((m, idx) => {
      const origIdx = matches.indexOf(m);
      return teamGoalsHT[origIdx] > 0;
    }).length;
    pctReaction1MT = Math.round((reactions / matchesOpponentScored1MT.length) * 100);
  }

  // 5. Clean sheet H2H — l'adversaire est-il un "chat noir" ?
  const h2h = await getH2H(teamId, opponentId);
  let cleanSheetBlock = false;
  if (h2h.length >= 3) {
    const h2hGoals1MT = h2h.filter(m => {
      const isHome = m.home_team_id === teamId;
      const goals = isHome ? (m.home_goals_ht || 0) : (m.away_goals_ht || 0);
      return goals > 0;
    }).length;
    // Si 0 but en 1MT sur les H2H → chat noir
    if (h2hGoals1MT === 0) cleanSheetBlock = true;
  }

  // 6. Score composite
  // Pondération : récurrence 1MT (50%) + adversaire encaisse (25%) + 2+ buts (15%) + réaction (10%)
  let score = pctGoal1MT * 0.50
    + pctOpponentConcedes1MT * 0.25
    + pct2Plus1MT * 0.15;
  if (pctReaction1MT !== null) {
    score += pctReaction1MT * 0.10;
  } else {
    // Redistribuer les 10% sur les autres
    score = pctGoal1MT * 0.55 + pctOpponentConcedes1MT * 0.28 + pct2Plus1MT * 0.17;
  }
  score = Math.round(score);

  // Confiance
  const confidence = score >= FHG_SEUIL_FORT ? 'fort' : score >= FHG_SEUIL_MOYEN ? 'moyen' : null;

  return {
    hasData: true,
    isAlert: confidence !== null && !cleanSheetBlock && opponentConcedesEnough,
    cleanSheetBlock,
    opponentConcedesEnough,
    confidence,
    score,
    pctGoal1MT,
    pct2Plus1MT,
    pctOpponentConcedes1MT,
    pctReaction1MT,
    oppConcedesCount,
    oppMatchesChecked: opponentMatches.length,
    matchesAnalyzed: matches.length,
    h2hCount: h2h.length,
    factors: {
      recurrence1MT: pctGoal1MT,
      double1MT: pct2Plus1MT,
      adversaireConcede: pctOpponentConcedes1MT,
      adversaireEncaisse: `${oppConcedesCount}/${opponentMatches.length}`,
      reaction1MT: pctReaction1MT,
      cleanSheetH2H: cleanSheetBlock,
    },
  };
}

// ============================================================
// ANALYSE DC — H2H entre les 2 équipes
// ============================================================

/**
 * Analyse DC basée sur les H2H.
 * @returns {object} analyse DC
 */
export async function analyzeDC(homeId, awayId) {
  const h2h = await getH2H(homeId, awayId);

  if (h2h.length < MIN_MATCHES) {
    return { hasData: false, reason: 'Pas assez de H2H' };
  }

  // Classifier chaque H2H
  let homeWins = 0, homeLosses = 0, awayWins = 0, awayLosses = 0, draws = 0;
  for (const m of h2h) {
    const hg = m.home_goals ?? 0;
    const ag = m.away_goals ?? 0;
    const isHome = m.home_team_id === homeId;

    if (hg > ag) {
      if (isHome) homeWins++; else awayLosses++;
      if (!isHome) awayWins++; else homeLosses++;
    } else if (ag > hg) {
      if (isHome) homeLosses++; else awayWins++;
      if (!isHome) homeWins++; else awayLosses++;
    } else {
      draws++;
    }
  }

  // Recalculer proprement
  const total = h2h.length;
  // Du point de vue de homeId
  const homeDefeatPct = Math.round((homeLosses / total) * 100);
  // Du point de vue de awayId
  const awayDefeatPct = Math.round((awayLosses / total) * 100);

  const bestSide = homeDefeatPct <= awayDefeatPct ? 'home' : 'away';
  const bestDefeatPct = Math.min(homeDefeatPct, awayDefeatPct);
  const confidence = bestDefeatPct <= DC_SEUIL_FORT ? 'fort' : bestDefeatPct <= DC_SEUIL_MOYEN ? 'moyen' : null;

  return {
    hasData: true,
    isAlert: confidence !== null,
    confidence,
    homeDefeatPct,
    awayDefeatPct,
    bestSide,
    bestDefeatPct,
    h2hCount: total,
    homeWins,
    awayWins,
    draws,
    homeLosses,
    awayLosses,
  };
}

// ============================================================
// GÉNÉRATION D'ALERTES — pour un ensemble de matchs
// ============================================================

/**
 * Génère les alertes pour une liste de matchs.
 * Retourne les alertes à insérer (sans les doublons).
 */
export async function generateAlerts(matches) {
  // Récupérer les match_ids déjà en base
  const matchIds = matches.map(m => m.id).filter(Boolean);
  const { data: existing } = await supabase
    .from('alerts')
    .select('match_id')
    .in('match_id', matchIds);
  const existingIds = new Set((existing || []).map(a => a.match_id));

  const alerts = [];

  for (const m of matches) {
    if (!m.id || !m.homeID || !m.awayID) continue;
    if (existingIds.has(m.id)) continue; // Skip doublons

    // Analyse FHG pour l'équipe dom et ext
    const fhgHome = await analyzeFHG(m.homeID, 'home', m.awayID);
    const fhgAway = await analyzeFHG(m.awayID, 'away', m.homeID);

    // Prendre le meilleur signal FHG
    const bestFHG = (fhgHome.isAlert && fhgAway.isAlert)
      ? (fhgHome.score >= fhgAway.score ? fhgHome : fhgAway)
      : fhgHome.isAlert ? fhgHome
      : fhgAway.isAlert ? fhgAway
      : null;

    // Analyse DC
    const dc = await analyzeDC(m.homeID, m.awayID);

    // Déterminer le signal_type
    const hasFHG = bestFHG !== null;
    const hasDC = dc.isAlert;

    if (!hasFHG && !hasDC) continue; // Pas d'alerte

    const signalType = hasFHG && hasDC ? 'FHG+DC' : hasFHG ? 'FHG' : 'DC';
    const confidence = (hasFHG && bestFHG.confidence === 'fort') || (hasDC && dc.confidence === 'fort')
      ? 'fort' : 'moyen';

    alerts.push({
      match_id: m.id,
      match_date: m.date_unix ? new Date(m.date_unix * 1000).toISOString().split('T')[0] : null,
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
      dc_defeat_pct: dc.isAlert ? dc.bestDefeatPct : null,
      dc_best_side: dc.isAlert ? dc.bestSide : null,
      dc_confidence: dc.isAlert ? dc.confidence : null,
      h2h_count: dc.h2hCount || bestFHG?.h2hCount || 0,
      confidence,
      status: 'pending',
    });
  }

  return alerts;
}

// ============================================================
// VÉRIFICATION DES RÉSULTATS
// ============================================================

/**
 * Vérifie le résultat d'une alerte à partir des données du match terminé.
 * FHG : check à la MT (but en 1MT = validé)
 * DC : check au FT (côté recommandé n'a pas perdu = validé)
 */
export function verifyAlertResult(alert, matchData) {
  const htHome = matchData.team_a_ht_score ?? matchData.ht_goals_team_a ?? matchData.result_ht_home ?? null;
  const htAway = matchData.team_b_ht_score ?? matchData.ht_goals_team_b ?? matchData.result_ht_away ?? null;
  const ftHome = matchData.homeGoalCount ?? matchData.home_goals ?? matchData.result_home_goals ?? null;
  const ftAway = matchData.awayGoalCount ?? matchData.away_goals ?? matchData.result_away_goals ?? null;

  const updates = {
    result_home_goals: ftHome,
    result_away_goals: ftAway,
    result_ht_home: htHome,
    result_ht_away: htAway,
    verified_at: new Date().toISOString(),
  };

  // FHG : validé si au moins 1 but en 1MT
  if (alert.signal_type === 'FHG' || alert.signal_type === 'FHG+DC') {
    if (htHome !== null && htAway !== null) {
      updates.fhg_result = (htHome + htAway > 0) ? 'validated' : 'lost';
    }
  }

  // DC : validé si le côté recommandé n'a pas perdu
  if (alert.signal_type === 'DC' || alert.signal_type === 'FHG+DC') {
    if (ftHome !== null && ftAway !== null && alert.dc_best_side) {
      if (alert.dc_best_side === 'home') {
        updates.dc_result = (ftHome >= ftAway) ? 'validated' : 'lost';
      } else {
        updates.dc_result = (ftAway >= ftHome) ? 'validated' : 'lost';
      }
    }
  }

  // Statut global
  const results = [updates.fhg_result, updates.dc_result].filter(Boolean);
  if (results.length > 0) {
    updates.status = results.every(r => r === 'validated') ? 'validated'
      : results.some(r => r === 'validated') ? 'validated' // Au moins un validé
      : 'lost';
  }

  return updates;
}
