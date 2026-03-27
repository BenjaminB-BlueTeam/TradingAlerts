/**
 * dashboard.js — Page principale Dashboard
 */

import store from '../store/store.js';
import { calcDashboardStats, categoriserMatchs, trierParScore } from '../core/filters.js';
import { renderMatchCard, renderExcludedCard } from '../components/matchCard.js';

let countdownInterval = null;

export function renderDashboard() {
  const page = document.getElementById('page-dashboard');
  if (!page) return;

  const matches = store.get('matches') || [];
  const now = new Date();
  const stats = calcDashboardStats(matches);
  const { forts, moyens, watchlist, exclus } = categoriserMatchs(trierParScore(matches));

  page.innerHTML = buildDashboardHTML(stats, now);

  // Rendre les sections de matchs
  renderSignalCards(forts, 'signals-forts', 'signal-fort');
  renderSignalCards(moyens, 'signals-moyens', 'signal-moyen');
  renderWatchlist(watchlist);
  renderExclusSection(exclus, stats.exclus);

  // Countdown prochaine fenêtre
  startCountdown();

  // Accordion "Matchs exclus"
  document.getElementById('accordion-exclus')?.addEventListener('click', () => {
    document.getElementById('accordion-exclus-container')?.classList.toggle('open');
    const arrow = document.querySelector('#accordion-exclus .accordion-arrow');
    if (arrow) arrow.textContent = document.getElementById('accordion-exclus-container')?.classList.contains('open') ? '▲' : '▼';
  });

  // Focus mode
  document.getElementById('btn-focus-mode')?.addEventListener('click', activateFocusMode);
}

function buildDashboardHTML(stats, now) {
  const dateStr = now.toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return `
    <div class="page-header">
      <div>
        <div class="page-title">Dashboard</div>
        <div class="page-subtitle">${dateStr} — ${timeStr}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <div class="countdown">
          <span>Prochaine fenêtre :</span>
          <span class="countdown-value" id="countdown-value">--:--</span>
        </div>
        <button id="btn-focus-mode" class="btn btn-secondary btn-sm">🎯 Mode Focus</button>
      </div>
    </div>

    <!-- Metric cards -->
    <div class="metric-cards">
      <div class="metric-card metric-fort">
        <div class="metric-label">Signaux FORTS</div>
        <div class="metric-value">${stats.forts}</div>
        <div class="metric-sub">Score ≥ 75</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Matchs analysés</div>
        <div class="metric-value">${stats.analyses}</div>
        <div class="metric-sub">Aujourd'hui</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Ligues actives</div>
        <div class="metric-value">${stats.liguesActives}</div>
        <div class="metric-sub">Surveillées</div>
      </div>
      <div class="metric-card metric-danger">
        <div class="metric-label">Matchs exclus</div>
        <div class="metric-value">${stats.exclus}</div>
        <div class="metric-sub">Filtre H2H</div>
      </div>
    </div>

    <!-- Signaux FORTS -->
    <div class="section-header">
      <div>
        <div class="section-title">⚡ Signaux du jour — FORTS</div>
        <div class="section-subtitle">Score ≥ 75 — Triés par score décroissant</div>
      </div>
    </div>
    <div id="signals-forts" class="match-cards-grid mb-24"></div>

    <!-- Signaux MOYENS -->
    <div class="section-header">
      <div>
        <div class="section-title">📊 Signaux MOYENS</div>
        <div class="section-subtitle">Score 60-74 — À surveiller</div>
      </div>
    </div>
    <div id="signals-moyens" class="match-cards-grid mb-24"></div>

    <!-- Watchlist -->
    <div class="section-header">
      <div>
        <div class="section-title">👁 Watchlist</div>
        <div class="section-subtitle">Score < 60 — Signaux faibles</div>
      </div>
    </div>
    <div id="watchlist-container" class="mb-24"></div>

    <!-- Matchs exclus (accordéon) -->
    <div class="accordion" id="accordion-exclus-container">
      <div class="accordion-header" id="accordion-exclus">
        <div class="accordion-title">
          <span>🚫</span>
          <span id="exclus-title">Matchs écartés par le filtre H2H (${stats.exclus})</span>
        </div>
        <span class="accordion-arrow">▼</span>
      </div>
      <div class="accordion-body">
        <div class="warning-box orange mb-12">
          <span>⚠</span>
          <strong>La récurrence H2H prime sur tout</strong> — Ces matchs ont été automatiquement exclus car l'équipe n'a jamais marqué en 1ère mi-temps contre cet adversaire sur les confrontations disponibles.
        </div>
        <div id="exclus-list" class="match-cards-grid"></div>
      </div>
    </div>
  `;
}

