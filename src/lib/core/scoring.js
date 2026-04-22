/* ================================================
   scoring.js — Logique FHG (% bruts) + DC
   FHG Tracker
   ================================================ */

const MIN_MATCHES = 5;
const FHG_SEUIL_FORT = 80;
const FHG_SEUIL_MOYEN = 70;

/**
 * Calcule le score FHG pour une équipe ciblée face à un adversaire.
 * Retourne des pourcentages bruts au lieu d'un score 0-100 pondéré.
 *
 * @param {Object} equipe - Stats de l'équipe (matches_played, goals_scored_min_31_to_45, etc.)
 * @param {Array}  h2h    - Historique H2H [{equipe_ciblee_but_avant_45min: bool}]
 * @param {Object} config - Options (filtreH2HActif, adversaire)
 * @returns {Object} Résultat avec % bruts et composite
 */
export function calculerScoreFHG(equipe, h2h = [], config = {}) {
  const {
    filtreH2HActif = true,
    adversaire = null,
  } = config;

  const nbH2H = h2h.length;
  let warningH2H = 'insuffisant';
  let butsH2H1MT = 0;

  // --- Filtre H2H Clean Sheet (exclusion totale) ---
  if (filtreH2HActif && nbH2H >= 3) {
    butsH2H1MT = h2h.filter(m => m.equipe_ciblee_but_avant_45min === true).length;

    if (butsH2H1MT === 0) {
      return {
        compositeScore: 0,
        exclu: true,
        excluded: true,
        raisonExclusion: `Clean Sheet H2H : 0 but en 1MT sur ${nbH2H} confrontation${nbH2H > 1 ? 's' : ''} contre cet adversaire.`,
        exclusionReason: `Clean Sheet H2H : 0 but en 1MT sur ${nbH2H} confrontation${nbH2H > 1 ? 's' : ''}`,
        warningH2H: 'rouge',
        butsH2H1MT: 0,
        nbH2H,
        pct1MT: 0,
        pct2Plus1MT: 0,
        pctAdversaire: 0,
        pctReaction: null,
        confidence: null,
        isAlert: false,
        context: null,
        // Legacy compatibility
        score: 0,
        signal: 'faible',
      };
    } else if (butsH2H1MT === 1) {
      warningH2H = 'orange';
    } else {
      warningH2H = 'vert';
    }
  } else if (nbH2H < 3) {
    warningH2H = 'insuffisant';
  }

  const mp = equipe.matches_played || 1;

  // --- Pourcentages bruts ---

  // % matchs où l'équipe a marqué en 1MT (31-45 min ou first half)
  const pct1MT = Math.round(((equipe.matches_scored_first_half || 0) / mp) * 100);

  // % matchs avec 2+ buts en 1MT
  const pct2Plus1MT = Math.round(((equipe.matches_2plus_goals_first_half || 0) / mp) * 100);

  // % adversaire encaisse en 1MT
  let pctAdversaire = 0;
  if (adversaire) {
    const advMp = adversaire.matches_played || 1;
    pctAdversaire = Math.round(((adversaire.goals_conceded_first_half || 0) / advMp) * 100);
  }

  // % réaction quand menée
  let pctReaction = null;
  if (equipe.matches_behind_and_scored !== undefined && equipe.matches_behind !== undefined && equipe.matches_behind >= 2) {
    pctReaction = Math.round(((equipe.matches_behind_and_scored || 0) / equipe.matches_behind) * 100);
  }

  // --- Score composite ---
  let compositeScore;
  if (pctReaction !== null) {
    compositeScore = pct1MT * 0.50 + pctAdversaire * 0.25 + pct2Plus1MT * 0.15 + pctReaction * 0.10;
  } else {
    compositeScore = pct1MT * 0.55 + pctAdversaire * 0.28 + pct2Plus1MT * 0.17;
  }
  compositeScore = Math.round(compositeScore);

  // --- Filtre adversaire : encaisse-t-il assez ? ---
  let adversaireExclu = false;
  if (adversaire && adversaire.matches_played_context >= 5) {
    const conceded = adversaire.matches_conceded_first_half || 0;
    const total = adversaire.matches_played_context || 5;
    if (conceded < 2) {
      adversaireExclu = true;
    }
  }

  // --- Confiance et alerte ---
  const confidence = compositeScore >= FHG_SEUIL_FORT ? 'fort' : compositeScore >= FHG_SEUIL_MOYEN ? 'moyen' : null;
  const isAlert = confidence !== null && !adversaireExclu;

  // Legacy signal mapping for MatchCard compatibility
  const signal = confidence === 'fort' ? 'fort' : confidence === 'moyen' ? 'moyen' : 'faible';

  return {
    // New % bruts
    pct1MT,
    pct2Plus1MT,
    pctAdversaire,
    pctReaction,
    compositeScore,
    confidence,
    isAlert,
    excluded: adversaireExclu,
    exclusionReason: adversaireExclu ? 'Adversaire trop solide en 1MT' : null,

    // Status
    exclu: false,
    raisonExclusion: null,

    // H2H info
    warningH2H,
    butsH2H1MT,
    nbH2H,

    // Legacy compatibility (MatchCard.svelte)
    score: compositeScore,
    signal,
    tauxN: pct1MT,
    forme5M: 0,
    badge1MT50: pct1MT >= 50,
    debutSaison: false,
    tropBeau: false,
  };
}

/**
 * Calcule le score DC pour une équipe, uniquement si FHG validé.
 */
export function calculerScoreDC(equipe, scoreFHG) {
  if (!scoreFHG || scoreFHG < 70) return null;

  let score = 0;

  score += (equipe.pct_retour_si_encaisse || 0) * 0.40;
  score += (scoreFHG / 100) * 30;
  score += (equipe.pct_victoire_domicile || 0) * 0.20;
  score += (equipe.matches_played || 0) > 10 ? 10 : 0;

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
    if (scoreHome.compositeScore >= scoreAway.compositeScore) {
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
    ? calculerScoreDC(teamData, scoreChoisi.compositeScore)
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
