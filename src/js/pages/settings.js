/**
 * settings.js — Page Paramètres
 */

import store from '../store/store.js';
import { testApiConnection, fetchCountryLeagues } from '../api/footystats.js';
import { showToast } from '../components/modal.js';
import { createPerformanceChart } from '../components/charts.js';

export function renderSettings() {
  const page = document.getElementById('page-settings');
  if (!page) return;

  const apiKey = store.get('apiKey') || '';
  const activeLeagues = store.get('activeLeagues') || [];
  const trades = store.get('trades') || [];
  const tradeStats = store.getTradeStats();

  page.innerHTML = `
    <div class="page-header">
      <div class="page-title">Paramètres</div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <!-- Colonne gauche -->
      <div>
        ${buildAPIBlock(apiKey)}
        ${buildLeaguesBlock(activeLeagues)}
      </div>
      <!-- Colonne droite -->
      <div>
        ${buildTradeFormBlock()}
        ${buildBankrollBlock()}
      </div>
    </div>

    <!-- Stats personnelles + journal -->
    <div style="margin-top:16px;">
      ${buildStatsBlock(tradeStats)}
      ${buildJournalBlock(trades)}
    </div>
  `;

  initSettings(apiKey, activeLeagues);
}

function buildAPIBlock(apiKey) {
  return `
    <div class="settings-block">
      <div class="settings-block-title">🔑 Connexion API FootyStats</div>

      <div class="form-group">
        <label class="form-label">Clé API</label>
        <div class="form-input-password" style="position:relative;">
          <input type="password" class="form-input" id="api-key-input"
            value="${apiKey}"
            placeholder="Entrez votre clé API FootyStats" />
          <span class="toggle-visibility" id="toggle-key-vis">👁</span>
        </div>
        <div class="form-hint">
          Obtenez votre clé sur <span style="color:var(--color-accent-blue)">football-data-api.com</span>
        </div>
      </div>

      <div style="display:flex; gap:8px; align-items:center;">
        <button id="btn-save-api" class="btn btn-primary btn-sm">💾 Sauvegarder</button>
        <button id="btn-test-api" class="btn btn-secondary btn-sm">🔗 Tester la connexion</button>
      </div>

      <div id="api-test-result" style="display:none;" class="api-test-result"></div>
    </div>
  `;
}

function buildLeaguesBlock(activeLeagues) {
  const RECOMMENDED = [
    'Bundesliga', 'Premier League', 'Ligue 1',
    'Eredivisie', 'Championship', 'Süper Lig',
  ];

  return `
    <div class="settings-block">
      <div class="settings-block-title">🏆 Configuration des ligues</div>

      <div class="form-group">
        <label class="form-label">Rechercher une ligue</label>
        <input type="text" class="form-input" id="league-search"
          placeholder="Bundesliga, Premier League..." />
      </div>

      <div style="margin-bottom:8px;">
        <span style="font-size:12px;color:var(--color-text-muted);">Recommandées :</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
          ${RECOMMENDED.map(l => `
            <button class="filter-btn recommended-league" data-league="${l}">${l}</button>
          `).join('')}
        </div>
      </div>

      <div id="league-list" class="league-search-list"></div>
      <div class="league-counter" id="league-counter">${activeLeagues.length}/50 ligues sélectionnées</div>
    </div>
  `;
}

