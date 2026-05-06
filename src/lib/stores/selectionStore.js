/* ================================================
   selectionStore.js — Store de sélection manuelle des alertes (Chantier B).
   Source de vérité : Supabase (table selected_alerts).
   Ce store est un cache local Set pour lookup O(1).
   ================================================ */

import { writable, get } from 'svelte/store';
import * as api from '$lib/api/supabase.js';
import { keyOf } from '$lib/utils/selectionFilters.js';

/** Cache local des clés sélectionnées. Format : "${match_id}:${signal_type}". */
export const selectedKeys = writable(new Set());

// Re-export pour les composants qui importent keyOf depuis le store.
export { keyOf };

/** Hydrate le store depuis Supabase. À appeler au mount du layout. */
export async function loadSelections() {
  const rows = await api.getSelectedAlerts();
  const set = new Set(rows.map(r => keyOf(r.match_id, r.signal_type)));
  selectedKeys.set(set);
}

/**
 * Sélectionne une alerte et la persiste dans Supabase.
 * No-op silencieux si déjà sélectionnée (vérifié sur le Set local avant appel API).
 */
export async function select(matchId, signalType, note = null) {
  const currentSet = get(selectedKeys);
  if (currentSet.has(keyOf(matchId, signalType))) return;
  await api.selectAlert(matchId, signalType, note);
  addToSet(matchId, signalType);
}

/**
 * Désélectionne une alerte.
 * Si le signal est un FHG et que le DC du même match est sélectionné,
 * le DC est également désélectionné (cascade métier — DC ne se joue jamais seule).
 * Retourne { cascadedDC: boolean }.
 */
export async function unselect(matchId, signalType) {
  await api.unselectAlert(matchId, signalType);
  removeFromSet(matchId, signalType);

  // Cascade : si on désélectionne un FHG, on désélectionne le DC du même match.
  let cascadedDC = false;
  if (signalType.startsWith('FHG')) {
    const dcKey = keyOf(matchId, 'DC');
    const currentSet = get(selectedKeys);
    if (currentSet.has(dcKey)) {
      await api.unselectAlert(matchId, 'DC');
      removeFromSet(matchId, 'DC');
      cascadedDC = true;
    }
  }

  return { cascadedDC };
}

/**
 * Vérifie si une alerte est sélectionnée.
 * Le caller passe la valeur courante du Set (via get(selectedKeys) ou $selectedKeys)
 * pour que cette fonction reste pure et facile à tester.
 */
export function isSelected(selectedKeysSet, matchId, signalType) {
  if (!selectedKeysSet) return false;
  return selectedKeysSet.has(keyOf(matchId, signalType));
}

// ---- Helpers internes ----

function addToSet(matchId, signalType) {
  selectedKeys.update(set => {
    const next = new Set(set);
    next.add(keyOf(matchId, signalType));
    return next;
  });
}

function removeFromSet(matchId, signalType) {
  selectedKeys.update(set => {
    const next = new Set(set);
    next.delete(keyOf(matchId, signalType));
    return next;
  });
}
