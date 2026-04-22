/* ================================================
   netlify/functions/lib/analysis.js
   Extracted analysis functions for FHG and DC alerts.
   Used by generate-alerts.js and testable independently.
   ================================================ */

const MIN_MATCHES = 5;
const FHG_SEUIL_MOYEN = 70;
const FHG_SEUIL_FORT = 80;
const DC_SEUIL_MOYEN = 30;
const DC_SEUIL_FORT = 20;

function analyzeFHGFromMatches(matches, context, h2h, teamId, opponentMatches) {
  if (matches.length < MIN_MATCHES) return null;

  const teamIsHome = context === 'home';

  // Compter les buts dans la fenetre 31-45 min via goal_events
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

  // Reaction quand adversaire marque en 31-45 min
  let pctReaction1MT = null;
  const oppScored = matches.filter((_, i) => oppGoals3145[i] > 0);
  if (oppScored.length >= 2) {
    const reactions = oppScored.filter((m) => {
      const origIdx = matches.indexOf(m);
      return teamGoals3145[origIdx] > 0;
    }).length;
    pctReaction1MT = Math.round((reactions / oppScored.length) * 100);
  }

  // Clean sheet H2H — l'équipe n'a JAMAIS marqué dans les H2H (toutes minutes)
  let cleanSheetBlock = false;
  if (h2h.length >= 3) {
    const h2hGoals = h2h.filter(m => {
      const teamIsHomeInH2H = m.home_team_id === teamId;
      const scored = teamIsHomeInH2H ? (m.home_goals || 0) : (m.away_goals || 0);
      return scored > 0;
    }).length;
    if (h2hGoals === 0) cleanSheetBlock = true;
  }

  // Adversaire — encaisse-t-il assez ?
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

module.exports = {
  analyzeFHGFromMatches,
  analyzeDCFromH2H,
  MIN_MATCHES,
  FHG_SEUIL_MOYEN,
  FHG_SEUIL_FORT,
  DC_SEUIL_MOYEN,
  DC_SEUIL_FORT,
};
