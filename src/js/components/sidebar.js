/**
 * sidebar.js — Composant navigation sidebar
 */

import store from '../store/store.js';

export function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const btnBurger = document.getElementById('menu-burger');
  const btnClose = document.getElementById('sidebar-close');
  const btnPause = document.getElementById('btn-pause-session');
  const btnResume = document.getElementById('btn-resume');

  // Navigation
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const page = el.dataset.page;
      if (page) navigateTo(page);
      closeSidebar();
    });
  });

  // Burger menu
  btnBurger?.addEventListener('click', () => openSidebar());
  btnClose?.addEventListener('click', () => closeSidebar());
  overlay?.addEventListener('click', () => closeSidebar());

  // Pause session
  btnPause?.addEventListener('click', togglePause);
  btnResume?.addEventListener('click', () => {
    store.set('sessionPaused', false);
  });

  // Réagir aux changements de state
  store.on('apiConnected', updateApiStatus);
  store.on('apiError', updateApiStatus);
  store.on('sessionPaused', updatePauseState);
  store.on('matches', updateAlertsBadge);

  // Init
  updateApiStatus();
  updatePauseState(store.get('sessionPaused'));
  updateAlertsBadge();
}

export function navigateTo(page) {
  // Désactiver tous les onglets
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Activer la nouvelle page
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  // Scroll en haut
  window.scrollTo(0, 0);

  // Déclencher le rendu de la page
  document.dispatchEvent(new CustomEvent('page:change', { detail: { page } }));
}

function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebar-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

function togglePause() {
  const paused = !store.get('sessionPaused');
  store.set('sessionPaused', paused);
}

function updateApiStatus() {
  const connected = store.get('apiConnected');
  const error = store.get('apiError');
  const demoMode = store.get('demoMode');

  const dot = document.getElementById('api-dot');
  const label = document.getElementById('api-label');
  const mobileDot = document.getElementById('mobile-api-dot');
  const demoBanner = document.getElementById('demo-banner');

  if (dot && label) {
    dot.className = 'api-dot';
    mobileDot && (mobileDot.className = 'mobile-api-dot');

    if (connected) {
      dot.classList.add('connected');
      mobileDot?.classList.add('connected');
      label.textContent = 'API connectée';
    } else if (error) {
      dot.classList.add('error');
      mobileDot?.classList.add('error');
      label.textContent = 'Erreur API';
    } else {
      label.textContent = 'API non connectée';
    }
  }

  if (demoBanner) {
    demoBanner.style.display = demoMode ? 'flex' : 'none';
  }
}

function updatePauseState(paused) {
  const btn = document.getElementById('btn-pause-session');
  const banner = document.getElementById('pause-banner');

  if (btn) {
    btn.classList.toggle('paused', paused);
    btn.textContent = paused ? '▶ REPRENDRE' : '⏸ PAUSE SESSION';
  }

  if (banner) {
    banner.style.display = paused ? 'flex' : 'none';
  }
}

function updateAlertsBadge() {
  const matches = store.get('matches') || [];
  const forts = matches.filter(m => !m.resultatFHG?.exclu && m.resultatFHG?.score >= 75).length;

  const badge = document.getElementById('alerts-badge');
  if (badge) {
    badge.textContent = forts;
    badge.setAttribute('data-count', forts);
    badge.style.display = forts > 0 ? 'inline-flex' : 'none';
  }
}
