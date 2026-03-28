/* ================================================
   filters.js — Filtres et tris des signaux
   FHG Tracker
   ================================================ */

/**
 * Filtrer et trier les matchs analysés.
 *
 * @param {Array}  matchesAnalyses  — matchs déjà scorés
 * @param {Object} filtres          — critères de filtrage
 * @returns {Object}                — { signaux, exclus, watchlist }
 */
export function filtrerMatchs(matchesAnalyses, filtres = {}) {
  const {
    seuilMinimum  = 60,      // score min pour être dans signaux
    seuil1MTOnly  = false,   // toggle "1MT 50%+ uniquement"
    contexte      = 'tous',  // tous | domicile | exterieur
    ligue         = 'toutes',
    afficherExclus = false,
  } = filtres;

  const signaux   = [];
  const exclus    = [];
  const watchlist = [];

  matchesAnalyses.forEach(m => {
    if (m.exclu) {
      exclus.push(m);
      return;
    }

    const score = m.scoreChoisi?.score || 0;

    // Filtre contexte
    if (contexte === 'domicile' && m.context !== 'DOM') return;
    if (contexte === 'exterieur' && m.context !== 'EXT') return;

    // Filtre ligue
    if (ligue !== 'toutes' && m.leagueId !== ligue) return;

    // Filtre 1MT 50%+ uniquement
    if (seuil1MTOnly && !m.scoreChoisi?.badge1MT50) return;

    if (score >= 75) {
      signaux.push(m);
    } else if (score >= 60) {
      signaux.push(m);
      if (score < seuilMinimum) watchlist.push(m);
    } else if (score >= 50) {
      watchlist.push(m);
    }
    // score < 50 → ignoré
  });

  // Trier par score décroissant
  const sortByScore = (a, b) =>
    (b.scoreChoisi?.score || 0) - (a.scoreChoisi?.score || 0);

  signaux.sort(sortByScore);
  watchlist.sort(sortByScore);

  return { signaux, exclus, watchlist };
}

/**
 * Filtres pour la page "Matchs à venir".
 */
export function filtrerMatchsUpcoming(matchesAnalyses, filtres = {}) {
  const {
    plage         = 'aujourd_hui',
    ligue         = 'toutes',
    signalMin     = 0,         // score min
    contexte      = 'tous',
    seuil1MTOnly  = false,
    afficherExclus = false,
  } = filtres;

  const today = new Date().toISOString().split('T')[0];

  return matchesAnalyses.filter(m => {
    // Exclure les matchs H2H sauf si demandé explicitement
    if (m.exclu && !afficherExclus) return false;

    // Filtre plage de date
    if (plage === 'aujourd_hui' && m.date !== today) return false;

    // Filtre ligue
    if (ligue !== 'toutes' && m.leagueId !== ligue) return false;

    // Filtre signal minimum
    const score = m.scoreChoisi?.score || 0;
    if (score < signalMin) return false;

    // Filtre contexte
    if (contexte === 'domicile'  && m.context !== 'DOM') return false;
    if (contexte === 'exterieur' && m.context !== 'EXT') return false;

    // Filtre 1MT 50%+
    if (seuil1MTOnly && !m.scoreChoisi?.badge1MT50) return false;

    return true;
  }).sort((a, b) =>
    (b.scoreChoisi?.score || 0) - (a.scoreChoisi?.score || 0)
  );
}

/**
 * Calculer les stats agrégées pour le dashboard.
 */
export function calcDashboardStats(signaux, exclus, leaguesActives) {
  const forts = signaux.filter(m => m.scoreChoisi?.signal === 'fort').length;
  const total = signaux.length + exclus.length;
  return {
    signauxForts:    forts,
    matchesAnalyses: total,
    liguesActives:   leaguesActives,
    matchesExclus:   exclus.length,
  };
}

/**
 * Calculer les stats par ligue pour la page Ligues.
 */
export function calcLeagueStats(matchesAnalyses, leagueId) {
  const leagueMatches = matchesAnalyses.filter(m => m.leagueId === leagueId);
  if (leagueMatches.length === 0) {
    return { avgFHG: 0, avg1MT: 0, forts: 0, badge1MT: 0, exclus: 0 };
  }

  const non_exclus = leagueMatches.filter(m => !m.exclu);
  const avgFHG = non_exclus.length > 0
    ? Math.round(non_exclus.reduce((s, m) => s + (m.scoreChoisi?.tauxN || 0), 0) / non_exclus.length)
    : 0;
  const avg1MT = non_exclus.length > 0
    ? Math.round(non_exclus.reduce((s, m) => s + (m.scoreChoisi?.pct1MT || 0), 0) / non_exclus.length)
    : 0;
  const forts  = non_exclus.filter(m => m.scoreChoisi?.signal === 'fort').length;
  const badge1MTCount = non_exclus.filter(m => m.scoreChoisi?.badge1MT50).length;
  const exclus = leagueMatches.filter(m => m.exclu).length;

  return { avgFHG, avg1MT, forts, badge1MT: badge1MTCount, exclus };
}

/**
 * Vérifier si un match est dans la fenêtre active (31-45e).
 * Retourne true si le match est en cours dans la tranche.
 */
export function isWindowActive(matchTime) {
  if (!matchTime) return false;
  const now = new Date();
  const [h, m] = matchTime.split(':').map(Number);
  const matchStart = new Date();
  matchStart.setHours(h, m, 0, 0);

  const elapsed = Math.floor((now - matchStart) / 60000); // minutes écoulées
  return elapsed >= 30 && elapsed <= 45;
}

/**
 * Compte à rebours jusqu'au prochain match.
 */
export function getNextMatchCountdown(matches) {
  const now = new Date();
  const upcoming = matches
    .filter(m => m.status === 'upcoming' && m.time)
    .map(m => {
      const [h, mi] = m.time.split(':').map(Number);
      const t = new Date();
      t.setHours(h, mi, 0, 0);
      return { match: m, time: t, diff: t - now };
    })
    .filter(x => x.diff > 0)
    .sort((a, b) => a.diff - b.diff);

  if (upcoming.length === 0) return null;
  const next = upcoming[0];
  const diff = next.diff;
  const hours = Math.floor(diff / 3600000);
  const mins  = Math.floor((diff % 3600000) / 60000);
  return {
    match: next.match,
    hours, mins,
    label: hours > 0 ? `${hours}h ${mins}min` : `${mins} min`,
  };
}
