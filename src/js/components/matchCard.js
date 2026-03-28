/* ================================================
   matchCard.js — Carte match réutilisable
   FHG Tracker
   ================================================ */

import { createGoalDistChart, createCircleSVG } from './charts.js';
import { formaterH2HTimeline, getBadgeH2H } from '../core/h2h.js';
import { getTimerConseille } from '../core/scoring.js';
import { getState } from '../store/store.js';

// ============================================================
// RENDU DE LA CARTE MATCH (résumé)
// ============================================================

/**
 * Générer le HTML d'une carte match.
 *
 * @param {Object} matchAnalyse   — résultat de analyserMatch()
 * @param {Object} options        — { showExcluded, compact }
 * @returns {string}              — HTML de la carte
 */
export function renderMatchCard(matchAnalyse, options = {}) {
  const m  = matchAnalyse;
  const sc = m.scoreChoisi || {};

  if (m.exclu) {
    return renderExcludedCard(m);
  }

  const signalBadge   = renderSignalBadge(sc.signal);
  const h2hBadge      = renderH2HBadge(sc);
  const badge1MT      = sc.badge1MT50 ? `<span class="badge badge--1mt">★ 1MT 50%+</span>` : '';
  const debutBadge    = sc.debutSaison ? `<span class="badge badge--debut-saison">⚠ Début saison</span>` : '';
  const tropBeauAlert = sc.tropBeau
    ? `<div class="warning-box" style="margin:0 16px 10px;font-size:11px;">
         ⚠ FHG très élevé (${sc.tauxN}%) — Vérifier que l'adversaire encaisse aussi en 1MT
       </div>` : '';

  const fhgColor = sc.tauxN >= 75 ? 'green' : sc.tauxN >= 60 ? 'orange' : 'grey';
  const h2hBadgeHTML = h2hBadge
    ? `<span class="badge ${h2hBadge.classe}">${h2hBadge.icon} ${h2hBadge.label}</span>` : '';

  const warningClass = sc.warningH2H === 'orange' ? 'match-card--warning' : '';
  const scoreClass   = sc.signal === 'fort' ? 'green' : sc.signal === 'moyen' ? 'orange' : 'grey';

  return `
    <div class="match-card ${warningClass}" data-match-id="${m.id}">
      <div class="match-card__header">
        <div class="match-card__teams">
          <div class="match-card__time">⏰ ${m.time || '—'}</div>
          <div class="match-card__teams-names">
            ${m.homeName} <span style="color:var(--color-text-muted);font-weight:400">vs</span> ${m.awayName}
          </div>
          <div class="match-card__league">${m.leagueFlag || ''} ${m.leagueName || ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          ${signalBadge}
          <span class="match-card__context">${m.context || 'DOM'}</span>
        </div>
      </div>

      <div class="match-card__badges">
        ${badge1MT}
        ${h2hBadgeHTML}
        ${debutBadge}
        ${renderWindowBadge(m.time)}
      </div>

      ${tropBeauAlert}

      <div class="match-card__stats">
        <!-- FHG Saison N -->
        <div class="stat-row">
          <span class="stat-row__label">FHG 31-45min (saison)</span>
          <div class="stat-row__bar">
            <div class="progress-bar">
              <div class="progress-bar__fill progress-bar__fill--${fhgColor}"
                style="width:${Math.min(sc.tauxN || 0, 100)}%"></div>
            </div>
          </div>
          <span class="stat-row__value ${fhgColor}">${sc.tauxN || 0}%</span>
        </div>
        <!-- FHG 5 derniers matchs -->
        <div class="stat-row">
          <span class="stat-row__label">FHG 5 derniers matchs</span>
          <div class="stat-row__bar">
            <div class="progress-bar">
              <div class="progress-bar__fill progress-bar__fill--${sc.forme5M >= 60 ? 'green':'orange'}"
                style="width:${Math.min(sc.forme5M || 0, 100)}%"></div>
            </div>
          </div>
          <span class="stat-row__value ${sc.forme5M >= 60 ? 'green':'orange'}">
            ${Math.round((sc.forme5M || 0) / 20)}/5
          </span>
        </div>
      </div>

      <div class="match-card__footer">
        <div class="match-card__score-global">
          <span class="score-number ${scoreClass}">${sc.score || 0}</span>
          <span class="score-label">pts</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${m.scoreDC ? `<span class="badge badge--h2h-gris">DC: ${m.scoreDC}pts</span>` : ''}
          <button class="btn btn--ghost btn--sm" data-expand="${m.id}">
            Analyse ▾
          </button>
        </div>
      </div>

      <!-- Détail dépliable -->
      <div class="match-card__detail" id="detail-${m.id}">
        ${renderMatchDetail(m)}
      </div>
    </div>
  `;
}

