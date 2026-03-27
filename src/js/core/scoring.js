/**
 * scoring.js — Logique de scoring FHG + DC
 * Implémentation exacte de la méthode décrite
 */

/**
 * Calculer le score FHG complet d'une équipe pour un match
 *
 * @param {Object} equipe - données de l'équipe
 *   - matches_played: matchs joués saison N
 *   - goals_scored_min_31_to_45: buts 31-45 saison N
 *   - matches_played_n1: matchs joués saison N-1
 *   - goals_scored_min_31_to_45_n1: buts 31-45 saison N-1
 *   - buts_31_45_sur_5_derniers: buts 31-45 sur 5 derniers matchs
 *   - matches_scored_first_half: matchs avec but 1MT cette saison
 * @param {Array} h2h - liste confrontations directes
 *   - equipe_ciblee_but_avant_45min: boolean
 * @param {Object} config - configuration des alertes
 *
 * @returns {Object} résultat du calcul
 */
export function calculerScoreFHG(equipe, h2h = [], config = {}) {
  const penaliteH2H = config.penaliteH2HOrange ?? -8;
  const seuil1MT = config.seuil1MT ?? 50;
  const minMatchesH2H = config.minMatchesH2HPourExclusion ?? 3;
  const filtreH2HActif = config.filtreH2HActif !== false;

  // ─── ÉTAPE 1 — FILTRE H2H CLEAN SHEET ─────────────────────
  let warningH2H = 'insuffisant';

  if (filtreH2HActif && h2h && h2h.length >= minMatchesH2H) {
    const butsH2H1MT = h2h.filter(m => m.equipe_ciblee_but_avant_45min === true).length;

    if (butsH2H1MT === 0) {
      return {
        score: 0,
        exclu: true,
        raisonExclusion: `Clean Sheet H2H : 0 but en 1MT sur ${h2h.length} confrontation${h2h.length > 1 ? 's' : ''} contre cet adversaire. Match non sélectionnable.`,
        warningH2H: 'rouge',
        signal: 'exclu',
        badge1MT50: false,
        pct1MT: 0,
        tauxN: 0,
        tauxN1: 0,
        forme5M: 0,
      };
    } else if (butsH2H1MT === 1) {
      warningH2H = 'orange';
    } else {
      warningH2H = 'vert';
    }
  }

  // ─── ÉTAPE 2 — SCORE FHG BASE ──────────────────────────────
  const mp = equipe.matches_played || 0;
  const mpN1 = equipe.matches_played_n1 || 0;

  const tauxN = mp > 0
    ? ((equipe.goals_scored_min_31_to_45 || 0) / mp) * 100
    : 0;

  const tauxN1 = mpN1 > 0
    ? ((equipe.goals_scored_min_31_to_45_n1 || 0) / mpN1) * 100
    : tauxN; // Si pas de N-1, on utilise N seul

  const forme5M = ((equipe.buts_31_45_sur_5_derniers || 0) / 5) * 100;

  // Formule B : pondération saison N (60%), N-1 (25%), forme (15%)
  let score = (tauxN * 0.60) + (tauxN1 * 0.25) + (forme5M * 0.15);

  // ─── ÉTAPE 3 — PÉNALITÉ H2H ORANGE ────────────────────────
  if (warningH2H === 'orange') {
    score += penaliteH2H; // valeur négative
  }

  // ─── ÉTAPE 4 — BONUS 1MT 50%+ ─────────────────────────────
  const pct1MT = mp > 0
    ? ((equipe.matches_scored_first_half || 0) / mp) * 100
    : 0;

  const badge1MT50 = pct1MT >= seuil1MT;

  if (pct1MT >= 65) score += 8;
  else if (pct1MT >= seuil1MT) score += 4;

  // ─── ÉTAPE 5 — STABILITÉ INTER-SAISONS ────────────────────
  const ecart = Math.abs(tauxN - tauxN1);
  if (ecart <= 8) score += 3;
  if (ecart > 15) score -= 5;

  // ─── ÉTAPE 6 — MALUS DÉBUT DE SAISON ──────────────────────
  const seuilMatchesSaison = config.seuilMatchesSaison ?? 8;
  const debutSaison = mp < seuilMatchesSaison;
  if (debutSaison) score -= 10;

  // ─── SIGNAL ────────────────────────────────────────────────
  const scoreFinal = Math.round(score);
  let signal;
  if (scoreFinal >= 75) signal = 'fort';
  else if (scoreFinal >= 60) signal = 'moyen';
  else signal = 'faible';

  // Warning "trop beau = douille" si FHG > 88%
  const warningTropBeau = tauxN > 88;

  return {
    score: scoreFinal,
    exclu: false,
    signal,
    tauxN: Math.round(tauxN),
    tauxN1: Math.round(tauxN1),
    forme5M: Math.round(forme5M),
    pct1MT: Math.round(pct1MT),
    badge1MT50,
    warningH2H,
    debutSaison,
    warningTropBeau,
    ecartSaisons: Math.round(ecart),
  };
}

