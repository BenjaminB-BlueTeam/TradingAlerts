/* ================================================
   favoritesStore.js — Store des équipes favorites.
   Source de vérité : Supabase (table favorite_teams).
   Ce store est un cache local Set pour lookup O(1).
   ================================================ */

import { writable, get } from 'svelte/store';
import * as api from '$lib/api/supabase.js';

/** Cache local des team_id favoris. Set de nombres pour lookup O(1). */
export const favoriteTeamIds = writable(new Set());

/** Liste complète [{id, team_id, team_name, created_at}], triée par created_at desc (comme l'API). */
export const favoriteTeams = writable([]);

/** Hydrate les deux stores depuis Supabase. À appeler au mount du layout. */
export async function loadFavorites() {
  const rows = await api.getFavorites();
  favoriteTeams.set(rows);
  favoriteTeamIds.set(new Set(rows.map(r => Number(r.team_id))));
}

/**
 * Ajoute une équipe aux favoris.
 * No-op si déjà présente (vérifie le Set local avant appel API).
 */
export async function addFavorite(teamId, teamName = null) {
  if (get(favoriteTeamIds).has(Number(teamId))) return;
  await api.addFavoriteTeam(teamId, teamName);
  await loadFavorites();
}

/**
 * Retire une équipe des favoris.
 */
export async function removeFavorite(teamId) {
  await api.removeFavoriteTeam(teamId);
  await loadFavorites();
}

/**
 * Vérifie si une équipe est favorite.
 * Fonction PURE — le caller passe $favoriteTeamIds.
 * Convertit teamId en Number pour éviter les soucis string/number.
 */
export function isFavorite(favSet, teamId) {
  if (!favSet || teamId == null) return false;
  return favSet.has(Number(teamId));
}
