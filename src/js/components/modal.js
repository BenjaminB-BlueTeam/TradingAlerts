/**
 * modal.js — Modales et dépliants
 */

import store from '../store/store.js';

const overlay = () => document.getElementById('modal-overlay');
const container = () => document.getElementById('modal-container');

/**
 * Ouvrir une modale avec du contenu HTML
 * @param {string} title
 * @param {string} bodyHtml
 * @param {Object} options
 */
export function openModal(title, bodyHtml, options = {}) {
  const { onOpen, maxWidth = '640px', noPadding = false } = options;

  const c = container();
  if (!c) return;

  c.style.maxWidth = maxWidth;
  c.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${title}</div>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body" ${noPadding ? 'style="padding:0"' : ''}>
      ${bodyHtml}
    </div>
  `;

  overlay().style.display = 'flex';
  document.body.style.overflow = 'hidden';

  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
  overlay().addEventListener('click', e => {
    if (e.target === overlay()) closeModal();
  });

  document.addEventListener('keydown', handleEsc);

  if (onOpen) onOpen(c);
}

export function closeModal() {
  const o = overlay();
  if (o) o.style.display = 'none';
  document.body.style.overflow = '';
  document.removeEventListener('keydown', handleEsc);
}

function handleEsc(e) {
  if (e.key === 'Escape') closeModal();
}

/**
 * Ouvre la modale "Fiche rapide trade" pré-remplie
 * @param {Object} matchData
 */
export function openTradeModal(matchData) {
  const { home, away, league, matchTime, resultatFHG } = matchData;
  const score = resultatFHG?.score ?? '';
  const h2h = resultatFHG?.warningH2H ?? 'insuffisant';
  const badge1MT = resultatFHG?.badge1MT50 ? 'OUI' : 'NON';
  const today = new Date().toISOString().split('T')[0];

  const h2hSelect = `
    <option value="favorable" ${h2h === 'vert' ? 'selected' : ''}>Favorable</option>
    <option value="defavorable" ${h2h === 'orange' ? 'selected' : ''}>Défavorable</option>
    <option value="insuffisant" ${h2h === 'insuffisant' ? 'selected' : ''}>Insuffisant</option>
  `;

  openModal('📋 Fiche rapide trade', `
    <form id="trade-form" class="trade-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Date</label>
          <input type="date" class="form-input" name="date" value="${today}" />
        </div>
        <div class="form-group">
          <label class="form-label">Heure</label>
          <input type="text" class="form-input" name="heure" value="${matchTime || ''}" placeholder="20:45" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Match</label>
        <input type="text" class="form-input" name="match" value="${home} vs ${away}" readonly />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Ligue</label>
          <input type="text" class="form-input" name="ligue" value="${league || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Signal FHG%</label>
          <input type="number" class="form-input" name="signalFHG" value="${resultatFHG?.tauxN ?? ''}" min="0" max="100" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Stratégie</label>
          <select class="form-select" name="strategie">
            <option value="FHG">FHG seul</option>
            <option value="FHG+DC">FHG + DC</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Badge 1MT 50%+</label>
          <select class="form-select" name="badge1MT50">
            <option value="oui" ${badge1MT === 'OUI' ? 'selected' : ''}>OUI ★</option>
            <option value="non" ${badge1MT === 'NON' ? 'selected' : ''}>NON</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">H2H</label>
          <select class="form-select" name="h2h">${h2hSelect}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Timer prévu</label>
          <input type="text" class="form-input" name="timer" placeholder="ex: 25-35e min" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Cote objective</label>
          <input type="number" class="form-input" name="coteObjectif" step="0.01" min="1" placeholder="ex: 2.30" />
        </div>
        <div class="form-group">
          <label class="form-label">Mise (€)</label>
          <input type="number" class="form-input" name="mise" min="0" placeholder="ex: 25" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">DC possible ?</label>
        <select class="form-select" name="dcPossible">
          <option value="non">NON</option>
          <option value="oui">OUI</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">État d'esprit</label>
        <input type="text" class="form-input" name="etatEsprit" placeholder="Focalisé, neutre, fatigué..." />
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
        <textarea class="form-textarea" name="analysePost" placeholder="Notes libres sur le déroulement du match..."></textarea>
      </div>

      <div style="display:flex; gap:8px; margin-top:8px;">
        <button type="submit" class="btn btn-primary btn-full">💾 Enregistrer</button>
        <button type="button" class="btn btn-secondary" id="cancel-trade">Annuler</button>
      </div>
    </form>
  `);

  document.getElementById('cancel-trade')?.addEventListener('click', closeModal);
  document.getElementById('trade-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const trade = Object.fromEntries(fd.entries());
    trade.coteObjectif = parseFloat(trade.coteObjectif) || 0;
    trade.mise = parseFloat(trade.mise) || 0;
    trade.badge1MT50 = trade.badge1MT50 === 'oui';
    store.addTrade(trade);
    closeModal();
    showToast('Trade enregistré avec succès !', 'success');
  });
}

/**
 * Ouvre la modale d'analyse complète d'un match
 * (wrapper simple — le contenu est généré par matchCard.js)
 * @param {string} htmlContent
 * @param {string} title
 */
export function openMatchAnalysisModal(htmlContent, title = 'Analyse complète') {
  openModal(title, htmlContent, {
    maxWidth: '720px',
    onOpen: (container) => {
      // Initialiser les charts Chart.js dans la modale
      document.dispatchEvent(new CustomEvent('modal:opened', { detail: { container } }));
    },
  });
}

/**
 * Toast notification
 * @param {string} message
 * @param {string} type - 'success'|'error'|'info'|'warning'
 */
export function showToast(message, type = 'info') {
  const existing = document.getElementById('fhg-toast');
  if (existing) existing.remove();

  const colors = {
    success: '#1D9E75',
    error: '#E24B4A',
    warning: '#EF9F27',
    info: '#378ADD',
  };

  const toast = document.createElement('div');
  toast.id = 'fhg-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #1A1D27;
    color: #F0F0F0;
    border: 1px solid ${colors[type] || colors.info};
    border-left: 3px solid ${colors[type] || colors.info};
    padding: 12px 18px;
    border-radius: 10px;
    font-size: 13px;
    font-family: 'Inter', sans-serif;
    z-index: 9999;
    max-width: 360px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    animation: slideInToast 0.3s ease;
  `;

  if (!document.getElementById('toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.textContent = `
      @keyframes slideInToast {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
