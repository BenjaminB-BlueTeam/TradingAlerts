/**
 * app.js — Point d'entrée de FHG Tracker
 * Initialisation, routage et données mock
 */

import store from './store/store.js';
import { initSidebar, navigateTo } from './components/sidebar.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderMatches } from './pages/matches.js';
import { renderLeagues } from './pages/leagues.js';
import { renderAlerts } from './pages/alerts.js';
import { renderSettings } from './pages/settings.js';
import { calculerScoreFHG, calculerScoreDC } from './core/scoring.js';

// =============================================
// DONNÉES MOCK (Mode démo sans clé API)
// =============================================

const MOCK_MATCHES = [
  {
    id: 'm001',
    home: 'Bayern Munich',
    away: 'Dortmund',
    league: 'Bundesliga',
    leagueId: 'bl',
    matchTime: '20:30',
    matchTimestamp: Date.now() + 2 * 60 * 60 * 1000,
    isHome: true,
    equipe: {
      matches_played: 22,
      goals_scored_min_31_to_45: 18,          // 82%
      matches_played_n1: 34,
      goals_scored_min_31_to_45_n1: 27,       // 79%
      buts_31_45_sur_5_derniers: 4,
      matches_scored_first_half: 17,           // 77%
      pct_retour_si_encaisse: 72,
      pct_victoire_domicile: 80,
    },
    h2hList: [
      { date: '12/04/24', score: '3-2', htScore: '2-1', equipe_ciblee_but_avant_45min: true },
      { date: '02/12/23', score: '3-0', htScore: '1-0', equipe_ciblee_but_avant_45min: true },
      { date: '11/03/23', score: '4-2', htScore: '2-1', equipe_ciblee_but_avant_45min: true },
      { date: '28/10/22', score: '2-2', htScore: '1-2', equipe_ciblee_but_avant_45min: true },
      { date: '05/02/22', score: '3-3', htScore: '0-1', equipe_ciblee_but_avant_45min: false },
    ],
    goalDistribution: {
      '0-15': 8, '16-30': 10, '31-45': 18, '46-60': 6, '61-75': 5, '76-90': 4,
    },
  },
  {
    id: 'm002',
    home: 'Leverkusen',
    away: 'Leipzig',
    league: 'Bundesliga',
    leagueId: 'bl',
    matchTime: '18:30',
    matchTimestamp: Date.now() + 1 * 60 * 60 * 1000,
    isHome: true,
    equipe: {
      matches_played: 22,
      goals_scored_min_31_to_45: 16,          // 73% → ~75%
      matches_played_n1: 34,
      goals_scored_min_31_to_45_n1: 25,
      buts_31_45_sur_5_derniers: 4,
      matches_scored_first_half: 15,           // 68%
      pct_retour_si_encaisse: 68,
      pct_victoire_domicile: 75,
    },
    h2hList: [
      { date: '20/04/24', score: '2-1', htScore: '1-0', equipe_ciblee_but_avant_45min: true },
      { date: '10/12/23', score: '1-0', htScore: '1-0', equipe_ciblee_but_avant_45min: true },
      { date: '15/03/23', score: '3-1', htScore: '2-0', equipe_ciblee_but_avant_45min: true },
      { date: '30/11/22', score: '2-0', htScore: '0-0', equipe_ciblee_but_avant_45min: false },
      { date: '12/02/22', score: '1-2', htScore: '1-1', equipe_ciblee_but_avant_45min: true },
    ],
    goalDistribution: {
      '0-15': 6, '16-30': 9, '31-45': 16, '46-60': 7, '61-75': 6, '76-90': 4,
    },
  },
  {
    id: 'm003',
    home: 'Brentford',
    away: 'Arsenal',
    league: 'Premier League',
    leagueId: 'pl',
    matchTime: '14:00',
    matchTimestamp: Date.now() + 30 * 60 * 1000,
    isHome: true,
    equipe: {
      matches_played: 24,
      goals_scored_min_31_to_45: 16,          // 67%
      matches_played_n1: 38,
      goals_scored_min_31_to_45_n1: 22,
      buts_31_45_sur_5_derniers: 3,
      matches_scored_first_half: 15,           // 63%
      pct_retour_si_encaisse: 55,
      pct_victoire_domicile: 58,
    },
    h2hList: [
      { date: '10/02/24', score: '2-1', htScore: '1-1', equipe_ciblee_but_avant_45min: true },
      { date: '08/09/23', score: '0-2', htScore: '0-1', equipe_ciblee_but_avant_45min: false },
      { date: '11/02/23', score: '1-1', htScore: '1-0', equipe_ciblee_but_avant_45min: true },
      { date: '16/10/22', score: '3-0', htScore: '2-0', equipe_ciblee_but_avant_45min: true },
      { date: '13/02/22', score: '2-1', htScore: '0-0', equipe_ciblee_but_avant_45min: false },
    ],
    goalDistribution: {
      '0-15': 5, '16-30': 8, '31-45': 16, '46-60': 5, '61-75': 7, '76-90': 3,
    },
  },
  {
    id: 'm004',
    home: 'Wolverhampton',
    away: 'Chelsea',
    league: 'Premier League',
    leagueId: 'pl',
    matchTime: '17:30',
    matchTimestamp: Date.now() + 4 * 60 * 60 * 1000,
    isHome: true,
    equipe: {
      matches_played: 24,
      goals_scored_min_31_to_45: 18,          // 75%
      matches_played_n1: 38,
      goals_scored_min_31_to_45_n1: 24,
      buts_31_45_sur_5_derniers: 4,
      matches_scored_first_half: 17,           // 71%
      pct_retour_si_encaisse: 48,
      pct_victoire_domicile: 42,
    },
    h2hList: [
      { date: '24/02/24', score: '4-2', htScore: '2-1', equipe_ciblee_but_avant_45min: true },
      { date: '30/12/22', score: '0-2', htScore: '0-1', equipe_ciblee_but_avant_45min: false },
      { date: '19/01/22', score: '1-0', htScore: '0-0', equipe_ciblee_but_avant_45min: false },
      { date: '27/11/21', score: '0-3', htScore: '0-2', equipe_ciblee_but_avant_45min: false },
      { date: '26/01/21', score: '0-1', htScore: '0-0', equipe_ciblee_but_avant_45min: false },
    ],
    // H2H : 1/5 buts en 1MT → orange warning
    goalDistribution: {
      '0-15': 4, '16-30': 7, '31-45': 18, '46-60': 6, '61-75': 5, '76-90': 4,
    },
  },
  {
    id: 'm005',
    home: 'RC Lens',
    away: 'PSG',
    league: 'Ligue 1',
    leagueId: 'l1',
    matchTime: '21:00',
    matchTimestamp: Date.now() + 5 * 60 * 60 * 1000,
    isHome: true,
    equipe: {
      matches_played: 24,
      goals_scored_min_31_to_45: 17,          // 71%
      matches_played_n1: 38,
      goals_scored_min_31_to_45_n1: 20,
      buts_31_45_sur_5_derniers: 3,
      matches_scored_first_half: 13,           // 54%
      pct_retour_si_encaisse: 42,
      pct_victoire_domicile: 50,
    },
    h2hList: [
      { date: '01/03/24', score: '1-2', htScore: '0-1', equipe_ciblee_but_avant_45min: false },
      { date: '19/08/23', score: '3-1', htScore: '0-1', equipe_ciblee_but_avant_45min: false },
      { date: '15/01/23', score: '0-3', htScore: '0-1', equipe_ciblee_but_avant_45min: false },
      { date: '10/09/22', score: '1-1', htScore: '0-1', equipe_ciblee_but_avant_45min: false },
    ],
    // H2H : 0/4 buts en 1MT + 4 matchs >= 3 → EXCLU
    goalDistribution: {
      '0-15': 3, '16-30': 6, '31-45': 17, '46-60': 5, '61-75': 8, '76-90': 4,
    },
  },
  {
    id: 'm006',
    home: 'Feyenoord',
    away: 'Ajax',
    league: 'Eredivisie',
    leagueId: 'ere',
    matchTime: '16:45',
    matchTimestamp: Date.now() + 3.5 * 60 * 60 * 1000,
    isHome: true,
    equipe: {
      matches_played: 20,
      goals_scored_min_31_to_45: 14,          // 70%
      matches_played_n1: 34,
      goals_scored_min_31_to_45_n1: 20,
      buts_31_45_sur_5_derniers: 3,
      matches_scored_first_half: 12,           // 60%
      pct_retour_si_encaisse: 58,
      pct_victoire_domicile: 65,
    },
    h2hList: [
      { date: '15/01/24', score: '2-0', htScore: '1-0', equipe_ciblee_but_avant_45min: true },
      { date: '22/10/23', score: '1-1', htScore: '0-1', equipe_ciblee_but_avant_45min: false },
    ],
    // H2H insuffisant (< 3 matchs)
    goalDistribution: {
      '0-15': 4, '16-30': 7, '31-45': 14, '46-60': 5, '61-75': 6, '76-90': 3,
    },
  },
];

