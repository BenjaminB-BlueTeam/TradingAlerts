/* ================================================
   settings.js — Page Paramètres
   FHG Tracker
   ================================================ */

import { getState, saveLeagues, addTrade, updateTrade, deleteTrade,
         clearAllData, calcStatsTradesGlobal } from '../store/store.js';
import { testApiConnection } from '../api/footystats.js';
import { showToast } from '../components/matchCard.js';
import { createWinRateChart, createBankrollChart } from '../components/charts.js';

/**
 * Rendre la page Paramètres.
 */
export function renderSettings() {
  const { isDemo, leagues, trades } = getState();
  const config  = getState('config') || {};
  const stats   = calcStatsTradesGlobal();
  const bankroll = parseFloat(localStorage.getItem('fhg_bankroll') || '0');

  return `
    <!-- CONNEXION API -->
    <div class="settings-block">
      <div class="settings-block__title">🔌 Connexion API FootyStats</div>

      <div id="api-status-block" style="margin-bottom:16px;">
        ${isDemo
          ? `<div class="danger-box">⚠ Mode démonstration — API non configurée</div>`
          : `<div class="info-box" style="border-color:var(--color-accent-green);color:var(--color-accent-green);">✓ API connectée et opérationnelle</div>`
        }
      </div>

      <div class="info-box" style="font-size:12px;margin-bottom:12px;">
        🔒 La clé API est stockée de façon sécurisée côté serveur (variable d'env Netlify).<br/>
        Elle n'est jamais exposée dans le navigateur.<br/><br/>
        <strong>Pour configurer ou changer la clé :</strong><br/>
        1. Netlify → votre site → <strong>Site configuration → Environment variables</strong><br/>
        2. Ajouter <code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;">FOOTYSTATS_API_KEY</code> avec votre clé<br/>
        3. Redéployer le site (Deploy → Trigger deploy)
      </div>

      <button class="btn btn--secondary" id="api-test-btn">🔗 Tester la connexion</button>
      <div id="api-test-result"></div>
    </div>

    <!-- CONFIGURATION LIGUES -->
    <div class="settings-block">
      <div class="settings-block__title">🏆 Configuration des ligues</div>
      <div class="form-group">
        <label class="form-label">Rechercher une ligue</label>
        <input type="text" id="league-search" class="form-input"
          placeholder="Bundesliga, Premier League…" />
      </div>
      <div style="margin-bottom:10px;font-size:12px;color:var(--color-text-muted);">
        <span id="leagues-counter">${(leagues || []).filter(l => l.active).length}</span>/50 ligues actives
      </div>
      <div id="leagues-list" style="display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto;">
        ${renderLeaguesList(leagues)}
      </div>
      <div class="info-box mt-16" style="font-size:12px;">
        ⭐ Pré-sélection recommandée : Bundesliga, Premier League, Ligue 1, Eredivisie, Championship, Süper Lig
      </div>
    </div>

    <!-- JOURNAL DES TRADES -->
    <div class="settings-block">
      <div class="settings-block__title">📋 Journal des trades</div>

      ${trades.length === 0
        ? `<div class="empty-state" style="padding:24px;">
             <div class="empty-state__icon">📋</div>
             <div class="empty-state__title">Aucun trade enregistré</div>
           </div>`
        : `
          <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">
            <select id="journal-filter-result" class="form-input" style="width:140px;padding:6px 10px;">
              <option value="">Tous les résultats</option>
              <option value="gagne">Gagnés</option>
              <option value="perdu">Perdus</option>
              <option value="non_joue">Non joués</option>
            </select>
            <select id="journal-filter-ligue" class="form-input" style="width:160px;padding:6px 10px;">
              <option value="">Toutes les ligues</option>
              ${[...new Set(trades.map(t => t.ligue).filter(Boolean))].map(l =>
                `<option value="${l}">${l}</option>`
              ).join('')}
            </select>
            <button class="btn btn--secondary btn--sm" id="export-csv-btn">📥 Export CSV</button>
            <span style="font-size:12px;color:var(--color-text-muted);">
              ${trades.length} trade${trades.length > 1 ? 's' : ''}
            </span>
          </div>
          <div class="table-wrapper">
            <table class="data-table" id="journal-table">
              <thead>
                <tr>
                  <th>Date</th><th>Match</th><th>Ligue</th><th>FHG%</th>
                  <th>Stratégie</th><th>1MT</th><th>H2H</th><th>Cote</th>
                  <th>Résultat</th><th>Action</th>
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

    <!-- STATS PERSONNELLES -->
    <div class="settings-block">
      <div class="settings-block__title">📈 Stats personnelles</div>
      ${stats
        ? `
          <div class="stats-grid mb-24">
            <div class="stat-card">
              <div class="stat-card__label">Taux de réussite</div>
              <div class="stat-card__value ${stats.tauxGlobal >= 55 ? 'green' : 'orange'}">${stats.tauxGlobal}%</div>
            </div>
            <div class="stat-card">
              <div class="stat-card__label">Trades joués</div>
              <div class="stat-card__value">${stats.total}</div>
            </div>
            <div class="stat-card">
              <div class="stat-card__label">Cote moyenne</div>
              <div class="stat-card__value">${stats.coteMoy || '—'}</div>
            </div>
            <div class="stat-card">
              <div class="stat-card__label">ROI estimé</div>
              <div class="stat-card__value ${(stats.roi || 0) >= 0 ? 'green' : 'orange'}">${stats.roi !== null ? stats.roi + '%' : '—'}</div>
            </div>
            <div class="stat-card">
              <div class="stat-card__label">Meilleure série</div>
              <div class="stat-card__value green">${stats.maxWin}W</div>
            </div>
            <div class="stat-card">
              <div class="stat-card__label">Pire série</div>
              <div class="stat-card__value orange">${stats.maxLoss}L</div>
            </div>
          </div>
          ${stats.total >= 5 ? `
            <div class="chart-wrapper" style="height:200px;">
              <canvas id="winrate-chart"></canvas>
            </div>
          ` : ''}
        `
        : `<div class="info-box" style="font-size:12px;">
             ℹ Enregistrez des trades pour voir vos statistiques personnelles.
           </div>`
      }
    </div>

    <!-- CALCUL BANKROLL -->
    <div class="settings-block">
      <div class="settings-block__title">💰 Calcul bankroll</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">
        <div class="form-group">
          <label class="form-label">Bankroll (€)</label>
          <input type="number" id="bankroll-input" class="form-input"
            value="${bankroll || ''}" placeholder="ex: 1000" min="0" />
        </div>
        <div class="form-group">
          <label class="form-label">% mise par trade</label>
          <input type="number" id="mise-pct-input" class="form-input"
            value="${localStorage.getItem('fhg_mise_pct') || 2.5}"
            placeholder="ex: 2.5" min="0.5" max="10" step="0.5" />
        </div>
        <div class="form-group">
          <label class="form-label">Cote cible</label>
          <input type="number" id="cote-cible-input" class="form-input"
            value="${localStorage.getItem('fhg_cote_cible') || 2.3}"
            placeholder="ex: 2.30" min="1.1" step="0.1" />
        </div>
      </div>
      <button class="btn btn--primary mb-16" id="calc-bankroll-btn">📊 Calculer projection 30 jours</button>

      <div id="bankroll-result" class="hidden">
        <div class="projection-grid mb-16" id="projection-grid"></div>
        <div class="chart-wrapper" style="height:200px;">
          <canvas id="bankroll-chart"></canvas>
        </div>
      </div>
    </div>

    <!-- DANGER ZONE -->
    <div class="settings-block">
      <div class="settings-block__title" style="color:var(--color-danger);">🗑 Zone de danger</div>
      <div class="danger-box mb-16" style="font-size:12px;">
        ⚠ Ces actions sont irréversibles. Toutes vos données locales seront supprimées.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn--danger" id="clear-cache-btn">🗑 Vider le cache API</button>
        <button class="btn btn--danger" id="clear-all-btn">⚠ Réinitialiser toutes les données</button>
      </div>
    </div>
  `;
}

function renderLeaguesList(leagues = []) {
  const allAvail = [
    { id: 'bundesliga', name: 'Bundesliga', country: 'Allemagne', flag: '🇩🇪' },
    { id: 'premier-league', name: 'Premier League', country: 'Angleterre', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { id: 'ligue-1', name: 'Ligue 1', country: 'France', flag: '🇫🇷' },
    { id: 'eredivisie', name: 'Eredivisie', country: 'Pays-Bas', flag: '🇳🇱' },
    { id: 'championship', name: 'Championship', country: 'Angleterre', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { id: 'super-lig', name: 'Süper Lig', country: 'Turquie', flag: '🇹🇷' },
    { id: 'la-liga', name: 'La Liga', country: 'Espagne', flag: '🇪🇸' },
    { id: 'serie-a', name: 'Serie A', country: 'Italie', flag: '🇮🇹' },
    { id: 'liga-nos', name: 'Liga Portugal', country: 'Portugal', flag: '🇵🇹' },
    { id: 'eredivisie-b', name: 'Eerste Divisie', country: 'Pays-Bas', flag: '🇳🇱' },
  ];

  return allAvail.map(l => {
    const saved  = leagues.find(x => x.id === l.id);
    const active = saved ? saved.active : false;
    return `
      <div class="league-list-item" data-league-id="${l.id}"
        style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;
               background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid var(--color-border);">
        <div style="display:flex;align-items:center;gap:8px;">
          <span>${l.flag}</span>
          <div>
            <div style="font-size:13px;font-weight:500;">${l.name}</div>
            <div style="font-size:11px;color:var(--color-text-muted);">${l.country}</div>
          </div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" class="league-list-toggle"
            data-league="${l.id}"
            data-league-name="${l.name}"
            data-league-country="${l.country}"
            data-league-flag="${l.flag}"
            ${active ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  }).join('');
}

