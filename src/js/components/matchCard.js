/**
 * matchCard.js — Carte match réutilisable
 */

import { getProgressColor, getSignalInfo, getTimerConseille } from '../core/scoring.js';
import { formatterH2H, renderH2HTimeline, getH2HIcone } from '../core/h2h.js';
import { renderSVGProgressCircle } from './charts.js';
import { openTradeModal } from './modal.js';
import store from '../store/store.js';

/**
 * Rendre une carte match complète (avec détails dépliables)
 * @param {Object} matchData - données du match enrichies
 * @param {Object} options
 * @returns {HTMLElement}
 */
export function renderMatchCard(matchData, options = {}) {
  const { compact = false, showExpand = true } = options;
  const { resultatFHG, home, away, league, matchTime, isHome, h2hList = [] } = matchData;

  if (!resultatFHG) return null;

  const card = document.createElement('div');
  const signal = getSignalInfo(resultatFHG.score);
  const warningH2H = resultatFHG.warningH2H;
  const h2hIcone = getH2HIcone(warningH2H);

  // Classes de la carte
  let cardClass = 'match-card';
  if (warningH2H === 'orange') cardClass += ' warning-h2h';
  if (resultatFHG.score >= 75) cardClass += ' signal-fort';

  // Badge fenêtre active
  const fenetreActive = matchData.minuteActuelle
    ? (matchData.minuteActuelle >= 31 && matchData.minuteActuelle <= 45)
    : false;

  // Timer selon profil
  const config = store.get('alertsConfig');
  const timer = getTimerConseille(config.profil);

  card.className = cardClass;
  card.innerHTML = buildCardHTML(matchData, signal, h2hIcone, fenetreActive, compact, showExpand);

  // Détails (expandables)
  if (showExpand) {
    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'match-card-details';
    detailsDiv.innerHTML = buildDetailsHTML(matchData, h2hList, timer);
    card.appendChild(detailsDiv);

    // Bouton expand
    card.querySelector('.btn-expand')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const expanded = card.classList.toggle('expanded');
      if (expanded) initCharts(card, matchData);
    });

    // Bouton fiche rapide
    card.querySelector('.btn-trade')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openTradeModal(matchData);
    });
  }

  return card;
}

