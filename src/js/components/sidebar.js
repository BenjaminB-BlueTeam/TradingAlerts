/* ================================================
   sidebar.js — Navigation latérale
   FHG Tracker
   ================================================ */

import { getState, subscribe } from '../store/store.js';

let isSidebarOpen = false;

/**
 * Initialiser la sidebar et ses interactions.
 */
export function initSidebar(onNavigate) {
  const sidebar        = document.getElementById('sidebar');
  const overlay        = document.getElementById('sidebar-overlay');
  const burgerBtn      = document.getElementById('burger-btn');
  const closeBtn       = document.getElementById('sidebar-close-btn');
  const pauseBtn       = document.getElementById('pause-session-btn');
  const navItems       = document.querySelectorAll('[data-page]');

  if (!sidebar) return;

  // ---- Navigation ----
  navItems.forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page) {
        navigateTo(page, onNavigate);
        closeSidebar();
      }
    });
  });

  // ---- Menu burger (mobile) ----
  burgerBtn?.addEventListener('click', () => {
    if (isSidebarOpen) closeSidebar();
    else openSidebar();
  });

  closeBtn?.addEventListener('click', closeSidebar);
  overlay?.addEventListener('click', closeSidebar);

  // ---- PAUSE SESSION ----
  pauseBtn?.addEventListener('click', () => {
    const paused = !getState('pauseSession');
    import('../store/store.js').then(({ setState }) => {
      setState({ pauseSession: paused });
      updatePauseButton(paused);
      if (paused) {
        showToast('⏸ Session en pause — Aucune alerte active', 'warning');
      } else {
        showToast('▶ Session reprise', 'success');
      }
    });
  });

  // ---- Réactivité au store ----
  subscribe('apiConnected', connected => {
    updateApiStatus(connected);
  });
  subscribe('alertesActives', alertes => {
    updateAlertsBadge(alertes?.length || 0);
  });

  // État initial
  updateApiStatus(getState('apiConnected'));
  updateAlertsBadge(getState('alertesActives')?.length || 0);
}

/**
 * Mettre en évidence l'item de nav actif.
 */
export function setActivePage(page) {
  document.querySelectorAll('.sidebar__nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  // Mettre à jour le titre de la topbar
  const titles = {
    dashboard: 'Dashboard',
    matches:   'Matchs à venir',
    leagues:   'Ligues actives',
    alerts:    'Alertes',
    settings:  'Paramètres',
  };
  const topbarTitle = document.getElementById('topbar-title');
  if (topbarTitle) topbarTitle.textContent = titles[page] || page;
}

function navigateTo(page, onNavigate) {
  setActivePage(page);
  onNavigate(page);
}

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar?.classList.add('open');
  overlay?.classList.add('active');
  isSidebarOpen = true;
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar?.classList.remove('open');
  overlay?.classList.remove('active');
  isSidebarOpen = false;
  document.body.style.overflow = '';
}

function updateApiStatus(connected) {
  const dots   = document.querySelectorAll('.api-dot');
  const label  = document.getElementById('api-status-label');
  const isDemo = getState('isDemo');

  dots.forEach(dot => {
    dot.classList.remove('connected', 'error');
    if (isDemo) {
      // Mode démo = neutre
    } else if (connected) {
      dot.classList.add('connected');
    } else {
      dot.classList.add('error');
    }
  });

  if (label) {
    if (isDemo) label.textContent = 'Mode démo';
    else if (connected) label.textContent = 'API connectée';
    else label.textContent = 'API déconnectée';
  }
}

function updateAlertsBadge(count) {
  const badge = document.getElementById('alerts-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function updatePauseButton(paused) {
  const btn = document.getElementById('pause-session-btn');
  if (!btn) return;
  btn.textContent = paused ? '▶ REPRENDRE SESSION' : '⏸ PAUSE SESSION';
  btn.style.opacity = paused ? '0.7' : '1';
}

// ---- Import dynamique pour toast (évite la dépendance circulaire) ----
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
