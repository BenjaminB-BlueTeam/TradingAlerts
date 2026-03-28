/* ================================================
   dashboard.js — Page Dashboard
   FHG Tracker
   ================================================ */

import { getState, setState } from '../store/store.js';
import { renderMatchCard, renderExcludedCard, attachMatchCardEvents } from '../components/matchCard.js';
import { calcDashboardStats, getNextMatchCountdown } from '../core/filters.js';

/**
 * Rendre la page Dashboard.
 */
export function renderDashboard() {
  const { signaux, exclus, isDemo } = getState();
  const signauxArr  = signaux  || [];
  const exclusArr   = exclus   || [];
  const config      = getState('config') || {};
  const liguesActives = (getState('leagues') || []).filter(l => l.active).length;

  const stats      = calcDashboardStats(signauxArr, exclusArr, liguesActives);
  const forts      = signauxArr.filter(m => m.scoreChoisi?.signal === 'fort');
  const moyens     = signauxArr.filter(m => m.scoreChoisi?.signal === 'moyen');
  const watchlist  = signauxArr.filter(m => (m.scoreChoisi?.score || 0) < 75 && (m.scoreChoisi?.score || 0) >= 60);
  const countdown  = getNextMatchCountdown([...signauxArr, ...exclusArr]);

  const now = new Date();
  const dateStr  = now.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const timeStr  = now.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });

  const html = `
    <!-- HEADER -->
    <div class="dashboard-header">
      <div class="dashboard-header__left">
        <div class="dashboard-header__date">${capitalize(dateStr)}</div>
        <div class="dashboard-header__time">Dernière mise à jour : ${timeStr}</div>
      </div>
      <div class="dashboard-header__right">
        <span class="next-window-label">Prochain match</span>
        ${countdown
          ? `<div class="countdown">
               <span class="countdown__num">${countdown.hours > 0 ? countdown.hours + 'h ' : ''}${countdown.mins}min</span>
               <span style="font-size:12px;color:var(--color-text-muted);">${countdown.match.homeName} vs ${countdown.match.awayName}</span>
             </div>`
          : `<span style="font-size:13px;color:var(--color-text-muted);">Aucun match prévu</span>`
        }
        <div style="display:flex;gap:8px;margin-top:6px;">
          <button class="btn btn--secondary btn--sm" id="focus-mode-btn">🎯 Focus Mode</button>
          <button class="btn btn--secondary btn--sm" id="refresh-btn">↻ Actualiser</button>
        </div>
      </div>
    </div>

    <!-- METRIC CARDS -->
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-card__label">Signaux FORTS</div>
        <div class="metric-card__value green">${forts.length}</div>
        <div class="metric-card__sub">Matchs prioritaires</div>
      </div>
      <div class="metric-card">
        <div class="metric-card__label">Matchs analysés</div>
        <div class="metric-card__value blue">${stats.matchesAnalyses}</div>
        <div class="metric-card__sub">${signauxArr.length} avec signal</div>
      </div>
      <div class="metric-card">
        <div class="metric-card__label">Ligues actives</div>
        <div class="metric-card__value">${stats.liguesActives}</div>
        <div class="metric-card__sub">sur 50 max (plan Hobby)</div>
      </div>
      <div class="metric-card">
        <div class="metric-card__label">Matchs exclus</div>
        <div class="metric-card__value ${exclusArr.length > 0 ? 'red' : ''}">${exclusArr.length}</div>
        <div class="metric-card__sub">Filtre H2H Clean Sheet</div>
      </div>
    </div>

    <!-- SIGNAUX DU JOUR -->
    <div class="mb-24">
      <div class="section-title">🔥 Signaux du jour</div>

      ${signauxArr.length === 0
        ? `<div class="empty-state">
             <div class="empty-state__icon">⚽</div>
             <div class="empty-state__title">Aucun signal disponible</div>
             <div class="empty-state__desc">
               ${isDemo
                 ? 'Données de démonstration actives.<br>Les signaux apparaîtront ici.'
                 : 'Aucun match ne correspond aux critères de la stratégie FHG.'}
             </div>
           </div>`
        : `
          <!-- FORTS -->
          ${forts.length > 0 ? `
            <div class="section-title" style="margin-top:16px;">
              🟢 Signaux FORTS (${forts.length})
            </div>
            <div class="matches-list" id="signaux-forts-list">
              ${forts.map(m => renderMatchCard(m)).join('')}
            </div>
          ` : ''}

          <!-- MOYENS -->
          ${moyens.length > 0 ? `
            <div class="section-title" style="margin-top:20px;">
              🟡 Signaux MOYENS (${moyens.length})
            </div>
            <div class="matches-list" id="signaux-moyens-list">
              ${moyens.map(m => renderMatchCard(m)).join('')}
            </div>
          ` : ''}
        `
      }
    </div>

    <!-- MATCHS EXCLUS (accordéon replié) -->
    ${exclusArr.length > 0 ? `
      <div class="accordion mb-24" id="exclu-accordion">
        <div class="accordion__header" id="exclu-header">
          <div class="accordion__title">
            <span>🚫</span>
            Matchs écartés par le filtre H2H (${exclusArr.length})
          </div>
          <span class="accordion__chevron">▼</span>
        </div>
        <div class="accordion__body" id="exclu-body">
          <div class="info-box mb-16" style="font-size:12px;">
            ℹ La récurrence H2H prime sur tout — Ces matchs sont écartés même avec un FHG élevé. Aucune exception.
          </div>
          <div class="matches-list" id="exclus-list">
            ${exclusArr.map(m => renderExcludedCard(m)).join('')}
          </div>
        </div>
      </div>
    ` : ''}

    <!-- WATCHLIST -->
    ${watchlist.length > 0 ? `
      <div class="mb-24">
        <div class="section-title">👀 Watchlist — À surveiller (60-74 pts)</div>
        <div class="watchlist-grid" id="watchlist-grid">
          ${watchlist.map(m => renderWatchlistCard(m)).join('')}
        </div>
      </div>
    ` : ''}
  `;

  return html;
}

