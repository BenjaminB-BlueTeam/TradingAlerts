/* ================================================
   data.js — Initialisation app (test connexion API)
   FHG Tracker
   ================================================ */

import { testApiConnection } from '$lib/api/footystats.js';
import { apiConnected } from '$lib/stores/appStore.js';

/**
 * Test la connexion API FootyStats et met à jour le store.
 * Note: loadData() a été supprimée — le Dashboard utilise désormais
 * les alertes Supabase directement (comme /alerts et /selection-dc).
 */
export async function initApp() {
  const status = await testApiConnection();
  apiConnected.set(status.success);
  return status;
}