// ============================================================
// CARTE MATCH EXCLU
// ============================================================

export function renderExcludedCard(m) {
  return `
    <div class="match-card match-card--exclu" data-match-id="${m.id}" style="opacity:0.55;">
      <div class="match-card__header">
        <div class="match-card__teams">
          <div class="match-card__time">⏰ ${m.time || '—'}</div>
          <div class="match-card__teams-names">
            ${m.homeName} vs ${m.awayName}
          </div>
          <div class="match-card__league">${m.leagueFlag || ''} ${m.leagueName || ''}</div>
        </div>
        <span class="badge badge--exclu">✗ EXCLU</span>
      </div>
      <div style="padding:0 16px 14px;">
        <div class="danger-box">
          <span>🚫</span>
          <span>${m.raisonExclusion || 'Clean Sheet H2H'}</span>
        </div>
        <p style="font-size:11px;color:var(--color-text-muted);margin-top:8px;font-style:italic;">
          La récurrence H2H prime sur tout — aucune exception.
        </p>
      </div>
    </div>
  `;
}

// ============================================================
// DÉTAIL MATCH (carte dépliée)
// ============================================================

function renderMatchDetail(m) {
  const sc      = m.scoreChoisi || {};
  const config  = getState('config') || {};
  const timer   = getTimerConseille(config.profil || 'intermediaire');
  const h2hData = m.h2h || [];
  const h2hTimeline = formaterH2HTimeline(h2hData, m.equipeSignal);

  return `
    <!-- Distribution buts -->
    <div class="detail-section">
      <div class="detail-section__title">📊 Distribution des buts par tranche</div>
      <div class="chart-wrapper" style="height:160px;">
        <canvas id="chart-dist-${m.id}"></canvas>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <!-- Cercle 1MT -->
      <div class="detail-section">
        <div class="detail-section__title">🎯 Matchs avec but en 1MT</div>
        <div class="circle-progress">
          <div id="circle-${m.id}">
            ${createCircleSVG(sc.pct1MT || 0)}
          </div>
          <div class="circle-progress__label">
            ${sc.badge1MT50
              ? '<span class="badge badge--1mt">★ 1MT 50%+</span>'
              : `<span style="color:var(--color-text-muted);font-size:11px;">${sc.pct1MT || 0}% des matchs</span>`
            }
          </div>
        </div>
      </div>

      <!-- DC -->
      <div class="detail-section">
        <div class="detail-section__title">🔄 Indicateur DC</div>
        ${m.scoreDC
          ? `<div class="dc-indicator">
               <div>
                 <div class="dc-indicator__label">Score DC</div>
                 <div class="dc-indicator__value">${m.scoreDC} pts</div>
               </div>
               <div>
                 <div class="dc-indicator__label">Retour si encaisse</div>
                 <div style="font-size:14px;font-weight:600;color:var(--color-accent-blue);">
                   ${m.teamData?.pct_retour_si_encaisse || '—'}%
                 </div>
               </div>
             </div>
             <div class="info-box" style="margin-top:8px;font-size:11px;">
               ℹ DC possible — à confirmer si le favori est mené
             </div>`
          : `<div class="warning-box" style="font-size:11px;">
               DC non recommandée (FHG insuffisant ou règle non respectée)
             </div>`
        }
      </div>
    </div>

    <!-- H2H Timeline -->
    <div class="detail-section">
      <div class="detail-section__title">⚔ H2H — 5 dernières confrontations</div>
      ${h2hTimeline.length > 0
        ? `
          <div class="h2h-timeline">
            ${h2hTimeline.map(h => `
              <div class="h2h-item">
                <span class="h2h-item__date">${h.date}</span>
                <span class="h2h-item__score">${h.score} <span style="color:var(--color-text-muted);font-size:11px;">(${h.htScore})</span></span>
                <span class="h2h-item__result">${h.butMT ? '✅' : '❌'}</span>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:12px;color:var(--color-text-muted);">
              ${sc.butsH2H1MT || 0}/${sc.nbH2H || 0} confrontations avec but en 1MT
            </span>
            ${getBadgeHTML(sc.warningH2H)}
          </div>
        `
        : `<p style="color:var(--color-text-muted);font-size:13px;">Aucun H2H disponible</p>`
      }
    </div>

    <!-- Timer conseillé -->
    <div class="detail-section">
      <div class="detail-section__title">⏱ Timer conseillé</div>
      <div class="timer-badge">
        🎯 ${timer.label}
      </div>
    </div>

    <!-- Checklist -->
    <div class="detail-section">
      <div class="detail-section__title">✅ Checklist pré-match</div>
      <div class="checklist">
        <label class="checklist-item">
          <input type="checkbox" ${sc.tauxN >= 75 ? 'checked' : ''}/>
          <span>Récurrence FHG 31-45min confirmée (>75%)</span>
        </label>
        <label class="checklist-item">
          <input type="checkbox" ${sc.forme5M >= 60 ? 'checked' : ''}/>
          <span>Forme récente cohérente (5 derniers matchs)</span>
        </label>
        <label class="checklist-item">
          <input type="checkbox" ${sc.warningH2H === 'vert' ? 'checked' : ''}/>
          <span>H2H Clean Sheet vérifié (filtre appliqué)</span>
        </label>
        <label class="checklist-item">
          <input type="checkbox" ${sc.badge1MT50 ? 'checked' : ''}/>
          <span>Badge 1MT 50%+ présent ? (bonus)</span>
        </label>
        <label class="checklist-item">
          <input type="checkbox"/>
          <span>Contexte DOM/EXT vérifié</span>
        </label>
        <label class="checklist-item">
          <input type="checkbox"/>
          <span>Objectif de cote fixé</span>
        </label>
        <label class="checklist-item">
          <input type="checkbox" ${!!m.scoreDC ? 'checked' : ''}/>
          <span>DC analysée</span>
        </label>
      </div>
    </div>

    <!-- Fiche rapide -->
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--color-border);">
      <button class="btn btn--primary btn--full" data-fiche="${m.id}">
        📋 Fiche rapide trade
      </button>
    </div>
  `;
}

// ============================================================
// BADGES HELPERS
// ============================================================

function renderSignalBadge(signal) {
  const map = {
    fort:   { cls: 'badge--fort',   label: '🔥 FORT' },
    moyen:  { cls: 'badge--moyen',  label: '⚡ MOYEN' },
    faible: { cls: 'badge--faible', label: '○ FAIBLE' },
  };
  const b = map[signal] || map.faible;
  return `<span class="badge ${b.cls}">${b.label}</span>`;
}

function renderH2HBadge(sc) {
  return getBadgeH2H({ couleur: sc.warningH2H, butsEnPremiereMT: sc.butsH2H1MT, nbH2H: sc.nbH2H });
}

function renderWindowBadge(time) {
  if (!time) return '';
  const now = new Date();
  const [h, m] = time.split(':').map(Number);
  const start = new Date();
  start.setHours(h, m, 0, 0);
  const elapsed = Math.floor((now - start) / 60000);
  if (elapsed >= 30 && elapsed <= 45) {
    return `<span class="badge badge--window-open">🟢 FENÊTRE OUVERTE</span>`;
  }
  return '';
}

function getBadgeHTML(warningH2H) {
  const map = {
    vert:        `<span class="badge badge--h2h-vert">H2H FAVORABLE</span>`,
    orange:      `<span class="badge badge--h2h-orange">H2H DÉFAVORABLE ⚠</span>`,
    insuffisant: `<span class="badge badge--h2h-gris">H2H INSUFFISANT</span>`,
    rouge:       `<span class="badge badge--exclu">H2H EXCLU</span>`,
  };
  return map[warningH2H] || map.insuffisant;
}

// ============================================================
// EVENTS DYNAMIQUES
// ============================================================

/**
 * Attacher les événements sur les cartes match rendues.
 * À appeler après avoir injecté le HTML dans le DOM.
 */
export function attachMatchCardEvents(container) {
  if (!container) return;

  // Boutons "Analyse ▾" — dépliage
  container.querySelectorAll('[data-expand]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id     = btn.dataset.expand;
      const detail = document.getElementById(`detail-${id}`);
      if (!detail) return;

      const isOpen = detail.classList.toggle('open');
      btn.textContent = isOpen ? 'Analyse ▴' : 'Analyse ▾';

      if (isOpen) {
        // Initialiser le graphique Chart.js après ouverture
        setTimeout(() => {
          const canvas = document.getElementById(`chart-dist-${id}`);
          if (canvas) {
            // Trouver les données du match
            const match = findMatchInStore(id);
            if (match?.teamData?.dist_buts) {
              import('./charts.js').then(({ createGoalDistChart }) => {
                createGoalDistChart(canvas, match.teamData.dist_buts);
              });
            }
          }
        }, 100);
      }
    });
  });

  // Boutons "Fiche rapide"
  container.querySelectorAll('[data-fiche]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id    = btn.dataset.fiche;
      const match = findMatchInStore(id);
      if (match) {
        import('./modal.js').then(({ openFicheTradeModal }) => {
          openFicheTradeModal(match);
        });
      }
    });
  });
}

/**
 * Retrouver un match analysé depuis le store.
 */
function findMatchInStore(id) {
  const { signaux, exclus } = getState();
  const all = [...(signaux || []), ...(exclus || [])];
  return all.find(m => String(m.id) === String(id)) || null;
}

// ============================================================
// TOAST (exporté pour réutilisation)
// ============================================================

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}