function renderJournalRows(trades) {
  return trades.slice().reverse().map(t => `
    <tr data-trade-row="${t.id}">
      <td>${t.date || '—'}</td>
      <td style="font-size:12px;max-width:160px;">${t.match || '—'}</td>
      <td style="font-size:11px;">${t.ligue || '—'}</td>
      <td>${t.fhgPct || '—'}</td>
      <td>${t.strategie === 'fhg_dc' ? 'FHG+DC' : 'FHG'}</td>
      <td>${t.badge1MT ? '<span class="badge badge--1mt">★</span>' : '—'}</td>
      <td>${{
        favorable:   '<span class="badge badge--h2h-vert">✓</span>',
        defavorable: '<span class="badge badge--h2h-orange">⚠</span>',
        insuffisant: '<span class="badge badge--h2h-gris">?</span>',
      }[t.h2h] || '—'}</td>
      <td>${t.cote || '—'}</td>
      <td>
        <select class="form-input" style="padding:3px 6px;font-size:11px;width:100px;"
          data-trade-result="${t.id}">
          <option value="non_joue" ${t.resultat === 'non_joue' ? 'selected' : ''}>Non joué</option>
          <option value="gagne"    ${t.resultat === 'gagne'    ? 'selected' : ''}>Gagné ✓</option>
          <option value="perdu"    ${t.resultat === 'perdu'    ? 'selected' : ''}>Perdu ✗</option>
        </select>
      </td>
      <td>
        <button class="btn btn--ghost btn--sm" data-delete-trade="${t.id}">🗑</button>
      </td>
    </tr>
  `).join('');
}