// =============================================
// INITIALISATION
// =============================================

async function init() {
  // Initialiser la sidebar
  initSidebar();

  // Charger les données (mock ou API)
  await loadMatches();

  // Routage par événement
  document.addEventListener('page:change', e => {
    const { page } = e.detail;
    renderPage(page);
  });

  // Navigation initiale
  renderPage('dashboard');

  // Démonstration API désactivée → mode demo
  updateDemoMode();
}

function renderPage(page) {
  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'matches':   renderMatches(); break;
    case 'leagues':   renderLeagues(); break;
    case 'alerts':    renderAlerts(); break;
    case 'settings':  renderSettings(); break;
  }
}

async function loadMatches() {
  const apiKey = store.get('apiKey');
  const config = store.get('alertsConfig');

  store.set('matchesLoading', true);

  try {
    let rawMatches;

    if (!apiKey) {
      // Mode démo : utiliser les données mock
      rawMatches = MOCK_MATCHES;
      store.set('demoMode', true);
      store.set('apiConnected', false);
    } else {
      // Mode API : appels FootyStats
      rawMatches = await loadFromAPI();
      store.set('demoMode', false);
      store.set('apiConnected', true);
    }

    // Calculer les scores FHG pour chaque match
    const processedMatches = rawMatches.map(m => processMatch(m, config));
    store.set('matches', processedMatches);

  } catch (err) {
    console.error('[App] Erreur chargement matchs:', err);
    store.set('apiError', err.message);
    store.set('apiConnected', false);

    // Fallback sur mock
    const processedMatches = MOCK_MATCHES.map(m => processMatch(m, config));
    store.set('matches', processedMatches);
  }

  store.set('matchesLoading', false);
  store.set('lastFetch', Date.now());
}