function renderSignalCards(matches, containerId, type) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!matches.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${type === 'signal-fort' ? '⚡' : '📊'}</div>
        <div class="empty-state-title">Aucun signal ${type === 'signal-fort' ? 'fort' : 'moyen'} aujourd'hui</div>
        <div class="empty-state-desc">Les signaux apparaîtront ici une fois les données chargées</div>
      </div>
    `;
    return;
  }

  matches.forEach(matchData => {
    const card = renderMatchCard(matchData);
    if (card) container.appendChild(card);
  });
}

function renderWatchlist(matches) {
  const container = document.getElementById('watchlist-container');
  if (!container) return;

  if (!matches.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👁</div>
        <div class="empty-state-title">Watchlist vide</div>
      </div>
    `;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'watchlist-grid';

  matches.forEach(m => {
    const item = document.createElement('div');
    item.className = 'watchlist-item';
    item.innerHTML = `
      <div class="watchlist-teams">${m.home} vs ${m.away}</div>
      <div class="watchlist-meta">
        <span class="match-time">${m.matchTime || '--:--'}</span>
        <span class="badge badge-faible">${m.resultatFHG?.score ?? '—'}</span>
        ${m.resultatFHG?.badge1MT50 ? '<span class="badge badge-violet" style="font-size:10px;">★</span>' : ''}
      </div>
    `;
    item.addEventListener('click', () => {
      import('../components/matchCard.js').then(({ renderMatchCard }) => {
        import('../components/modal.js').then(({ openMatchAnalysisModal }) => {
          const card = renderMatchCard(m);
          if (card) openMatchAnalysisModal(card.outerHTML, `${m.home} vs ${m.away}`);
        });
      });
    });
    grid.appendChild(item);
  });

  container.appendChild(grid);
}

function renderExclusSection(matches, count) {
  const list = document.getElementById('exclus-list');
  const title = document.getElementById('exclus-title');

  if (title) title.textContent = `Matchs écartés par le filtre H2H (${count})`;

  if (!list) return;

  if (!matches.length) {
    list.innerHTML = `
      <div class="empty-state" style="padding:24px;">
        <div class="empty-state-title">Aucun match exclu aujourd'hui</div>
        <div class="empty-state-desc">Le filtre H2H n'a exclu aucun match.</div>
      </div>
    `;
    return;
  }

  matches.forEach(m => {
    const card = renderExcludedCard(m);
    if (card) list.appendChild(card);
  });
}

function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);

  function update() {
    const el = document.getElementById('countdown-value');
    if (!el) {
      clearInterval(countdownInterval);
      return;
    }

    const now = new Date();
    const matches = store.get('matches') || [];

    // Trouver le prochain match dans les prochaines heures
    const futurMatches = matches
      .filter(m => m.matchTimestamp && m.matchTimestamp > Date.now())
      .sort((a, b) => a.matchTimestamp - b.matchTimestamp);

    if (!futurMatches.length) {
      el.textContent = 'Aucun match';
      return;
    }

    const next = futurMatches[0];
    const diff = next.matchTimestamp - Date.now();
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    if (diff < 0) {
      el.textContent = 'En cours';
    } else if (hours > 0) {
      el.textContent = `${hours}h${mins.toString().padStart(2, '0')}`;
    } else {
      el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  }

  update();
  countdownInterval = setInterval(update, 1000);
}

function activateFocusMode() {
  const focusEl = document.getElementById('focus-mode');
  const focusContent = document.getElementById('focus-content');

  if (!focusEl || !focusContent) return;

  const matches = store.get('matches') || [];
  const { forts, moyens } = categoriserMatchs(trierParScore(matches));
  const prioritaires = [...forts, ...moyens].filter(m => {
    if (!m.matchTimestamp) return true;
    const diff = m.matchTimestamp - Date.now();
    return diff >= -45 * 60000 && diff <= 30 * 60000;
  });

  focusContent.innerHTML = `
    <div class="section-header mb-16">
      <div class="section-title">Matchs actifs et dans 30min</div>
      <div class="section-subtitle">${prioritaires.length} match${prioritaires.length > 1 ? 's' : ''} prioritaire${prioritaires.length > 1 ? 's' : ''}</div>
    </div>
    <div id="focus-cards" class="match-cards-grid"></div>
  `;

  const grid = document.getElementById('focus-cards');
  if (!prioritaires.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⏳</div>
        <div class="empty-state-title">Aucun match prioritaire en ce moment</div>
      </div>
    `;
  } else {
    prioritaires.forEach(m => {
      const card = renderMatchCard(m, { compact: true });
      if (card) grid.appendChild(card);
    });
  }

  focusEl.style.display = 'flex';
  document.getElementById('focus-exit')?.addEventListener('click', () => {
    focusEl.style.display = 'none';
  });
}