/**
 * Initialiser les événements de la page.
 */
export function initSettings(container) {
  if (!container) return;

  // ---- API ----
  document.getElementById('api-test-btn')?.addEventListener('click', async () => {
    const resultEl = document.getElementById('api-test-result');
    if (!resultEl) return;

    resultEl.innerHTML = '<div class="api-test-result" style="color:var(--color-text-muted);margin-top:8px;">⏳ Test en cours…</div>';
    const result = await testApiConnection();
    resultEl.innerHTML = `
      <div class="api-test-result ${result.success ? 'success' : 'error'}" style="margin-top:8px;">
        ${result.success ? '✓ ' + result.message : '✗ ' + result.error}
      </div>
    `;
  });

  // ---- Ligues ----
  document.getElementById('league-search')?.addEventListener('input', e => {
    const query = e.target.value.toLowerCase();
    container.querySelectorAll('.league-list-item').forEach(item => {
      const name = item.querySelector('[style*="font-size:13px"]')?.textContent?.toLowerCase() || '';
      item.style.display = name.includes(query) ? '' : 'none';
    });
  });

  container.querySelectorAll('.league-list-toggle').forEach(toggle => {
    toggle.addEventListener('change', () => {
      const id      = toggle.dataset.league;
      const leagues = [...(getState('leagues') || [])];
      const actives = leagues.filter(l => l.active).length;

      if (toggle.checked && actives >= 50) {
        toggle.checked = false;
        showToast('Limite de 50 ligues atteinte', 'warning');
        return;
      }

      const idx = leagues.findIndex(l => l.id === id);
      if (idx > -1) {
        leagues[idx] = { ...leagues[idx], active: toggle.checked };
      } else if (toggle.checked) {
        leagues.push({
          id,
          name:    toggle.dataset.leagueName,
          country: toggle.dataset.leagueCountry,
          flag:    toggle.dataset.leagueFlag,
          active:  true,
        });
      }

      saveLeagues(leagues);
      const counter = document.getElementById('leagues-counter');
      if (counter) counter.textContent = leagues.filter(l => l.active).length;
      showToast(toggle.checked ? `Ligue activée` : `Ligue désactivée`, 'info');
    });
  });

  // ---- Journal trades ----
  document.getElementById('journal-filter-result')?.addEventListener('change', e => {
    filterJournal(e.target.value, document.getElementById('journal-filter-ligue')?.value || '');
  });
  document.getElementById('journal-filter-ligue')?.addEventListener('change', e => {
    filterJournal(document.getElementById('journal-filter-result')?.value || '', e.target.value);
  });

  container.querySelectorAll('[data-trade-result]').forEach(sel => {
    sel.addEventListener('change', () => {
      updateTrade(parseInt(sel.dataset.tradeResult), { resultat: sel.value });
      showToast('Résultat mis à jour', 'success');
    });
  });

  container.querySelectorAll('[data-delete-trade]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Supprimer ce trade ?')) {
        deleteTrade(parseInt(btn.dataset.deleteTrade));
        btn.closest('tr')?.remove();
        showToast('Trade supprimé', 'info');
      }
    });
  });

  // ---- Export CSV ----
  document.getElementById('export-csv-btn')?.addEventListener('click', exportCSV);

  // ---- Bankroll ----
  document.getElementById('calc-bankroll-btn')?.addEventListener('click', calculerBankroll);

  // ---- Stats chart ----
  const stats = calcStatsTradesGlobal();
  if (stats && stats.total >= 5) {
    setTimeout(() => {
      const canvas = document.getElementById('winrate-chart');
      if (canvas) createWinRateChart(canvas, stats.gagnes, stats.total);
    }, 100);
  }

  // ---- Danger zone ----
  document.getElementById('clear-cache-btn')?.addEventListener('click', () => {
    import('../api/cache.js').then(({ cacheClear }) => {
      cacheClear();
      showToast('Cache API vidé', 'success');
    });
  });

  document.getElementById('clear-all-btn')?.addEventListener('click', () => {
    if (confirm('Réinitialiser TOUTES les données ? Cette action est irréversible.')) {
      clearAllData();
    }
  });
}