function buildTradeFormBlock() {
  const today = new Date().toISOString().split('T')[0];
  return `
    <div class="settings-block">
      <div class="settings-block-title">📝 Saisir un trade</div>

      <form id="full-trade-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" class="form-input" name="date" value="${today}" />
          </div>
          <div class="form-group">
            <label class="form-label">Ligue</label>
            <input type="text" class="form-input" name="ligue" placeholder="Bundesliga" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Équipes</label>
          <input type="text" class="form-input" name="match" placeholder="Bayern Munich vs Dortmund" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Signal FHG% 31-45min</label>
            <input type="number" class="form-input" name="signalFHG" min="0" max="100" placeholder="82" />
          </div>
          <div class="form-group">
            <label class="form-label">Stratégie</label>
            <select class="form-select" name="strategie">
              <option value="FHG">FHG seul</option>
              <option value="FHG+DC">FHG + DC</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Badge 1MT 50%+</label>
            <select class="form-select" name="badge1MT50">
              <option value="non">NON</option>
              <option value="oui">OUI ★</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">H2H</label>
            <select class="form-select" name="h2h">
              <option value="favorable">Favorable ✓</option>
              <option value="defavorable">Défavorable ⚠</option>
              <option value="insuffisant">Insuffisant ?</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Timer prévu</label>
            <input type="text" class="form-input" name="timer" placeholder="25-35e min" />
          </div>
          <div class="form-group">
            <label class="form-label">Cote objective</label>
            <input type="number" class="form-input" name="coteObjectif" step="0.01" min="1" placeholder="2.30" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Mise (€)</label>
            <input type="number" class="form-input" name="mise" min="0" placeholder="25" />
          </div>
          <div class="form-group">
            <label class="form-label">DC possible ?</label>
            <select class="form-select" name="dcPossible">
              <option value="non">NON</option>
              <option value="oui">OUI</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">État d'esprit</label>
          <input type="text" class="form-input" name="etatEsprit" placeholder="Focalisé, neutre..." />
        </div>

        <div class="form-group">
          <label class="form-label">Résultat</label>
          <select class="form-select" name="resultat">
            <option value="non-joue">Non joué</option>
            <option value="gagne">Gagné ✓</option>
            <option value="perdu">Perdu ✗</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Analyse post-match</label>
          <textarea class="form-textarea" name="analysePost" placeholder="Notes libres..."></textarea>
        </div>

        <button type="submit" class="btn btn-primary btn-full">💾 Enregistrer le trade</button>
      </form>
    </div>
  `;
}