function buildCardHTML(matchData, signal, h2hIcone, fenetreActive, compact, showExpand) {
  const { resultatFHG, home, away, league, matchTime, isHome } = matchData;

  const contexteBadge = isHome
    ? '<span class="context-dom">DOM</span>'
    : '<span class="context-ext">EXT</span>';

  const badgeSignal = `<span class="badge ${signal.colorClass}">${signal.label}</span>`;

  const badge1MT = resultatFHG.badge1MT50
    ? '<span class="badge badge-violet">★ 1MT 50%+</span>'
    : '';

  const fenetreHtml = fenetreActive
    ? '<span class="badge-window-active">FENÊTRE OUVERTE</span>'
    : '';

  const warningTropBeau = resultatFHG.warningTropBeau
    ? '<span class="badge badge-orange" title="Vérifier que l\'adversaire encaisse aussi en 1MT">⚠ Piège possible</span>'
    : '';

  const debutSaisonBadge = resultatFHG.debutSaison
    ? '<span class="badge badge-orange">⚠ Début saison</span>'
    : '';

  const progressColor = getProgressColor(resultatFHG.tauxN);
  const scoreClass = signal.class;

  return `
    <div class="match-card-header">
      <div style="display:flex; flex-direction:column; gap:6px; flex:1; min-width:0;">
        <div class="match-meta">
          <span class="match-time">${matchTime || '--:--'}</span>
          <span class="match-league">${league || ''}</span>
          ${contexteBadge}
          ${fenetreHtml}
        </div>
        <div class="match-teams">
          <span class="match-team-home">${home}</span>
          <span class="match-team-vs">vs</span>
          <span class="match-team-away">${away}</span>
        </div>
      </div>
      <div class="match-badges">
        ${badgeSignal}
        ${badge1MT}
        ${warningTropBeau}
        ${debutSaisonBadge}
      </div>
    </div>

    <div class="match-card-body">
      <div class="match-stat">
        <div class="match-stat-label">FHG% saison</div>
        <div class="match-stat-value" style="color: var(--color-${progressColor === 'green' ? 'accent-green' : progressColor === 'orange' ? 'warning-orange' : 'text-muted'})">
          ${resultatFHG.tauxN}%
        </div>
        <div class="match-stat-bar">
          <div class="progress-bar">
            <div class="progress-fill ${progressColor}" style="width:${Math.min(resultatFHG.tauxN, 100)}%"></div>
          </div>
        </div>
      </div>

      <div class="match-stat">
        <div class="match-stat-label">Forme 5M</div>
        <div class="match-stat-value">${Math.round((resultatFHG.forme5M / 100) * 5)}/5</div>
        <div class="match-stat-bar">
          <div class="progress-bar">
            <div class="progress-fill ${getProgressColor(resultatFHG.forme5M)}" style="width:${resultatFHG.forme5M}%"></div>
          </div>
        </div>
      </div>

      <div class="match-stat">
        <div class="match-stat-label">H2H 1MT</div>
        <div class="match-stat-value ${resultatFHG.warningH2H === 'vert' ? 'text-green' : resultatFHG.warningH2H === 'orange' ? 'text-orange' : 'text-muted'}">
          ${getH2HDisplay(resultatFHG.warningH2H, matchData.h2hList)}
        </div>
      </div>

      ${resultatFHG.warningH2H === 'orange' ? `
        <div class="warning-box orange" style="flex:1; min-width:180px;">
          ⚠ 1 seul but en 1MT sur les H2H — Score pénalisé (-8pts)
        </div>
      ` : ''}

      <div class="match-score-global">
        <div class="score-circle ${scoreClass}">${resultatFHG.score}</div>
        <div class="score-label">Score</div>
      </div>
    </div>

    ${showExpand ? `
      <div class="match-card-footer">
        <button class="btn-expand">
          Analyse complète <span class="arrow">▼</span>
        </button>
        <button class="btn btn-sm btn-secondary btn-trade">📋 Fiche trade</button>
      </div>
    ` : ''}
  `;
}

function getH2HDisplay(warningH2H, h2hList = []) {
  const total = h2hList.length;
  if (!total) return '?';
  if (warningH2H === 'vert') {
    const buts = h2hList.filter(h => h.equipe_ciblee_but_avant_45min).length;
    return `${buts}/${total} ✓`;
  }
  if (warningH2H === 'orange') return `1/${total} ⚠`;
  if (warningH2H === 'insuffisant') return `? (${total})`;
  return '?';
}