function filterJournal(result, ligue) {
  const trades = getState('trades') || [];
  const filtered = trades.filter(t => {
    if (result && t.resultat !== result) return false;
    if (ligue && t.ligue !== ligue) return false;
    return true;
  });
  const tbody = document.getElementById('journal-tbody');
  if (tbody) tbody.innerHTML = renderJournalRows(filtered);
}

function exportCSV() {
  const trades = getState('trades') || [];
  if (trades.length === 0) {
    showToast('Aucun trade à exporter', 'warning');
    return;
  }

  const headers = ['Date','Match','Ligue','FHG%','Stratégie','Badge1MT','H2H','Cote','Résultat','Analyse'];
  const rows    = trades.map(t => [
    t.date || '', t.match || '', t.ligue || '', t.fhgPct || '',
    t.strategie || '', t.badge1MT ? 'OUI' : 'NON', t.h2h || '',
    t.cote || '', t.resultat || '', (t.analyse || '').replace(/"/g, '""'),
  ]);

  const csv  = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `fhg-trades-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Export CSV téléchargé ✓', 'success');
}

function calculerBankroll() {
  const bankroll  = parseFloat(document.getElementById('bankroll-input')?.value) || 0;
  const misePct   = parseFloat(document.getElementById('mise-pct-input')?.value) || 2.5;
  const coteCible = parseFloat(document.getElementById('cote-cible-input')?.value) || 2.3;

  if (bankroll <= 0) {
    showToast('Entrez une bankroll valide', 'warning');
    return;
  }

  localStorage.setItem('fhg_bankroll', bankroll);
  localStorage.setItem('fhg_mise_pct', misePct);
  localStorage.setItem('fhg_cote_cible', coteCible);

  // 3 scénarios
  const scenarios = [
    { label: '30 paris/mois, cote 2.30, 50% réussite', cote: 2.30, taux: 0.50, nb: 30 },
    { label: '30 paris/mois, cote 2.50, 65% réussite', cote: 2.50, taux: 0.65, nb: 30 },
    { label: `Mise fixe ${Math.round(bankroll * misePct / 100)}€, cote ${coteCible}, 65%`, cote: coteCible, taux: 0.65, nb: 30 },
  ];

  const grid = document.getElementById('projection-grid');
  if (grid) {
    grid.innerHTML = scenarios.map(s => {
      const miseUnitaire = s.label.includes('Mise fixe')
        ? bankroll * misePct / 100
        : bankroll * misePct / 100;
      const gain = miseUnitaire * s.cote * s.taux * s.nb - miseUnitaire * s.nb;
      const roi  = ((gain / (miseUnitaire * s.nb)) * 100).toFixed(1);
      return `
        <div class="projection-card">
          <div class="projection-card__title">${s.label}</div>
          <div class="projection-card__result" style="color:${gain >= 0 ? 'var(--color-accent-green)' : 'var(--color-danger)'};">
            ${gain >= 0 ? '+' : ''}${gain.toFixed(0)}€
          </div>
          <div class="projection-card__detail">ROI : ${roi}% · ${s.nb} paris/mois</div>
        </div>
      `;
    }).join('');
  }

  // Graphique projection sur 30 jours
  const labels = Array.from({ length: 31 }, (_, i) => `J${i}`);
  const miseU  = bankroll * misePct / 100;
  const gains  = labels.map((_, i) => {
    const nbJours = i;
    const parisJour = 1;
    return bankroll + (miseU * coteCible * 0.65 - miseU) * nbJours * parisJour;
  });

  document.getElementById('bankroll-result')?.classList.remove('hidden');
  setTimeout(() => {
    const canvas = document.getElementById('bankroll-chart');
    if (canvas) createBankrollChart(canvas, gains, labels);
  }, 100);
}
