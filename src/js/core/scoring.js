/* ================================================
   scoring.js — Logique FHG + DC
   FHG Tracker
   ================================================ */

/**
 * Calcule le score FHG pour une équipe ciblée face à un adversaire.
 *
 * @param {Object} equipe       — données de l'équipe ciblée
 * @param {Array}  h2h          — tableau des 5 derniers H2H
 * @param {Object} config       — configuration alertes (seuils, pénalités)
 * @returns {Object}            — résultat complet du scoring
 */
export function calculerScoreFHG(equipe, h2h = [], config = {}) {
  const {
    ponderationN1  = true,
    ignoreDebutSaison = true,
    seuilMatchsMin = 8,
    penaliteH2H    = 8,
    filtreH2HActif = true,
  } = config;

  // ========================================================
  // ÉTAPE 1 — FILTRE H2H CLEAN SHEET (appliqué EN PREMIER)
  // ========================================================
  let warningH2H = 'insuffisant';
  let butsH2H1MT = 0;
  const nbH2H = h2h.length;

  if (filtreH2HActif && nbH2H >= 3) {
    butsH2H1MT = h2h.filter(m => m.equipe_ciblee_but_avant_45min === true).length;

    if (butsH2H1MT === 0) {
      // EXCLUSION TOTALE — règle absolue, zéro exception
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
    warningH2H = 'insuffisant'; // Pas de pénalité, pas d'exclusion
  }

  // ========================================================
  // ÉTAPE 2 — SCORE FHG BASE (Formule B)
  // ========================================================
  const mp  = equipe.matches_played   || 1;
  const mp1 = equipe.matches_played_n1 || 1;

  const tauxN = ((equipe.goals_scored_min_31_to_45 || 0) / mp) * 100;
  const tauxN1 = ponderationN1
    ? ((equipe.goals_scored_min_31_to_45_n1 || 0) / mp1) * 100
    : tauxN; // si N-1 désactivé, on duplique N

  const forme5M = ((equipe.buts_31_45_sur_5_derniers || 0) / 5) * 100;

  // Pondération : 60% saison N / 25% N-1 / 15% forme 5 matchs
  let score = (tauxN * 0.60) + (tauxN1 * 0.25) + (forme5M * 0.15);

  // ========================================================
  // ÉTAPE 3 — PÉNALITÉ H2H ORANGE
  // ========================================================
  if (warningH2H === 'orange') {
    score -= penaliteH2H;
  }

  // ========================================================
  // ÉTAPE 4 — BONUS 1MT 50%+
  // ========================================================
  const pct1MT = ((equipe.matches_scored_first_half || 0) / mp) * 100;
  const badge1MT50 = pct1MT >= 50;

  if (pct1MT >= 65)      score += 8;
  else if (pct1MT >= 50) score += 4;

  // ========================================================
  // ÉTAPE 5 — STABILITÉ INTER-SAISONS
  // ========================================================
  if (ponderationN1) {
    const ecart = Math.abs(tauxN - tauxN1);
    if (ecart <= 8)  score += 3;
    if (ecart > 15)  score -= 5;
  }

  // ========================================================
  // ÉTAPE 6 — MALUS DÉBUT DE SAISON
  // ========================================================
  const debutSaison = ignoreDebutSaison && mp < seuilMatchsMin;
  if (debutSaison) score -= 10;

  // Clamp à 0 minimum
  score = Math.max(0, score);

  // ========================================================
  // CLASSIFICATION SIGNAL
  // ========================================================
  let signal = 'faible';
  if (score >= 75) signal = 'fort';
  else if (score >= 60) signal = 'moyen';

  // Warning "trop beau" si FHG > 88%
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
 *
 * RÈGLE ABSOLUE : DC identifiée uniquement après FHG.
 * Si scoreFHG < 60, retourne null.
 *
 * @param {Object} equipe     — données de l'équipe
 * @param {number} scoreFHG   — score FHG calculé
 * @returns {number|null}     — score DC ou null
 */
export function calculerScoreDC(equipe, scoreFHG) {
  if (!scoreFHG || scoreFHG < 60) return null;

  const mp = equipe.matches_played || 1;
  let score = 0;

  // Capacité de retour si encaisse
  score += (equipe.pct_retour_si_encaisse || 0) * 0.40;

  // Force du FHG
  score += (scoreFHG / 100) * 30;

  // Avantage domicile
  score += (equipe.pct_victoire_domicile || 0) * 0.20;

  // Bonus données suffisantes
  score += mp > 10 ? 10 : 0;

  return Math.round(score);
}

/**
 * Analyser un match complet et retourner les scores home/away.
 * Retourne l'équipe avec le meilleur score FHG.
 *
 * @param {Object} match      — données du match
 * @param {Object} homeTeam   — stats équipe domicile
 * @param {Object} awayTeam   — stats équipe extérieur
 * @param {Array}  h2h        — H2H pour l'équipe ciblée
 * @param {Object} config
 * @returns {Object}          — analyse complète du match
 */
export function analyserMatch(match, homeTeam, awayTeam, h2hHome, h2hAway, config) {
  if (!homeTeam && !awayTeam) return null;

  // Calculer FHG pour les deux équipes
  const scoreHome = homeTeam
    ? calculerScoreFHG(homeTeam, h2hHome, config)
    : null;
  const scoreAway = awayTeam
    ? calculerScoreFHG(awayTeam, h2hAway, config)
    : null;

  // Sélectionner l'équipe principale (meilleur score non exclu)
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
    // Les deux sont exclus ou invalides → match exclu
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

  // Calculer DC
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
    default: // intermediaire
      return { min: 15, max: 20, cote: '~1.80', label: 'Intermédiaire (15-20e)' };
  }
}