function buildDetailsHTML(matchData, h2hList, timer) {
  const { resultatFHG, home, away } = matchData;
  const h2hFormatted = formatterH2H(h2hList, home);
  const h2hHtml = renderH2HTimeline(h2hFormatted);

  // Données distribution buts
  const goalData = matchData.goalDistribution || {
    '0-15': Math.round(resultatFHG.tauxN * 0.15),
    '16-30': Math.round(resultatFHG.tauxN * 0.20),
    '31-45': Math.round(resultatFHG.tauxN * 0.40),
    '46-60': Math.round(resultatFHG.tauxN * 0.10),
    '61-75': Math.round(resultatFHG.tauxN * 0.08),
    '76-90': Math.round(resultatFHG.tauxN * 0.07),
  };

  const svgProgress = renderSVGProgressCircle(
    resultatFHG.pct1MT,
    null,
    `${resultatFHG.pct1MT}%`,
    'Matchs avec but en 1MT'
  );

  const dcInfo = matchData.resultatDC;
  const dcHtml = dcInfo
    ? `
      <div class="dc-indicator">
        <div class="dc-label">% Retour si encaisse</div>
        <div class="dc-value">${dcInfo.pctRetour}%</div>
        <div class="dc-context ${dcInfo.contexteDC ? 'yes' : 'no'}">
          ${dcInfo.contexteDC ? '✓ DC Possible' : '✗ DC Non conseillée'}
        </div>
      </div>
    `
    : `<div class="text-muted" style="font-size:12px;">DC non applicable (FHG < 60)</div>`;

  const cardId = `chart-${home}-${away}`.replace(/\s+/g, '-').toLowerCase();

  return `
    <div class="details-grid">
      <!-- Distribution buts -->
      <div class="details-section">
        <div class="details-section-title">Distribution buts par tranche</div>
        <div class="chart-container">
          <canvas id="${cardId}-dist"></canvas>
        </div>
      </div>

      <!-- 1MT Progress -->
      <div class="details-section">
        <div class="details-section-title">Buts en 1ère mi-temps (saison)</div>
        <div style="display:flex; justify-content:center; padding:12px 0;">
          ${svgProgress}
        </div>
        ${resultatFHG.badge1MT50
          ? '<div style="text-align:center; margin-top:6px;"><span class="badge badge-violet">★ 1MT 50%+ actif</span></div>'
          : ''}
      </div>

      <!-- H2H Timeline -->
      <div class="details-section">
        <div class="details-section-title">Historique H2H (5 derniers)</div>
        ${h2hHtml}
      </div>

      <!-- DC + Timer -->
      <div class="details-section">
        <div class="details-section-title">Double Chance</div>
        ${dcHtml}
        <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--color-border);">
          <div class="details-section-title" style="margin-bottom:8px;">Timer conseillé</div>
          <div class="timer-badge">⏱ ${timer.tranche} — Cote ${timer.cote}</div>
          <div style="font-size:11px; color:var(--color-text-muted); margin-top:6px;">${timer.description}</div>
        </div>
      </div>
    </div>

    <!-- Checklist pré-match -->
    <div class="details-section" style="margin-top:8px;">
      <div class="details-section-title">Checklist pré-match</div>
      <div class="checklist">
        <label class="checklist-item">
          <input type="checkbox" ${resultatFHG.tauxN >= 75 ? 'checked' : ''} />
          Récurrence FHG 31-45min confirmée (>75%) — Actuel : ${resultatFHG.tauxN}%
        </label>
        <label class="checklist-item">
          <input type="checkbox" ${resultatFHG.forme5M >= 60 ? 'checked' : ''} />
          Forme récente cohérente (5 derniers matchs) — ${Math.round((resultatFHG.forme5M / 100) * 5)}/5
        </label>
        <label class="checklist-item">
          <input type="checkbox" ${resultatFHG.warningH2H !== 'insuffisant' ? 'checked' : ''} />
          H2H Clean Sheet vérifié (filtre appliqué)
        </label>
        <label class="checklist-item">
          <input type="checkbox" ${resultatFHG.badge1MT50 ? 'checked' : ''} />
          Badge 1MT 50%+ présent ? (bonus) — ${resultatFHG.pct1MT}%
        </label>
        <label class="checklist-item">
          <input type="checkbox" />
          Contexte DOM/EXT vérifié
        </label>
        <label class="checklist-item">
          <input type="checkbox" />
          Objectif de cote fixé
        </label>
        <label class="checklist-item">
          <input type="checkbox" ${matchData.resultatDC?.contexteDC ? 'checked' : ''} />
          DC analysée
        </label>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; margin-top:12px;">
      <button class="btn btn-primary btn-trade">📋 Ouvrir fiche trade</button>
    </div>
  `;
}

/**
 * Initialiser les graphiques Chart.js dans une carte déployée
 * @param {HTMLElement} card
 * @param {Object} matchData
 */
function initCharts(card, matchData) {
  const { resultatFHG, home, away } = matchData;
  const cardId = `chart-${home}-${away}`.replace(/\s+/g, '-').toLowerCase();

  setTimeout(() => {
    const canvas = card.querySelector(`#${cardId}-dist`);
    if (!canvas || Chart.getChart(canvas)) return;

    const goalData = matchData.goalDistribution || {
      '0-15': Math.max(1, Math.round(resultatFHG.tauxN * 0.15)),
      '16-30': Math.max(1, Math.round(resultatFHG.tauxN * 0.20)),
      '31-45': Math.max(2, Math.round(resultatFHG.tauxN * 0.45)),
      '46-60': Math.max(0, Math.round(resultatFHG.tauxN * 0.10)),
      '61-75': Math.max(0, Math.round(resultatFHG.tauxN * 0.08)),
      '76-90': Math.max(0, Math.round(resultatFHG.tauxN * 0.07)),
    };

    import('./charts.js').then(({ createGoalDistributionChart }) => {
      createGoalDistributionChart(canvas, goalData, home);
    });
  }, 50);
}

