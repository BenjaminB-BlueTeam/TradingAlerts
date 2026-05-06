/* ================================================
   selectionFilters.js — Filtre de scope + clé canonique pour les alertes.
   Fonctions pures, sans dépendance Supabase ni store.
   ================================================ */

/** Construit la clé unique d'une alerte sélectionnée. Format : "${match_id}:${signal_type}". */
export function keyOf(matchId, signalType) {
  return `${matchId}:${signalType}`;
}

/**
 * Filtre les alertes selon le scope.
 * - scope='global' (ou null/undefined) : retourne alerts inchangé
 * - scope='mine'   : retourne uniquement les alertes dont (match_id, signal_type)
 *                    est présent dans selectedKeysSet
 *
 * selectedKeysSet : Set<string> de clés "${match_id}:${signal_type}"
 *
 * Si scope='mine' et selectedKeysSet est null/undefined/vide : retourne [].
 */
export function applyScopeFilter(alerts, selectedKeysSet, scope) {
  if (!Array.isArray(alerts)) return [];
  if (scope !== 'mine') return alerts;
  if (!selectedKeysSet || selectedKeysSet.size === 0) return [];
  return alerts.filter(a => selectedKeysSet.has(keyOf(a.match_id, a.signal_type)));
}