/**
 * Initialiser les events après le rendu.
 */
export function initDashboard(container) {
  if (!container) return;

  // Attacher events des cartes match
  attachMatchCardEvents(container);

  // Accordéon matchs exclus
  const acc    = document.getElementById('exclu-accordion');
  const header = document.getElementById('exclu-header');
  header?.addEventListener('click', () => {
    acc?.classList.toggle('open');
  });

  // Bouton Actualiser
  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    import('../app.js').then(m => m.loadData?.());
  });

  // Focus Mode
  document.getElementById('focus-mode-btn')?.addEventListener('click', () => {
    openFocusMode();
  });

  // Watchlist — clic → modal analyse
  container.querySelectorAll('[data-watchlist-id]').forEach(card => {
    card.addEventListener('click', () => {
      const id    = card.dataset.watchlistId;
      const match = findMatch(id);
      if (match) openMatchModal(match);
    });
  });
}

// ---- Watchlist card ----
function renderWatchlistCard(m) {
  const sc = m.scoreChoisi || {};
  return `
    <div class="watchlist-card" data-watchlist-id="${m.id}">
      <div class="watchlist-card__teams">
        ${m.homeName} vs ${m.awayName}
      </div>
      <div class="watchlist-card__meta">
        <span class="badge badge--moyen">⚡ ${sc.score || 0} pts</span>
        <span style="font-size:11px;color:var(--color-text-muted);">${m.time || ''}</span>
      </div>
      <div style="margin-top:6px;font-size:11px;color:var(--color-text-muted);">
        ${m.leagueFlag || ''} ${m.leagueName || ''}
        ${sc.badge1MT50 ? ' · <span style="color:var(--color-badge-violet);">★ 1MT</span>' : ''}
      </div>
    </div>
  `;
}

// ---- Focus Mode ----
function openFocusMode() {
  const { signaux } = getState();
  const now = new Date();

  // Matchs en cours ou dans les 30 prochaines minutes
  const focusMatches = (signaux || []).filter(m => {
    if (!m.time) return false;
    const [h, mi] = m.time.split(':').map(Number);
    const matchTime = new Date();
    matchTime.setHours(h, mi, 0, 0);
    const diff = (matchTime - now) / 60000;
    return diff >= -45 && diff <= 30;
  });

  const overlay = document.createElement('div');
  overlay.className = 'focus-mode-overlay';
  overlay.innerHTML = `
    <div class="focus-mode-header">
      <div class="focus-mode-title">🎯 Mode Focus — Matchs imminents</div>
      <button class="btn btn--secondary" id="close-focus">✕ Quitter</button>
    </div>
    ${focusMatches.length === 0
      ? `<div class="empty-state">
           <div class="empty-state__icon">⏰</div>
           <div class="empty-state__title">Aucun match dans les 30 prochaines minutes</div>
         </div>`
      : `<div class="matches-list">${focusMatches.map(m => renderMatchCard(m)).join('')}</div>`
    }
  `;
  document.body.appendChild(overlay);
  document.getElementById('close-focus')?.addEventListener('click', () => {
    overlay.remove();
  });

  attachMatchCardEvents(overlay);
}

// ---- Helpers ----
function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

function findMatch(id) {
  const { signaux, exclus } = getState();
  return [...(signaux || []), ...(exclus || [])].find(m => String(m.id) === String(id));
}

function openMatchModal(match) {
  import('../components/modal.js').then(({ openModal }) => {
    import('../components/matchCard.js').then(({ renderMatchCard }) => {
      openModal(`${match.homeName} vs ${match.awayName}`, renderMatchCard(match), {
        onOpen: () => attachMatchCardEvents(document.getElementById('modal-body')),
      });
    });
  });
}