/**
 * Rendre une carte match "exclu" (dans la section accordéon)
 */
export function renderExcludedCard(matchData) {
  const { home, away, league, matchTime, resultatFHG } = matchData;
  const div = document.createElement('div');
  div.className = 'match-card';
  div.style.opacity = '0.6';
  div.style.borderLeft = '3px solid var(--color-danger)';

  div.innerHTML = `
    <div class="match-card-header" style="padding-bottom:12px;">
      <div style="flex:1;">
        <div class="match-meta">
          <span class="match-time">${matchTime || '--:--'}</span>
          <span class="match-league">${league || ''}</span>
        </div>
        <div class="match-teams" style="margin-top:4px;">
          <span class="match-team-home">${home}</span>
          <span class="match-team-vs">vs</span>
          <span class="match-team-away">${away}</span>
        </div>
      </div>
      <span class="badge badge-danger">EXCLU</span>
    </div>
    <div style="padding:0 18px 14px;">
      <div class="warning-box red">
        <span>🚫</span>
        <span>${resultatFHG.raisonExclusion || 'Exclu par le filtre H2H'}</span>
      </div>
      <div style="font-size:11px; color:var(--color-text-muted); margin-top:8px; font-style:italic;">
        La récurrence H2H prime sur tout — Zéro exception.
      </div>
    </div>
  `;

  return div;
}

/**
 * Rendre une ligne de tableau pour la page "Matchs à venir"
 */
export function renderMatchTableRow(matchData) {
  const { resultatFHG, home, away, league, matchTime, isHome } = matchData;
  const signal = getSignalInfo(resultatFHG.score);
  const h2hIcone = getH2HIcone(resultatFHG.warningH2H);

  const tr = document.createElement('tr');
  if (matchData.resultatFHG?.exclu) tr.classList.add('excluded');

  tr.innerHTML = `
    <td class="font-medium">${matchTime || '--:--'}</td>
    <td>
      <div style="font-weight:600; font-size:13px;">${home} <span style="color:var(--color-text-muted);font-weight:400">vs</span> ${away}</div>
    </td>
    <td style="color:var(--color-text-muted); font-size:12px;">${league || ''}</td>
    <td>
      <span style="color:${getProgressColorVar(resultatFHG.tauxN)};font-weight:600;">${resultatFHG.tauxN}%</span>
    </td>
    <td>
      <span>${Math.round((resultatFHG.forme5M / 100) * 5)}/5</span>
    </td>
    <td>
      ${resultatFHG.badge1MT50
        ? '<span class="badge badge-violet" style="font-size:10px;">★</span>'
        : '<span style="color:var(--color-text-muted);">—</span>'}
    </td>
    <td>
      <span class="${h2hIcone.class}" title="${h2hIcone.title}" style="font-size:14px;">
        ${h2hIcone.icon}
      </span>
    </td>
    <td>
      ${matchData.resultatDC
        ? `<span style="font-size:12px;">${matchData.resultatDC.pctRetour}%</span>`
        : '<span style="color:var(--color-text-muted);">—</span>'}
    </td>
    <td>
      <div class="score-circle ${signal.class}" style="width:32px;height:32px;font-size:12px;">
        ${resultatFHG.score}
      </div>
    </td>
    <td>
      <button class="btn btn-sm btn-secondary" data-action="analyze">Analyser</button>
    </td>
  `;

  // Clic sur la ligne
  tr.addEventListener('click', () => {
    import('./modal.js').then(({ openMatchAnalysisModal }) => {
      import('./matchCard.js').then(({ renderMatchCard }) => {
        const card = renderMatchCard(matchData, { showExpand: false });
        openMatchAnalysisModal(card?.outerHTML || '', `${home} vs ${away}`);
      });
    });
  });

  return tr;
}

function getProgressColorVar(taux) {
  if (taux >= 75) return 'var(--color-accent-green)';
  if (taux >= 60) return 'var(--color-warning-orange)';
  return 'var(--color-text-muted)';
}
