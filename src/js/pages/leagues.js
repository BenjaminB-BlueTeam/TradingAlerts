/**
 * leagues.js — Page "Ligues actives"
 */

import store from '../store/store.js';

const LEAGUE_INFO = {
  bundesliga: {
    name: 'Bundesliga',
    flag: '🇩🇪',
    note: 'Ligue la plus favorable (51:49)',
    noteClass: 'badge-green',
  },
  premier_league: {
    name: 'Premier League',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    note: '',
    noteClass: '',
  },
  ligue_1: {
    name: 'Ligue 1',
    flag: '🇫🇷',
    note: '',
    noteClass: '',
  },
  la_liga: {
    name: 'La Liga',
    flag: '🇪🇸',
    note: 'Structurellement défavorable (43:57)',
    noteClass: 'badge-orange',
  },
  eredivisie: {
    name: 'Eredivisie',
    flag: '🇳🇱',
    note: '',
    noteClass: '',
  },
  championship: {
    name: 'Championship',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    note: '',
    noteClass: '',
  },
  super_lig: {
    name: 'Süper Lig',
    flag: '🇹🇷',
    note: '',
    noteClass: '',
  },
};

export function renderLeagues() {
  const page = document.getElementById('page-leagues');
  if (!page) return;

  const activeLeagues = store.get('activeLeagues') || [];
  const matches = store.get('matches') || [];

  // Calculer stats par ligue
  const leagueStats = computeLeagueStats(matches);

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Ligues actives</div>
        <div class="page-subtitle">${activeLeagues.length}/50 ligues configurées (plan Hobby)</div>
      </div>
    </div>

    <!-- Info encart -->
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:20px;">
      <div class="warning-box green" style="flex:1; min-width:200px;">
        🇩🇪 <strong>Bundesliga :</strong> ligue la plus favorable (51:49)
      </div>
      <div class="warning-box orange" style="flex:1; min-width:200px;">
        🇪🇸 <strong>La Liga :</strong> structurellement défavorable (43:57)
      </div>
    </div>

    <div id="leagues-grid" class="leagues-grid"></div>

    ${!activeLeagues.length ? `
      <div class="empty-state" style="margin-top:24px;">
        <div class="empty-state-icon">🏆</div>
        <div class="empty-state-title">Aucune ligue configurée</div>
        <div class="empty-state-desc">
          Ajoutez des ligues dans les <a href="#" data-page="settings" style="color:var(--color-accent-blue);">Paramètres</a>
        </div>
      </div>
    ` : ''}
  `;

  renderLeagueCards(activeLeagues, leagueStats);

  // Event delegation pour les liens dans empty state
  page.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      import('../components/sidebar.js').then(({ navigateTo }) => navigateTo(el.dataset.page));
    });
  });
}

function computeLeagueStats(matches) {
  const stats = {};

  matches.forEach(m => {
    const id = m.leagueId;
    if (!id) return;

    if (!stats[id]) {
      stats[id] = {
        total: 0,
        forts: 0,
        badge1MT: 0,
        exclus: 0,
        sommeFHG: 0,
        sommePct1MT: 0,
      };
    }

    const s = stats[id];
    s.total++;

    if (m.resultatFHG?.exclu) {
      s.exclus++;
    } else {
      if (m.resultatFHG?.score >= 75) s.forts++;
      if (m.resultatFHG?.badge1MT50) s.badge1MT++;
      s.sommeFHG += m.resultatFHG?.tauxN || 0;
      s.sommePct1MT += m.resultatFHG?.pct1MT || 0;
    }
  });

  // Calculer les moyennes
  Object.values(stats).forEach(s => {
    const nonExclu = s.total - s.exclus;
    s.tauxFHGMoyen = nonExclu > 0 ? Math.round(s.sommeFHG / nonExclu) : 0;
    s.tauxMTMoyen = nonExclu > 0 ? Math.round(s.sommePct1MT / nonExclu) : 0;
  });

  return stats;
}

function renderLeagueCards(leagues, leagueStats) {
  const grid = document.getElementById('leagues-grid');
  if (!grid) return;

  // Utiliser les ligues de démonstration si pas de données API
  const displayLeagues = leagues.length > 0 ? leagues : getDemoLeagues();

  displayLeagues.forEach(league => {
    const stats = leagueStats[league.id] || {
      forts: 0, badge1MT: 0, exclus: 0,
      tauxFHGMoyen: 0, tauxMTMoyen: 0,
    };
    const info = LEAGUE_INFO[league.slug] || {};
    const isActive = league.active !== false;

    const card = document.createElement('div');
    card.className = `league-card${isActive ? '' : ' inactive'}`;

    card.innerHTML = `
      <div class="league-card-header">
        <div class="league-name">
          <span class="league-flag">${info.flag || league.flag || '🏆'}</span>
          <span>${league.name}</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" ${isActive ? 'checked' : ''} data-league-id="${league.id}" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      ${info.note ? `
        <div style="margin-bottom:10px;">
          <span class="badge ${info.noteClass}" style="font-size:10px;">${info.note}</span>
        </div>
      ` : ''}

      <div class="league-stats">
        <div class="league-stat">
          <div class="league-stat-label">Signal FORT</div>
          <div class="league-stat-value" style="color:var(--color-signal-fort);">${stats.forts}</div>
        </div>
        <div class="league-stat">
          <div class="league-stat-label">Badge ★ 1MT</div>
          <div class="league-stat-value" style="color:var(--color-badge-violet);">${stats.badge1MT}</div>
        </div>
        <div class="league-stat">
          <div class="league-stat-label">Exclus H2H</div>
          <div class="league-stat-value" style="color:var(--color-danger);">${stats.exclus}</div>
        </div>
        <div class="league-stat">
          <div class="league-stat-label">FHG moyen</div>
          <div class="league-stat-value">${stats.tauxFHGMoyen}%</div>
        </div>
      </div>

      <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
        <div style="flex:1;">
          <div class="match-stat-label" style="font-size:10px; margin-bottom:4px;">FHG 31-45 moy.</div>
          <div class="progress-bar">
            <div class="progress-fill ${stats.tauxFHGMoyen >= 75 ? 'green' : stats.tauxFHGMoyen >= 60 ? 'orange' : 'gray'}"
              style="width:${Math.min(stats.tauxFHGMoyen, 100)}%"></div>
          </div>
        </div>
        <div style="flex:1;">
          <div class="match-stat-label" style="font-size:10px; margin-bottom:4px;">1MT moy.</div>
          <div class="progress-bar">
            <div class="progress-fill ${stats.tauxMTMoyen >= 65 ? 'green' : stats.tauxMTMoyen >= 50 ? 'blue' : 'gray'}"
              style="width:${Math.min(stats.tauxMTMoyen, 100)}%"></div>
          </div>
        </div>
      </div>

      <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--color-border); display:flex; justify-content:space-between; align-items:center;">
        <span class="badge ${isActive ? 'badge-green' : 'badge-gray'}">${isActive ? 'Active' : 'Pause'}</span>
        <span style="font-size:11px; color:var(--color-text-muted);">${league.season || 'Saison 2024/25'}</span>
      </div>
    `;

    // Toggle activer/désactiver
    card.querySelector('input[type="checkbox"]')?.addEventListener('change', (e) => {
      const leagueId = e.target.dataset.leagueId;
      const newActive = e.target.checked;
      const leagues = store.get('activeLeagues') || [];
      const updated = leagues.map(l =>
        l.id === leagueId ? { ...l, active: newActive } : l
      );
      store.set('activeLeagues', updated);
      card.classList.toggle('inactive', !newActive);
      card.querySelector('.badge.badge-green, .badge.badge-gray').className =
        `badge ${newActive ? 'badge-green' : 'badge-gray'}`;
      card.querySelector('.badge.badge-green, .badge.badge-gray').textContent =
        newActive ? 'Active' : 'Pause';
    });

    grid.appendChild(card);
  });
}

function getDemoLeagues() {
  return [
    { id: 'bl', name: 'Bundesliga', flag: '🇩🇪', slug: 'bundesliga', season: '2024/25', active: true },
    { id: 'pl', name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', slug: 'premier_league', season: '2024/25', active: true },
    { id: 'l1', name: 'Ligue 1', flag: '🇫🇷', slug: 'ligue_1', season: '2024/25', active: true },
    { id: 'lla', name: 'La Liga', flag: '🇪🇸', slug: 'la_liga', season: '2024/25', active: true },
    { id: 'ere', name: 'Eredivisie', flag: '🇳🇱', slug: 'eredivisie', season: '2024/25', active: true },
    { id: 'ch', name: 'Championship', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', slug: 'championship', season: '2024/25', active: false },
    { id: 'sl', name: 'Süper Lig', flag: '🇹🇷', slug: 'super_lig', season: '2024/25', active: true },
  ];
}
