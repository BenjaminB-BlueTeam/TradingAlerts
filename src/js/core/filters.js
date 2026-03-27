/**
 * filters.js — Filtres et tris des matchs
 */

/**
 * Filtrer les matchs selon les critères de la page "Matchs à venir"
 * @param {Array} matches - tableau de matchs avec leur score
 * @param {Object} filtres
 */
export function filtrerMatchs(matches, filtres = {}) {
  const {
    dateRange = 'today',     // 'today'|'j1'|'j2'|'j3'
    ligue = 'all',
    signalMin = 0,           // score minimum
    contexte = 'all',        // 'all'|'dom'|'ext'
    seulement1MT = false,    // toggle badge 1MT 50%+
    afficherExclus = false,  // toggle matchs exclus
  } = filtres;

  let result = matches.filter(m => {
    // Exclure les matchs exclus (sauf si toggle actif)
    if (m.resultatFHG?.exclu && !afficherExclus) return false;

    // Filtre ligue
    if (ligue !== 'all' && m.leagueId !== ligue) return false;

    // Filtre signal minimum
    if (!m.resultatFHG?.exclu && m.resultatFHG?.score < signalMin) return false;

    // Filtre contexte
    if (contexte === 'dom' && !m.isHome) return false;
    if (contexte === 'ext' && m.isHome) return false;

    // Filtre 1MT 50%+
    if (seulement1MT && !m.resultatFHG?.badge1MT50) return false;

    return true;
  });

  return result;
}

/**
 * Trier les matchs par score décroissant
 * @param {Array} matches
 */
export function trierParScore(matches) {
  return [...matches].sort((a, b) => {
    const scoreA = a.resultatFHG?.score ?? 0;
    const scoreB = b.resultatFHG?.score ?? 0;
    return scoreB - scoreA;
  });
}

/**
 * Trier les matchs par heure
 * @param {Array} matches
 */
export function trierParHeure(matches) {
  return [...matches].sort((a, b) => {
    const timeA = a.matchTime || '00:00';
    const timeB = b.matchTime || '00:00';
    return timeA.localeCompare(timeB);
  });
}

/**
 * Séparer les matchs en : forts, moyens, watchlist, exclus
 * @param {Array} matches
 */
export function categoriserMatchs(matches) {
  const forts = [];
  const moyens = [];
  const watchlist = [];
  const exclus = [];

  for (const m of matches) {
    if (m.resultatFHG?.exclu) {
      exclus.push(m);
    } else {
      const score = m.resultatFHG?.score ?? 0;
      if (score >= 75) forts.push(m);
      else if (score >= 60) moyens.push(m);
      else watchlist.push(m);
    }
  }

  return { forts, moyens, watchlist, exclus };
}

/**
 * Filtrer les matchs en cours dans la fenêtre 31-45min
 * @param {Array} matches
 * @param {number} now - timestamp actuel
 */
export function getMatchsEnFenetre(matches, now = Date.now()) {
  return matches.filter(m => {
    if (!m.matchTimestamp) return false;
    const elapsed = Math.floor((now - m.matchTimestamp) / 60000);
    return elapsed >= 31 && elapsed <= 45;
  });
}

/**
 * Calculer les stats du dashboard à partir des matchs
 * @param {Array} matches
 */
export function calcDashboardStats(matches) {
  const exclus = matches.filter(m => m.resultatFHG?.exclu).length;
  const analyses = matches.filter(m => !m.resultatFHG?.exclu).length;
  const forts = matches.filter(m => !m.resultatFHG?.exclu && m.resultatFHG?.score >= 75).length;

  // Ligues uniques actives
  const liguesSet = new Set(matches.map(m => m.leagueId).filter(Boolean));

  return {
    forts,
    analyses,
    liguesActives: liguesSet.size,
    exclus,
  };
}

/**
 * Obtenir les matchs de la "prochaine fenêtre"
 * (matchs commençant dans les 30 prochaines minutes)
 * @param {Array} matches
 * @param {number} now
 */
export function getProchaineFenetre(matches, now = Date.now()) {
  const dans30min = now + 30 * 60 * 1000;

  return matches.filter(m => {
    if (!m.matchTimestamp) return false;
    return m.matchTimestamp > now && m.matchTimestamp <= dans30min;
  });
}