/**
 * Calculer le score DC (Double Chance)
 * Uniquement activé si FHG validé (score >= 60)
 *
 * @param {Object} equipe
 * @param {number} scoreFHG
 * @param {Object} config
 */
export function calculerScoreDC(equipe, scoreFHG, config = {}) {
  const seuilDC = config.seuilDC ?? 55;

  // Règle absolue : DC uniquement si FHG validé
  if (scoreFHG < 60) return null;

  let score = 0;
  const pctRetour = equipe.pct_retour_si_encaisse || 0;
  const pctVicDom = equipe.pct_victoire_domicile || 0;
  const mp = equipe.matches_played || 0;

  score += pctRetour * 0.40;
  score += (scoreFHG / 100) * 30;
  score += pctVicDom * 0.20;
  score += (mp > 10 ? 10 : 0);

  const scoreFinal = Math.round(score);
  const contexteDC = pctRetour >= seuilDC;

  return {
    score: scoreFinal,
    pctRetour: Math.round(pctRetour),
    contexteDC,
  };
}

/**
 * Obtenir le timer conseillé selon le profil du joueur
 * @param {string} profil - 'debutant' | 'intermediaire' | 'expert'
 */
export function getTimerConseille(profil) {
  switch (profil) {
    case 'debutant':
      return {
        label: 'Débutant',
        tranche: '5e-10e minute',
        cote: '~1,50',
        description: 'Entrée précoce, cote basse, risque limité',
      };
    case 'expert':
      return {
        label: 'Expert',
        tranche: '25e-35e minute',
        cote: '2,30+',
        description: 'Attente maximale, cote haute, signal confirmé',
      };
    default: // intermediaire
      return {
        label: 'Intermédiaire',
        tranche: '15e-20e minute',
        cote: '~1,80',
        description: 'Équilibre entre timing et valeur de cote',
      };
  }
}

/**
 * Vérifier si un match est dans la fenêtre active (31-45min)
 * @param {number} minuteActuelle
 */
export function estDansFenetreActive(minuteActuelle) {
  return minuteActuelle >= 31 && minuteActuelle <= 45;
}

/**
 * Obtenir le niveau de signal et sa couleur CSS
 * @param {number} score
 */
export function getSignalInfo(score) {
  if (score >= 75) return { label: 'FORT', class: 'fort', colorClass: 'badge-fort' };
  if (score >= 60) return { label: 'MOYEN', class: 'moyen', colorClass: 'badge-moyen' };
  return { label: 'FAIBLE', class: 'faible', colorClass: 'badge-faible' };
}

/**
 * Calculer le pourcentage de barre de progression avec couleur
 * @param {number} taux - pourcentage
 */
export function getProgressColor(taux) {
  if (taux >= 75) return 'green';
  if (taux >= 60) return 'orange';
  return 'gray';
}