function processMatch(matchData, config) {
  const { equipe, h2hList = [] } = matchData;

  const resultatFHG = calculerScoreFHG(equipe, h2hList, config);

  let resultatDC = null;
  if (!resultatFHG.exclu) {
    resultatDC = calculerScoreDC(equipe, resultatFHG.score, config);
  }

  return {
    ...matchData,
    resultatFHG,
    resultatDC,
  };
}

async function loadFromAPI() {
  // Import dynamique pour éviter l'initialisation si pas de clé
  const { fetchTodaysMatches, fetchLeagueTeams, fetchMatchDetail, extractH2H } =
    await import('./api/footystats.js');

  const today = new Date().toISOString().split('T')[0];
  const todayMatches = await fetchTodaysMatches(today);
  const activeLeagues = store.get('activeLeagues') || [];

  // Pour chaque match, enrichir avec les stats équipes
  const enriched = await Promise.all(
    todayMatches.slice(0, 20).map(async m => {
      try {
        const matchDetail = await fetchMatchDetail(m.id);
        const h2hList = matchDetail
          ? extractH2H(matchDetail, m.homeID, m.awayID)
          : [];

        return {
          id: m.id,
          home: m.home_name || 'Équipe dom.',
          away: m.away_name || 'Équipe ext.',
          league: m.league_name || '',
          leagueId: m.competition_id,
          matchTime: m.time || '--:--',
          matchTimestamp: m.date_unix ? m.date_unix * 1000 : null,
          isHome: true,
          equipe: {
            matches_played: m.homeStats?.seasonMatchesPlayed_home || 10,
            goals_scored_min_31_to_45: m.homeStats?.goals_scored_min_31_to_45 || 0,
            matches_played_n1: 34,
            goals_scored_min_31_to_45_n1: 0,
            buts_31_45_sur_5_derniers: 0,
            matches_scored_first_half: m.homeStats?.matches_scored_first_half || 0,
            pct_retour_si_encaisse: 50,
            pct_victoire_domicile: m.home_ppg ? m.home_ppg * 33 : 50,
          },
          h2hList,
        };
      } catch {
        return null;
      }
    })
  );

  return enriched.filter(Boolean);
}

function updateDemoMode() {
  const demoMode = store.get('demoMode');
  const demoBanner = document.getElementById('demo-banner');
  if (demoBanner) {
    demoBanner.style.display = demoMode ? 'flex' : 'none';
  }

  // Réagir aux liens dans la banner démo
  document.querySelectorAll('.demo-link[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(el.dataset.page);
    });
  });
}

// =============================================
// LANCER L'APPLICATION
// =============================================

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error('[App] Erreur fatale:', err);
  });
});
