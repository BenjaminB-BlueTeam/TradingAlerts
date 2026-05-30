/* ================================================
   teamPotential.js — Logique pure du filtre "équipes à fort potentiel".
   Filtre des équipes par seuil LG1% / LG2% CONTEXTUEL (domicile ou extérieur).
   Source de données : lignes team_lg1_cache (lg1_home_pct, lg1_away_pct,
   lg2_home_pct, lg2_away_pct par équipe/saison).

   Sémantique (validée avec Benjamin) :
   - Une équipe passe le seuil LG1 si lg1_home_pct >= seuil OU lg1_away_pct >= seuil.
   - Idem LG2 (dom OU ext).
   - Les deux seuils combinés en OU (l'équipe passe si elle atteint LG1 OU LG2).
   - Un seuil null/non renseigné est ignoré.
   - Si aucun seuil n'est renseigné → aucun résultat (le filtre est inactif).
   ================================================ */

/** Max de deux pourcentages en ignorant les null. Retourne null si les deux sont null. */
function maxPct(a, b) {
  const vals = [a, b].filter(v => v != null);
  return vals.length ? Math.max(...vals) : null;
}

/** Meilleur LG1% contextuel (max dom/ext) d'une ligne team_lg1_cache. */
export function bestLg1(row) {
  return maxPct(row?.lg1_home_pct, row?.lg1_away_pct);
}

/** Meilleur LG2% contextuel (max dom/ext) d'une ligne team_lg1_cache. */
export function bestLg2(row) {
  return maxPct(row?.lg2_home_pct, row?.lg2_away_pct);
}

/**
 * Un des deux contextes (dom OU ext) atteint-il le seuil ?
 * Seuil null => condition ignorée (true).
 */
function contextPasses(homePct, awayPct, min) {
  if (min == null) return true;
  return (homePct != null && homePct >= min) || (awayPct != null && awayPct >= min);
}

/**
 * Une équipe (ligne team_lg1_cache) passe-t-elle les seuils LG1/LG2 ?
 * Combinaison en OU : l'équipe est retenue si elle atteint le seuil LG1 OU le seuil LG2.
 * Un seuil null est ignoré (ne peut pas faire passer l'équipe).
 * @param {object} row - { lg1_home_pct, lg1_away_pct, lg2_home_pct, lg2_away_pct }
 * @param {number|null} lg1Min - seuil LG1 (null = ignoré)
 * @param {number|null} lg2Min - seuil LG2 (null = ignoré)
 * @returns {boolean} false si aucun seuil n'est défini
 */
export function passesThreshold(row, lg1Min, lg2Min) {
  if (!row) return false;
  if (lg1Min == null && lg2Min == null) return false; // filtre inactif
  const lg1Ok = lg1Min != null && contextPasses(row.lg1_home_pct, row.lg1_away_pct, lg1Min);
  const lg2Ok = lg2Min != null && contextPasses(row.lg2_home_pct, row.lg2_away_pct, lg2Min);
  return lg1Ok || lg2Ok;
}

/**
 * Déduplique des lignes team_lg1_cache par team_id, en gardant la plus récente
 * (max updated_at) — i.e. la saison courante quand l'équipe a joué cette saison.
 * @param {Array<object>} rows
 * @returns {Array<object>} une ligne par team_id
 */
export function dedupeLatestPerTeam(rows) {
  const byTeam = new Map();
  for (const r of rows || []) {
    const existing = byTeam.get(r.team_id);
    if (!existing || new Date(r.updated_at) > new Date(existing.updated_at)) {
      byTeam.set(r.team_id, r);
    }
  }
  return [...byTeam.values()];
}

/**
 * Trie les équipes par potentiel décroissant : meilleur LG1% puis meilleur LG2%.
 * (Les null passent en dernier.)
 * @param {Array<object>} rows
 * @returns {Array<object>} nouveau tableau trié
 */
export function rankByPotential(rows) {
  return [...(rows || [])].sort((a, b) => {
    const l1 = (bestLg1(b) ?? -1) - (bestLg1(a) ?? -1);
    if (l1 !== 0) return l1;
    return (bestLg2(b) ?? -1) - (bestLg2(a) ?? -1);
  });
}

/**
 * Pipeline complet : déduplique, filtre par seuils, trie par potentiel.
 * @param {Array<object>} rows - lignes team_lg1_cache brutes
 * @param {number|null} lg1Min
 * @param {number|null} lg2Min
 * @returns {Array<object>}
 */
export function filterTeamsByPotential(rows, lg1Min, lg2Min) {
  if (lg1Min == null && lg2Min == null) return [];
  const latest = dedupeLatestPerTeam(rows);
  const matching = latest.filter(r => passesThreshold(r, lg1Min, lg2Min));
  return rankByPotential(matching);
}