function buildBankrollBlock() {
  return `
    <div class="settings-block">
      <div class="settings-block-title">💰 Calcul Bankroll</div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Bankroll (€)</label>
          <input type="number" class="form-input" id="bankroll-input" placeholder="1000" min="0" />
        </div>
        <div class="form-group">
          <label class="form-label">% par mise</label>
          <input type="number" class="form-input" id="bankroll-pct" placeholder="2.5" min="0" max="100" step="0.1" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Cote cible</label>
          <input type="number" class="form-input" id="bankroll-cote" placeholder="2.30" step="0.01" min="1" />
        </div>
        <div class="form-group">
          <label class="form-label">% réussite estimé</label>
          <input type="number" class="form-input" id="bankroll-reussite" placeholder="65" min="0" max="100" />
        </div>
      </div>

      <button class="btn btn-secondary btn-full" id="btn-calc-bankroll">📊 Calculer projection 30j</button>

      <div id="bankroll-result" style="display:none; margin-top:16px;">
        <div class="bankroll-scenarios">
          <div class="scenario-card">
            <div class="scenario-title">Votre scénario personnalisé</div>
            <div class="scenario-result" id="sc-custom">—</div>
            <div class="scenario-detail" id="sc-custom-detail">—</div>
          </div>
          <div class="scenario-card">
            <div class="scenario-title">Scénario standard (30 paris · 2,30 · 50%)</div>
            <div class="scenario-result" id="sc-1">—</div>
            <div class="scenario-detail">30 paris · cote 2,30 · 50% réussite</div>
          </div>
          <div class="scenario-card">
            <div class="scenario-title">Scénario optimiste (30 paris · 2,50 · 65%)</div>
            <div class="scenario-result" id="sc-2">—</div>
            <div class="scenario-detail">30 paris · cote 2,50 · 65% réussite</div>
          </div>
          <div class="scenario-card">
            <div class="scenario-title">Mise fixe (25€ · cote 2,50 · 65%)</div>
            <div class="scenario-result" id="sc-3">—</div>
            <div class="scenario-detail">30 paris · mise 25€ · cote 2,50 · 65% réussite</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildStatsBlock(stats) {
  if (!stats) {
    return `
      <div class="settings-block">
        <div class="settings-block-title">📊 Stats personnelles</div>
        <div class="empty-state">
          <div class="empty-state-icon">📈</div>
          <div class="empty-state-title">Pas encore de données</div>
          <div class="empty-state-desc">Enregistrez des trades pour voir vos statistiques</div>
        </div>
      </div>
    `;
  }

  return `
    <div class="settings-block">
      <div class="settings-block-title" style="display:flex;justify-content:space-between;">
        <span>📊 Stats personnelles</span>
        <span style="font-size:12px;color:var(--color-text-muted);">${stats.total} trades résolus</span>
      </div>

      <div class="stats-grid" style="margin-bottom:16px;">
        <div class="stat-card">
          <div class="stat-card-label">Taux de réussite global</div>
          <div class="stat-card-value" style="color:${stats.tauxReussite >= 60 ? 'var(--color-accent-green)' : 'var(--color-warning-orange)'};">
            ${stats.tauxReussite}%
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Avec badge ★ 1MT</div>
          <div class="stat-card-value" style="color:var(--color-badge-violet);">
            ${stats.tauxAvec1MT !== null ? stats.tauxAvec1MT + '%' : '—'}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">H2H favorable ✓</div>
          <div class="stat-card-value" style="color:var(--color-accent-green);">
            ${stats.tauxH2HVert !== null ? stats.tauxH2HVert + '%' : '—'}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">H2H défavorable ⚠</div>
          <div class="stat-card-value" style="color:var(--color-warning-orange);">
            ${stats.tauxH2HOrange !== null ? stats.tauxH2HOrange + '%' : '—'}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Cote moyenne</div>
          <div class="stat-card-value">${stats.coteMoyenne || '—'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Meilleure série</div>
          <div class="stat-card-value" style="color:var(--color-accent-green);">${stats.meillereSerie}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Pire série</div>
          <div class="stat-card-value" style="color:var(--color-danger);">${stats.piresSerie}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Trades gagnés</div>
          <div class="stat-card-value">${stats.gagnes}/${stats.total}</div>
        </div>
      </div>

      <div class="chart-container" style="height:180px;">
        <canvas id="perf-chart"></canvas>
      </div>
    </div>
  `;
}

function buildJournalBlock(trades) {
  return `
    <div class="settings-block" style="margin-top:16px;">
      <div class="settings-block-title" style="display:flex;justify-content:space-between;align-items:center;">
        <span>📓 Journal des trades</span>
        <div style="display:flex;gap:8px;">
          <button id="btn-export-csv" class="btn btn-secondary btn-sm">📥 Export CSV</button>
        </div>
      </div>

      ${trades.length === 0
        ? '<div class="empty-state"><div class="empty-state-icon">📓</div><div class="empty-state-title">Aucun trade enregistré</div></div>'
        : `
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th><th>Match</th><th>Ligue</th>
                  <th>FHG%</th><th>Strat.</th><th>1MT</th><th>H2H</th>
                  <th>Cote</th><th>Mise</th><th>Résultat</th><th>Actions</th>
                </tr>
              </thead>
              <tbody id="journal-tbody">
                ${renderJournalRows(trades)}
              </tbody>
            </table>
          </div>
        `
      }
    </div>
  `;
}

function renderJournalRows(trades) {
  return [...trades].reverse().map(t => `
    <tr>
      <td style="font-size:11px;color:var(--color-text-muted);">${t.date || '—'}</td>
      <td style="font-size:12px;font-weight:500;">${t.match || '—'}</td>
      <td style="font-size:11px;color:var(--color-text-muted);">${t.ligue || '—'}</td>
      <td><span class="badge badge-blue" style="font-size:10px;">${t.signalFHG || '—'}%</span></td>
      <td style="font-size:11px;">${t.strategie || 'FHG'}</td>
      <td>${t.badge1MT50 ? '<span class="badge badge-violet" style="font-size:10px;">★</span>' : '—'}</td>
      <td>
        <span class="badge ${t.h2h === 'favorable' ? 'badge-green' : t.h2h === 'defavorable' ? 'badge-orange' : 'badge-gray'}" style="font-size:10px;">
          ${t.h2h || '?'}
        </span>
      </td>
      <td style="font-size:12px;">${t.coteObjectif || '—'}</td>
      <td style="font-size:12px;">${t.mise ? t.mise + '€' : '—'}</td>
      <td><span class="trade-result-badge ${t.resultat}">${
        t.resultat === 'gagne' ? 'Gagné' :
        t.resultat === 'perdu' ? 'Perdu' : 'En attente'
      }</span></td>
      <td>
        <button class="btn btn-sm btn-danger" data-delete-trade="${t.id}">🗑</button>
      </td>
    </tr>
  `).join('');
}

function initSettings(apiKey, activeLeagues) {
  // Toggle visibilité clé API
  document.getElementById('toggle-key-vis')?.addEventListener('click', () => {
    const input = document.getElementById('api-key-input');
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  });

  // Sauvegarder clé API
  document.getElementById('btn-save-api')?.addEventListener('click', () => {
    const key = document.getElementById('api-key-input')?.value?.trim();
    if (!key) {
      showToast('Veuillez entrer une clé API', 'warning');
      return;
    }
    store.set('apiKey', key);
    store.set('demoMode', false);
    localStorage.setItem('fhg_api_key', key);
    showToast('Clé API sauvegardée !', 'success');
  });

  // Tester connexion
  document.getElementById('btn-test-api')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-test-api');
    const resultEl = document.getElementById('api-test-result');
    if (!btn || !resultEl) return;

    btn.disabled = true;
    btn.textContent = '⏳ Test en cours...';
    resultEl.style.display = 'none';

    const result = await testApiConnection();

    btn.disabled = false;
    btn.textContent = '🔗 Tester la connexion';

    resultEl.style.display = 'flex';
    if (result.success) {
      resultEl.className = 'api-test-result success';
      resultEl.textContent = '✓ Connexion réussie — API FootyStats accessible';
      store.set('apiConnected', true);
      store.set('apiError', null);
    } else {
      resultEl.className = 'api-test-result error';
      resultEl.textContent = `✗ ${result.error}`;
      store.set('apiConnected', false);
      store.set('apiError', result.error);
    }
  });

  // Leagues
  initLeagueSelector(activeLeagues);

  // Trade form
  document.getElementById('full-trade-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const trade = Object.fromEntries(fd.entries());
    trade.coteObjectif = parseFloat(trade.coteObjectif) || 0;
    trade.mise = parseFloat(trade.mise) || 0;
    trade.badge1MT50 = trade.badge1MT50 === 'oui';
    store.addTrade(trade);
    e.target.reset();
    showToast('Trade enregistré !', 'success');
    renderSettings(); // Re-render pour mettre à jour le journal
  });

  // Bankroll calc
  document.getElementById('btn-calc-bankroll')?.addEventListener('click', calcBankroll);

  // Export CSV
  document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);

  // Delete trades
  document.querySelectorAll('[data-delete-trade]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = parseInt(e.target.dataset.deleteTrade);
      if (confirm('Supprimer ce trade ?')) {
        store.deleteTrade(id);
        renderSettings();
      }
    });
  });

  // Performance chart
  const trades = store.get('trades') || [];
  const resolvedTrades = trades.filter(t => t.resultat !== 'non-joue');
  if (resolvedTrades.length > 0) {
    setTimeout(() => {
      createPerformanceChart('perf-chart', resolvedTrades);
    }, 100);
  }
}

function initLeagueSelector(activeLeagues) {
  const searchInput = document.getElementById('league-search');
  const listContainer = document.getElementById('league-list');
  const counter = document.getElementById('league-counter');

  if (!searchInput || !listContainer) return;

  // Ligues de démo disponibles
  const availableLeagues = [
    { id: 'bl', name: 'Bundesliga', flag: '🇩🇪', country: 'Germany' },
    { id: 'pl', name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', country: 'England' },
    { id: 'l1', name: 'Ligue 1', flag: '🇫🇷', country: 'France' },
    { id: 'lla', name: 'La Liga', flag: '🇪🇸', country: 'Spain' },
    { id: 'ere', name: 'Eredivisie', flag: '🇳🇱', country: 'Netherlands' },
    { id: 'ch', name: 'Championship', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', country: 'England' },
    { id: 'sl', name: 'Süper Lig', flag: '🇹🇷', country: 'Turkey' },
    { id: 'sa', name: 'Serie A', flag: '🇮🇹', country: 'Italy' },
    { id: 'bl2', name: 'Bundesliga 2', flag: '🇩🇪', country: 'Germany' },
    { id: 'lpd', name: 'La Liga 2', flag: '🇪🇸', country: 'Spain' },
    { id: 'mls', name: 'MLS', flag: '🇺🇸', country: 'USA' },
    { id: 'elo', name: 'Eliteserien', flag: '🇳🇴', country: 'Norway' },
  ];

  let selectedIds = new Set(activeLeagues.map(l => l.id));

  function renderList(search = '') {
    const filtered = availableLeagues.filter(l =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.country.toLowerCase().includes(search.toLowerCase())
    );

    listContainer.innerHTML = filtered.map(l => `
      <div class="league-search-item ${selectedIds.has(l.id) ? 'selected' : ''}"
        data-id="${l.id}" data-name="${l.name}" data-flag="${l.flag}">
        <span>${l.flag} ${l.name} <span style="color:var(--color-text-muted);font-size:11px;">${l.country}</span></span>
        <span style="font-size:16px;">${selectedIds.has(l.id) ? '✓' : '+'}</span>
      </div>
    `).join('');

    // Events
    listContainer.querySelectorAll('.league-search-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        if (selectedIds.has(id)) {
          selectedIds.delete(id);
        } else {
          if (selectedIds.size >= 50) {
            showToast('Maximum 50 ligues (plan Hobby)', 'warning');
            return;
          }
          selectedIds.add(id);
        }

        const updated = availableLeagues
          .filter(l => selectedIds.has(l.id))
          .map(l => ({ ...l, active: true }));

        store.set('activeLeagues', updated);
        if (counter) counter.textContent = `${selectedIds.size}/50 ligues sélectionnées`;
        renderList(searchInput.value);
      });
    });
  }

  searchInput.addEventListener('input', e => renderList(e.target.value));

  // Boutons recommandés
  document.querySelectorAll('.recommended-league').forEach(btn => {
    const name = btn.dataset.league;
    btn.addEventListener('click', () => {
      const league = availableLeagues.find(l => l.name === name);
      if (!league) return;
      if (!selectedIds.has(league.id)) {
        if (selectedIds.size >= 50) {
          showToast('Maximum 50 ligues', 'warning');
          return;
        }
        selectedIds.add(league.id);
        const updated = availableLeagues
          .filter(l => selectedIds.has(l.id))
          .map(l => ({ ...l, active: true }));
        store.set('activeLeagues', updated);
        if (counter) counter.textContent = `${selectedIds.size}/50 ligues sélectionnées`;
      }
      renderList(searchInput.value);
    });
  });

  renderList();
}

function calcBankroll() {
  const bankroll = parseFloat(document.getElementById('bankroll-input')?.value) || 1000;
  const pct = parseFloat(document.getElementById('bankroll-pct')?.value) || 2.5;
  const cote = parseFloat(document.getElementById('bankroll-cote')?.value) || 2.30;
  const reussite = parseFloat(document.getElementById('bankroll-reussite')?.value) || 65;

  const mise = bankroll * (pct / 100);
  const nParis = 30;

  function calcProfit(bankroll, cote, reussite, nParis, mise) {
    const gain = cote - 1;
    const pctR = reussite / 100;
    const gagnes = Math.round(nParis * pctR);
    const perdus = nParis - gagnes;
    return (gagnes * gain * mise) - (perdus * mise);
  }

  const custom = calcProfit(bankroll, cote, reussite, nParis, mise);
  const s1 = calcProfit(bankroll, 2.30, 50, 30, mise);
  const s2 = calcProfit(bankroll, 2.50, 65, 30, mise);
  const s3 = calcProfit(1000, 2.50, 65, 30, 25);

  const fmt = v => `${v >= 0 ? '+' : ''}${Math.round(v)}€`;

  document.getElementById('sc-custom').textContent = fmt(custom);
  document.getElementById('sc-custom-detail').textContent =
    `${nParis} paris · cote ${cote} · ${reussite}% · mise ${mise.toFixed(0)}€`;
  document.getElementById('sc-1').textContent = fmt(s1);
  document.getElementById('sc-2').textContent = fmt(s2);
  document.getElementById('sc-3').textContent = fmt(s3);

  const colors = [custom, s1, s2, s3].map(v => v >= 0
    ? 'var(--color-accent-green)'
    : 'var(--color-danger)'
  );

  ['sc-custom', 'sc-1', 'sc-2', 'sc-3'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.style.color = colors[i];
  });

  document.getElementById('bankroll-result').style.display = 'block';
}

function exportCSV() {
  const trades = store.get('trades') || [];
  if (!trades.length) {
    showToast('Aucun trade à exporter', 'warning');
    return;
  }

  const headers = ['Date', 'Match', 'Ligue', 'Signal FHG%', 'Stratégie',
    'Badge 1MT', 'H2H', 'Timer', 'Cote', 'Mise', 'DC Possible',
    'État esprit', 'Résultat', 'Analyse'];

  const rows = trades.map(t => [
    t.date || '',
    t.match || '',
    t.ligue || '',
    t.signalFHG || '',
    t.strategie || '',
    t.badge1MT50 ? 'OUI' : 'NON',
    t.h2h || '',
    t.timer || '',
    t.coteObjectif || '',
    t.mise || '',
    t.dcPossible || '',
    t.etatEsprit || '',
    t.resultat || '',
    (t.analysePost || '').replace(/\n/g, ' '),
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fhg-trades-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showToast(`${trades.length} trades exportés`, 'success');
}
