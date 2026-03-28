/* ================================================
   matches.js — Page Matchs à venir
   FHG Tracker
   ================================================ */

import { getState } from '../store/store.js';
import { filtrerMatchsUpcoming } from '../core/filters.js';
import { renderMatchCard, renderExcludedCard, attachMatchCardEvents } from '../components/matchCard.js';
import { openModal } from '../components/modal.js';

// État local des filtres
let currentFilters = {
  plage:         'aujourd_hui',
  ligue:         'toutes',
  signalMin:     0,
  contexte:      'tous',
  seuil1MTOnly:  false,
  afficherExclus:false,
};

/**
 * Rendre la page Matchs à venir.
 */
export function renderMatches() {
  const { signaux, exclus, leagues } = getState();
  const allMatches = [...(signaux || []), ...(exclus || [])];
  const activeLeagues = (leagues || []).filter(l => l.active);

  // Options ligues
  const ligueOptions = activeLeagues.map(l =>
    `<option value="${l.id}" ${currentFilters.ligue === l.id ? 'selected' : ''}>
      ${l.flag} ${l.name}
    </option>`
  ).join('');

  const filtres = filtrerMatchsUpcoming(allMatches, currentFilters);
  const nonExclus = filtres.filter(m => !m.exclu);
  const exclusFiltres = currentFilters.afficherExclus ? filtres.filter(m => m.exclu) : [];

  return `
    <!-- FILTRES -->
    <div class="filters-bar">
      <!-- Plage -->
      <div class="filter-group">
        <span class="filter-group__label">Période :</span>
        ${['aujourd_hui','J+1','J+2','J+3'].map((p, i) => `
          <button class="filter-btn ${currentFilters.plage === p ? 'active' : ''}"
            data-filter="plage" data-value="${p}">
            ${['Aujourd\'hui','Demain','J+2','J+3'][i]}
          </button>
        `).join('')}
      </div>
      <!-- Ligue -->
      <div class="filter-group">
        <span class="filter-group__label">Ligue :</span>
        <select class="form-input" id="filter-ligue" style="padding:4px 8px;font-size:12px;min-width:140px;">
          <option value="toutes">Toutes</option>
          ${ligueOptions}
        </select>
      </div>
      <!-- Signal min -->
      <div class="filter-group">
        <span class="filter-group__label">Signal min :</span>
        ${[{v:0,l:'Tous'},{v:60,l:'>60%'},{v:70,l:'>70%'},{v:75,l:'>75%'}].map(x => `
          <button class="filter-btn ${currentFilters.signalMin === x.v ? 'active' : ''}"
            data-filter="signalMin" data-value="${x.v}">${x.l}</button>
        `).join('')}
      </div>
      <!-- Contexte -->
      <div class="filter-group">
        <span class="filter-group__label">Contexte :</span>
        ${[{v:'tous',l:'Tous'},{v:'domicile',l:'Dom.'},{v:'exterieur',l:'Ext.'}].map(x => `
          <button class="filter-btn ${currentFilters.contexte === x.v ? 'active' : ''}"
            data-filter="contexte" data-value="${x.v}">${x.l}</button>
        `).join('')}
      </div>
      <!-- Toggles -->
      <div class="filter-group" style="gap:12px;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--color-text-secondary);">
          <input type="checkbox" id="filter-1mt" ${currentFilters.seuil1MTOnly ? 'checked':''} />
          ★ 1MT 50%+ uniquement
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--color-text-secondary);">
          <input type="checkbox" id="filter-exclu" ${currentFilters.afficherExclus ? 'checked':''} />
          Afficher exclus
        </label>
      </div>
    </div>

    <!-- TABLEAU -->
    <div class="mb-24">
      ${nonExclus.length === 0
        ? `<div class="empty-state">
             <div class="empty-state__icon">🗓</div>
             <div class="empty-state__title">Aucun match trouvé</div>
             <div class="empty-state__desc">Modifiez les filtres ou vérifiez la configuration des ligues.</div>
           </div>`
        : `
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Heure</th>
                  <th>Match</th>
                  <th>Ligue</th>
                  <th>FHG% N</th>
                  <th>FHG 5M</th>
                  <th>1MT 50%+</th>
                  <th>H2H</th>
                  <th>DC</th>
                  <th>Score</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${nonExclus.map(m => renderMatchRow(m)).join('')}
              </tbody>
            </table>
          </div>
        `
      }
    </div>

    <!-- MATCHS EXCLUS (si toggle ON) -->
    ${exclusFiltres.length > 0 ? `
      <div class="mb-24">
        <div class="section-title" style="color:var(--color-danger);">
          🚫 Matchs exclus (filtre H2H)
        </div>
        <div class="danger-box mb-16" style="font-size:12px;">
          Ces matchs ne sont pas sélectionnables. La récurrence H2H prime sur tout score FHG.
        </div>
        <div class="matches-list">
          ${exclusFiltres.map(m => renderExcludedCard(m)).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

function renderMatchRow(m) {
  const sc = m.scoreChoisi || {};
  const h2hIcon = { vert:'✓', orange:'⚠', insuffisant:'?', rouge:'✗' };
  const h2hClass = { vert:'td-green', orange:'td-orange', insuffisant:'td-grey', rouge:'td-grey' };
  const warnRow = sc.warningH2H === 'orange' ? 'row--warning' : '';

  return `
    <tr class="${warnRow}" data-match-row="${m.id}" style="cursor:pointer;">
      <td>${m.time || '—'}</td>
      <td>
        <div style="font-weight:600;">${m.homeName} vs ${m.awayName}</div>
        ${sc.debutSaison ? '<span class="badge badge--debut-saison" style="font-size:10px;">⚠ Début saison</span>' : ''}
      </td>
      <td>${m.leagueFlag || ''} <span style="font-size:12px;color:var(--color-text-muted);">${m.leagueName || ''}</span></td>
      <td class="${sc.tauxN >= 75 ? 'td-green' : sc.tauxN >= 60 ? 'td-orange' : 'td-grey'}">${sc.tauxN || 0}%</td>
      <td>${Math.round((sc.forme5M || 0) / 20)}/5</td>
      <td class="${sc.badge1MT50 ? 'td-green' : 'td-grey'}">${sc.badge1MT50 ? '★' : '—'}</td>
      <td class="${h2hClass[sc.warningH2H] || 'td-grey'}">
        ${h2hIcon[sc.warningH2H] || '?'}
        <span style="font-size:11px;margin-left:2px;">${sc.butsH2H1MT !== undefined ? sc.butsH2H1MT + '/' + (sc.nbH2H || 0) : ''}</span>
      </td>
      <td class="${m.scoreDC ? 'td-green' : 'td-grey'}">${m.scoreDC ? m.scoreDC + 'pts' : '—'}</td>
      <td>
        <span class="badge ${sc.signal === 'fort' ? 'badge--fort' : sc.signal === 'moyen' ? 'badge--moyen' : 'badge--faible'}">
          ${sc.score || 0}
        </span>
      </td>
      <td>
        <button class="btn btn--ghost btn--sm" data-detail-row="${m.id}">Analyse</button>
      </td>
    </tr>
  `;
}

/**
 * Initialiser les événements de la page.
 */
export function initMatches(container) {
  if (!container) return;

  // Filtres boutons
  container.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key   = btn.dataset.filter;
      const value = btn.dataset.value;
      if (key === 'signalMin') {
        currentFilters[key] = parseInt(value);
      } else {
        currentFilters[key] = value;
      }
      refreshPage();
    });
  });

  // Filtre ligue select
  document.getElementById('filter-ligue')?.addEventListener('change', e => {
    currentFilters.ligue = e.target.value;
    refreshPage();
  });

  // Toggles
  document.getElementById('filter-1mt')?.addEventListener('change', e => {
    currentFilters.seuil1MTOnly = e.target.checked;
    refreshPage();
  });
  document.getElementById('filter-exclu')?.addEventListener('change', e => {
    currentFilters.afficherExclus = e.target.checked;
    refreshPage();
  });

  // Clic sur une ligne → modal analyse
  container.querySelectorAll('[data-detail-row]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.detailRow;
      openRowDetail(id);
    });
  });

  container.querySelectorAll('[data-match-row]').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.matchRow;
      openRowDetail(id);
    });
  });
}

function openRowDetail(id) {
  const { signaux, exclus } = getState();
  const all = [...(signaux || []), ...(exclus || [])];
  const match = all.find(m => String(m.id) === String(id));
  if (!match) return;

  openModal(
    `${match.homeName} vs ${match.awayName}`,
    renderMatchCard(match),
    {
      wide: true,
      onOpen: () => attachMatchCardEvents(document.getElementById('modal-body')),
    }
  );
}

function refreshPage() {
  // Déclencher un re-render via l'app
  import('../app.js').then(m => m.navigateTo?.('matches'));
}
