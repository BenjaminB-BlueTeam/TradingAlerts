/* ================================================
   app.js — Point d'entrée de l'application
   FHG Tracker
   ================================================ */

import { loadFromStorage, getState, setState, savePrefs, loadTradesFromSupabase } from './store/store.js';
import { initSidebar, setActivePage } from './components/sidebar.js';
import { initModal } from './components/modal.js';
import { getTodaysMatches, getLeagueTeams, getH2H, testApiConnection } from './api/footystats.js';
import { analyserMatch } from './core/scoring.js';
import { analyserH2H } from './core/h2h.js';
import { filtrerMatchs } from './core/filters.js';

// ---- Pages (import statique) ----
import { renderDashboard, initDashboard } from './pages/dashboard.js';
import { renderMatches,   initMatches   } from './pages/matches.js';
import { renderLeagues,   initLeagues   } from './pages/leagues.js';
import { renderAlerts,    initAlerts    } from './pages/alerts.js';
import { renderSettings,  initSettings  } from './pages/settings.js';

// ============================================================
// INITIALISATION
// ============================================================

export async function init() {
  // 1. Charger les données persistées
  loadFromStorage();

  // 2. Initialiser les composants globaux
  initSidebar(navigateTo);
  initModal();

  // 3. Vérifier la disponibilité de l'API via le proxy Netlify
  const apiStatus = await testApiConnection();
  setState({ isDemo: !apiStatus.success, apiConnected: apiStatus.success });

  const { prefs } = getState();
  if (!apiStatus.success && !prefs.demoBannerClosed) {
    document.getElementById('demo-banner')?.classList.remove('hidden');
    document.getElementById('demo-banner-close')?.addEventListener('click', () => {
      document.getElementById('demo-banner')?.classList.add('hidden');
      savePrefs({ demoBannerClosed: true });
    });
  }

  // 4. Charger les données (matchs + trades Supabase en parallèle)
  await Promise.all([
    loadData(),
    loadTradesFromSupabase(),
  ]);

  // 5. Naviguer vers la page initiale
  const startPage = prefs.currentPage || 'dashboard';
  navigateTo(startPage);
}

// ============================================================
// CHARGEMENT DES DONNÉES
// ============================================================

export async function loadData() {
  setState({ loading: true });
  showLoadingState();

  try {
    const { isDemo, leagues, config } = getState();
    const activeLeagues = (leagues || []).filter(l => l.active);

    // Récupérer les matchs du jour
    const rawMatches = await getTodaysMatches();

    // Analyser chaque match
    const analysed = await Promise.all(
      rawMatches.map(match => analyseMatch(match, activeLeagues, config))
    );

    // Filtrer : signaux vs exclus
    const { signaux, exclus, watchlist } = filtrerMatchs(
      analysed.filter(Boolean),
      { seuilMinimum: config.seuilFHG || 60 }
    );

    setState({
      signaux,
      exclus,
      loading: false,
      lastUpdate: Date.now(),
      apiConnected: !isDemo,
    });

    return { signaux, exclus };
  } catch (err) {
    console.error('loadData error:', err);
    setState({ loading: false, apiConnected: false });

    if (err.message === 'INVALID_API_KEY') {
      showToast('Clé API invalide — Vérifiez vos paramètres', 'error');
    } else if (err.message !== 'NO_API_KEY') {
      showToast('Erreur lors du chargement des données', 'error');
    }
    return { signaux: [], exclus: [] };
  }
}

// ---- Analyser un match individuel ----
async function analyseMatch(match, activeLeagues, config) {
  try {
    // Trouver la ligue correspondante
    const league = activeLeagues.find(l =>
      l.id === match.leagueId || l.leagueId === match.leagueId
    );
    if (!league) return null;

    // Récupérer les équipes
    const teams = await getLeagueTeams(league.id || league.leagueId);

    const homeTeam = teams.find(t => t.id === match.homeID) || null;
    const awayTeam = teams.find(t => t.id === match.awayID) || null;

    if (!homeTeam && !awayTeam) return null;

    // Récupérer les H2H
    const h2hHome = homeTeam
      ? await getH2H(match.homeID, match.awayID, league.id).catch(() => [])
      : [];
    const h2hAway = awayTeam
      ? await getH2H(match.awayID, match.homeID, league.id).catch(() => [])
      : [];

    // Analyser et scorer
    const result = analyserMatch(match, homeTeam, awayTeam, h2hHome, h2hAway, config);

    if (result) {
      // Ajouter les données H2H brutes pour l'affichage
      result.h2h = h2hHome.length > 0 ? h2hHome : h2hAway;
    }

    return result;
  } catch (err) {
    console.warn(`analyseMatch error for match ${match.id}:`, err);
    return null;
  }
}

// ============================================================
// NAVIGATION
// ============================================================

const PAGE_CONFIG = {
  dashboard: { render: renderDashboard, init: initDashboard, title: 'Dashboard' },
  matches:   { render: renderMatches,   init: initMatches,   title: 'Matchs à venir' },
  leagues:   { render: renderLeagues,   init: initLeagues,   title: 'Ligues actives' },
  alerts:    { render: renderAlerts,    init: initAlerts,    title: 'Alertes' },
  settings:  { render: renderSettings,  init: initSettings,  title: 'Paramètres' },
};

export function navigateTo(page) {
  const config = PAGE_CONFIG[page];
  if (!config) {
    console.warn(`Page inconnue : ${page}`);
    navigateTo('dashboard');
    return;
  }

  const container = document.getElementById('page-container');
  if (!container) return;

  // Afficher un état de chargement rapide
  container.innerHTML = `<div class="page-loading"><div class="spinner"></div></div>`;

  // Mettre à jour la nav
  setActivePage(page);
  savePrefs({ currentPage: page });

  // Rendre la page
  try {
    container.innerHTML = config.render();
    config.init(container);

    // Scroll vers le haut
    window.scrollTo(0, 0);
    container.scrollTo(0, 0);
  } catch (err) {
    console.error(`Erreur rendu page ${page}:`, err);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠</div>
        <div class="empty-state__title">Erreur de rendu</div>
        <div class="empty-state__desc">${err.message}</div>
        <button class="btn btn--primary mt-16" onclick="location.reload()">Recharger</button>
      </div>
    `;
  }
}

// ============================================================
// UTILITAIRES GLOBAUX
// ============================================================

function showLoadingState() {
  const container = document.getElementById('page-container');
  if (container) {
    container.innerHTML = `
      <div class="page-loading">
        <div class="spinner"></div>
        <p style="color:var(--color-text-muted);">Analyse des matchs en cours…</p>
      </div>
    `;
  }
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// ============================================================
// LANCER L'APP
// ============================================================

// Démarrage au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error('Erreur initialisation app:', err);
  });
});

// Rafraîchissement auto toutes les 10 minutes
setInterval(() => {
  const paused = getState('pauseSession');
  if (!paused) {
    loadData().then(() => {
      // Si on est sur le dashboard, re-render silencieux
      const page = getState('prefs')?.currentPage;
      if (page === 'dashboard') navigateTo('dashboard');
    });
  }
}, 10 * 60 * 1000);
