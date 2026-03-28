/* ================================================
   scoring.js — Logique FHG + DC
   FHG Tracker
   ================================================ */

/**
 * Calcule le score FHG pour une équipe ciblée face à un adversaire.
 */
export function calculerScoreFHG(equipe, h2h = [], config = {}) {
  const {
    ponderationN1  = true,
    ignoreDebutSaison = true,
    seuilMatchsMin = 8,
    penaliteH2H    = 8,
    filtreH2HActif = true,
  } = config;

  let warningH2H = 'insuffisant';
  let butsH2H1MT = 0;
  const nbH2H = h2h.length;

  if (filtreH2HActif && nbH2H >= 3) {
    butsH2H1MT = h2h.filter(m => m.equipe_ciblee_but_avant_45min === true).length;

    if (butsH2H1MT === 0) {
      return {
        score: 0,
        exclu: true,
        raisonExclusion: `Clean Sheet H2H : 0 but en 1MT sur ${nbH2H} confrontation${nbH2H > 1 ? 's' : ''} contre cet adversaire.`,
        warningH2H: 'rouge',
        butsH2H1MT: 0,
        nbH2H,
        badge1MT50: false,
        tauxN: 0, tauxN1: 0, forme5M: 0, pct1MT: 0,
      };
    } else if (butsH2H1MT === 1) {
      warningH2H = 'orange';
    } else {
      warningH2H = 'vert';
    }
  } else if (nbH2H < 3) {
    warningH2H = 'insuffisant';
  }

  const mp  = equipe.matches_played   || 1;
  const mp1 = equipe.matches_played_n1 || 1;

  const tauxN = ((equipe.goals_scored_min_31_to_45 || 0) / mp) * 100;
  const tauxN1 = ponderationN1
    ? ((equipe.goals_scored_min_31_to_45_n1 || 0) / mp1) * 100
    : tauxN;

  const forme5M = ((equipe.buts_31_45_sur_5_derniers || 0) / 5) * 100;

  let score = (tauxN * 0.60) + (tauxN1 * 0.25) + (forme5M * 0.15);

  if (warningH2H === 'orange') {
    score -= penaliteH2H;
  }

  const pct1MT = ((equipe.matches_scored_first_half || 0) / mp) * 100;
  const badge1MT50 = pct1MT >= 50;

  if (pct1MT >= 65)      score += 8;
  else if (pct1MT >= 50) score += 4;

  if (ponderationN1) {
    const ecart = Math.abs(tauxN - tauxN1);
    if (ecart <= 8)  score += 3;
    if (ecart > 15)  score -= 5;
  }

  const debutSaison = ignoreDebutSaison && mp < seuilMatchsMin;
  if (debutSaison) score -= 10;

  score = Math.max(0, score);

  let signal = 'faible';
  if (score >= 75) signal = 'fort';
  else if (score >= 60) signal = 'moyen';

  const tropBeau = tauxN > 88;

  return {
    score:     Math.round(score),
    exclu:     false,
    signal,
    tauxN:     Math.round(tauxN),
    tauxN1:    Math.round(tauxN1),
    forme5M:   Math.round(forme5M),
    pct1MT:    Math.round(pct1MT),
    badge1MT50,
    warningH2H,
    butsH2H1MT,
    nbH2H,
    debutSaison,
    tropBeau,
  };
}

/**
 * Calcule le score DC pour une équipe, uniquement si FHG validé.
 */
export function calculerScoreDC(equipe, scoreFHG) {
  if (!scoreFHG || scoreFHG < 60) return null;

  const mp = equipe.matches_played || 1;
  let score = 0;

  score += (equipe.pct_retour_si_encaisse || 0) * 0.40;
  score += (scoreFHG / 100) * 30;
  score += (equipe.pct_victoire_domicile || 0) * 0.20;
  score += mp > 10 ? 10 : 0;

  return Math.round(score);
}

/**
 * Analyser un match complet et retourner les scores home/away.
 */
export function analyserMatch(match, homeTeam, awayTeam, h2hHome, h2hAway, config) {
  if (!homeTeam && !awayTeam) return null;

  const scoreHome = homeTeam
    ? calculerScoreFHG(homeTeam, h2hHome, config)
    : null;
  const scoreAway = awayTeam
    ? calculerScoreFHG(awayTeam, h2hAway, config)
    : null;

  let equipeChoisie = null;
  let scoreChoisi   = null;
  let teamData      = null;

  const homeValide = scoreHome && !scoreHome.exclu;
  const awayValide = scoreAway && !scoreAway.exclu;

  if (homeValide && awayValide) {
    if (scoreHome.score >= scoreAway.score) {
      equipeChoisie = match.homeName;
      scoreChoisi   = scoreHome;
      teamData      = homeTeam;
    } else {
      equipeChoisie = match.awayName;
      scoreChoisi   = scoreAway;
      teamData      = awayTeam;
    }
  } else if (homeValide) {
    equipeChoisie = match.homeName;
    scoreChoisi   = scoreHome;
    teamData      = homeTeam;
  } else if (awayValide) {
    equipeChoisie = match.awayName;
    scoreChoisi   = scoreAway;
    teamData      = awayTeam;
  } else {
    const raisonPrincipale = scoreHome?.exclu
      ? scoreHome.raisonExclusion
      : scoreAway?.raisonExclusion || 'Données insuffisantes';
    return {
      ...match,
      exclu: true,
      raisonExclusion: raisonPrincipale,
      scoreHome, scoreAway,
    };
  }

  const scoreDC = config.analyseDC
    ? calculerScoreDC(teamData, scoreChoisi.score)
    : null;

  return {
    ...match,
    exclu:         false,
    equipeSignal:  equipeChoisie,
    scoreChoisi,
    scoreHome,
    scoreAway,
    scoreDC,
    teamData,
  };
}

/**
 * Timer conseillé selon le profil du joueur.
 */
export function getTimerConseille(profil) {
  switch (profil) {
    case 'debutant':
      return { min: 5,  max: 10,  cote: '~1.50', label: 'Débutant (5-10e, cote ~1.50)' };
    case 'expert':
      return { min: 25, max: 35,  cote: '2.30+', label: 'Expert (25-35e, cote 2.30+)' };
    default:
      return { min: 15, max: 20, cote: '~1.80', label: 'Intermédiaire (15-20e)' };
  }
}
