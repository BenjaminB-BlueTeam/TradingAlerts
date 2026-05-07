import { getAllLeagues, normalizeLeagues } from '$lib/api/footystats.js';
import { apiConnected, leagues, saveLeagues } from '$lib/stores/appStore.js';
import { get } from 'svelte/store';

function reconcileLeaguesStore(apiLeagues) {
  if (!apiLeagues.length) return;
  const current = get(leagues);
  const reconciled = apiLeagues.map(apiLg => {
    const idx = current.findIndex(l =>
      (l.leagueId && l.leagueId === apiLg.id) ||
      l.name === apiLg.name ||
      apiLg.name.includes(l.name) ||
      l.name.includes(apiLg.name)
    );
    if (idx > -1) {
      return { ...current[idx], leagueId: apiLg.id, name: apiLg.name, country: apiLg.country, active: true };
    }
    return { id: apiLg.name.toLowerCase().replace(/\s+/g, '-'), name: apiLg.name, country: apiLg.country, flag: '', active: true, leagueId: apiLg.id };
  });
  saveLeagues(reconciled);
}

export async function initApp() {
  try {
    const apiLeagues = await getAllLeagues();
    const success = apiLeagues.length > 0;
    apiConnected.set(success);
    if (success) reconcileLeaguesStore(apiLeagues);
    return { success, message: success ? 'Connexion réussie' : 'Aucune ligue retournée' };
  } catch (e) {
    apiConnected.set(false);
    return { success: false, error: `Erreur réseau : ${e.message}` };
  }
}
