/**
 * matches.js — Page "Matchs à venir"
 */

import store from '../store/store.js';
import { filtrerMatchs, trierParScore, categoriserMatchs } from '../core/filters.js';
import { renderMatchTableRow, renderExcludedCard } from '../components/matchCard.js';

let currentFiltres = {
  dateRange: 'today',
  ligue: 'all',
  signalMin: 0,
  contexte: 'all',
  seulement1MT: false,
  afficherExclus: false,
};

export function renderMatches() {
  const page = document.getElementById('page-matches');
  if (!page) return;

  page.innerHTML = buildMatchesHTML();

  initFilters();
  renderMatchesTable();
}

function buildMatchesHTML() {
  const leagues = store.get('activeLeagues') || [];
  const leagueOptions = leagues.map(l =>
    `<option value="${l.id}">${l.name}</option>`
  ).join('');

  return `
    <div class="page-header">
      <div>
        <div class="page-title">Matchs à venir</div>
        <div class="page-subtitle">Analyse FHG de tous les matchs programmés</div>
      </div>
    </div>

    <!-- Filtres -->
    <div class="filter-bar mb-16">
      <span class="filter-label">Plage :</span>
      <button class="filter-btn active" data-filter="dateRange" data-value="today">Aujourd'hui</button>
      <button class="filter-btn" data-filter="dateRange" data-value="j1">J+1</button>
      <button class="filter-btn" data-filter="dateRange" data-value="j2">J+2</button>
      <button class="filter-btn" data-filter="dateRange" data-value="j3">J+3</button>

      <div class="filter-separator"></div>

      <span class="filter-label">Ligue :</span>
      <select class="form-select" id="filter-ligue" style="width:auto;padding:5px 28px 5px 10px;">
        <option value="all">Toutes</option>
        ${leagueOptions}
      </select>

      <div class="filter-separator"></div>

      <span class="filter-label">Signal :</span>
      <button class="filter-btn active" data-filter="signalMin" data-value="0">Tous</button>
      <button class="filter-btn" data-filter="signalMin" data-value="60">&gt;60%</button>
      <button class="filter-btn" data-filter="signalMin" data-value="70">&gt;70%</button>
      <button class="filter-btn" data-filter="signalMin" data-value="75">&gt;75%</button>

      <div class="filter-separator"></div>

      <span class="filter-label">Contexte :</span>
      <button class="filter-btn active" data-filter="contexte" data-value="all">Tous</button>
      <button class="filter-btn" data-filter="contexte" data-value="dom">Domicile</button>
      <button class="filter-btn" data-filter="contexte" data-value="ext">Extérieur</button>
    </div>

    <!-- Toggles -->
    <div style="display:flex; gap:16px; margin-bottom:20px; flex-wrap:wrap;">
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; color:var(--color-text-secondary);">
        <div class="toggle-switch" style="width:36px;height:20px;">
          <input type="checkbox" id="toggle-1mt" />
          <span class="toggle-slider"></span>
        </div>
        <span>★ 1MT 50%+ uniquement</span>
      </label>
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; color:var(--color-text-secondary);">
        <div class="toggle-switch" style="width:36px;height:20px;">
          <input type="checkbox" id="toggle-exclus" />
          <span class="toggle-slider"></span>
        </div>
        <span>Afficher matchs exclus</span>
      </label>
    </div>

    <!-- Tableau -->
    <div class="table-container">
      <table class="data-table" id="matches-table">
        <thead>
          <tr>
            <th>Heure</th>
            <th>Match</th>
            <th>Ligue</th>
            <th>FHG% N</th>
            <th>Forme 5M</th>
            <th>1MT 50%+</th>
            <th>H2H</th>
            <th>DC%</th>
            <th>Score</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="matches-tbody">
          <tr>
            <td colspan="10">
              <div class="loading-state">
                <div class="loading-spinner"></div>
                <span>Chargement des matchs...</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Section exclus (si toggle actif) -->
    <div id="exclus-section" style="display:none; margin-top:24px;">
      <div class="section-header">
        <div>
          <div class="section-title" style="color:var(--color-danger);">🚫 Matchs exclus par le filtre H2H</div>
          <div class="section-subtitle">Non interactifs — Informatif uniquement</div>
        </div>
      </div>
      <div id="exclus-cards" class="match-cards-grid"></div>
    </div>
  `;
}

function initFilters() {
  // Boutons de filtre
  document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const filterName = btn.dataset.filter;
      const value = btn.dataset.value;

      // Désactiver les autres boutons du même groupe
      document.querySelectorAll(`.filter-btn[data-filter="${filterName}"]`).forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');

      currentFiltres[filterName] = filterName === 'signalMin' ? parseInt(value) : value;
      renderMatchesTable();
    });
  });

  // Select ligue
  document.getElementById('filter-ligue')?.addEventListener('change', e => {
    currentFiltres.ligue = e.target.value;
    renderMatchesTable();
  });

  // Toggle 1MT
  document.getElementById('toggle-1mt')?.addEventListener('change', e => {
    currentFiltres.seulement1MT = e.target.checked;
    renderMatchesTable();
  });

  // Toggle exclus
  document.getElementById('toggle-exclus')?.addEventListener('change', e => {
    currentFiltres.afficherExclus = e.target.checked;
    const exclusSection = document.getElementById('exclus-section');
    if (exclusSection) exclusSection.style.display = e.target.checked ? 'block' : 'none';
    renderMatchesTable();
  });
}

function renderMatchesTable() {
  const tbody = document.getElementById('matches-tbody');
  if (!tbody) return;

  const allMatches = store.get('matches') || [];
  const filtered = filtrerMatchs(allMatches, currentFiltres);
  const sorted = trierParScore(filtered.filter(m => !m.resultatFHG?.exclu));

  tbody.innerHTML = '';

  if (!sorted.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="empty-state" style="padding:32px;">
            <div class="empty-state-icon">⚽</div>
            <div class="empty-state-title">Aucun match correspondant aux filtres</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  sorted.forEach(m => {
    const row = renderMatchTableRow(m);
    tbody.appendChild(row);
  });

  // Rendre les exclus si toggle actif
  if (currentFiltres.afficherExclus) {
    renderExclusCards(allMatches.filter(m => m.resultatFHG?.exclu));
  }
}

function renderExclusCards(exclusMatches) {
  const container = document.getElementById('exclus-cards');
  if (!container) return;

  container.innerHTML = '';
  exclusMatches.forEach(m => {
    const card = renderExcludedCard(m);
    if (card) container.appendChild(card);
  });
}
