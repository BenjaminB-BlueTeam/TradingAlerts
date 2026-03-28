/* ================================================
   modal.js — Gestion des modales
   FHG Tracker
   ================================================ */

import { addTrade } from '../store/store.js';

// Toast local (évite la dépendance circulaire avec matchCard)
function showToast(message, type = 'info') {
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

const overlay = () => document.getElementById('modal-overlay');
const modal   = () => document.getElementById('modal');
const title   = () => document.getElementById('modal-title');
const body    = () => document.getElementById('modal-body');

/**
 * Ouvrir la modale générique.
 */
export function openModal(titleText, contentHTML, options = {}) {
  const o = overlay();
  const t = title();
  const b = body();
  if (!o || !t || !b) return;

  t.textContent = titleText;
  b.innerHTML   = contentHTML;

  o.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Taille
  if (options.wide) {
    modal()?.style.setProperty('max-width', '860px');
  } else {
    modal()?.style.setProperty('max-width', '680px');
  }

  // Callback après rendu
  if (typeof options.onOpen === 'function') {
    setTimeout(options.onOpen, 50);
  }
}

/**
 * Fermer la modale.
 */
export function closeModal() {
  overlay()?.classList.add('hidden');
  document.body.style.overflow = '';
}

/**
 * Initialiser les écouteurs de la modale.
 */
export function initModal() {
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  overlay()?.addEventListener('click', e => {
    if (e.target === overlay()) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

// ============================================================
// FICHE TRADE — modale pré-remplie
// ============================================================

/**
 * Ouvrir la modale "Fiche rapide trade" pré-remplie
 * avec les données du match.
 */
export function openFicheTradeModal(matchAnalyse) {
  const m    = matchAnalyse;
  const sc   = m.scoreChoisi || {};
  const now  = new Date().toISOString().split('T')[0];

  const html = `
    <form id="fiche-trade-form" class="fiche-trade-form">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div class="form-group">
          <label class="form-label">Date</label>
          <input class="form-input" type="date" name="date" value="${now}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Ligue</label>
          <input class="form-input" type="text" name="ligue" value="${m.leagueName || ''}" readonly />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Match</label>
        <input class="form-input" type="text" name="match"
          value="${m.homeName || ''} vs ${m.awayName || ''}" readonly />
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group">
          <label class="form-label">Signal FHG% 31-45min</label>
          <input class="form-input" type="number" name="fhgPct"
            value="${sc.tauxN || ''}" min="0" max="100" />
        </div>
        <div class="form-group">
          <label class="form-label">Stratégie</label>
          <select class="form-input" name="strategie">
            <option value="fhg">FHG</option>
            <option value="fhg_dc">FHG + DC</option>
          </select>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group">
          <label class="form-label">Badge 1MT 50%+</label>
          <select class="form-input" name="badge1MT">
            <option value="true"  ${sc.badge1MT50 ? 'selected' : ''}>OUI ★</option>
            <option value="false" ${!sc.badge1MT50 ? 'selected' : ''}>NON</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">H2H</label>
          <select class="form-input" name="h2h">
            <option value="favorable"   ${sc.warningH2H === 'vert'       ? 'selected':''}>Favorable ✓</option>
            <option value="defavorable" ${sc.warningH2H === 'orange'     ? 'selected':''}>Défavorable ⚠</option>
            <option value="insuffisant" ${sc.warningH2H === 'insuffisant'? 'selected':''}>Insuffisant ?</option>
          </select>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group">
          <label class="form-label">Timer prévu (minutes)</label>
          <input class="form-input" type="text" name="timer" placeholder="ex: 25-35" />
        </div>
        <div class="form-group">
          <label class="form-label">Cote minimum objectif</label>
          <input class="form-input" type="number" name="cote" placeholder="ex: 2.30" step="0.05" min="1" />
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group">
          <label class="form-label">DC possible ?</label>
          <select class="form-input" name="dcPossible">
            <option value="">—</option>
            <option value="oui">OUI</option>
            <option value="non">NON</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">État d'esprit</label>
          <input class="form-input" type="text" name="etatEsprit"
            placeholder="ex: Concentré, confiant…" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Résultat</label>
        <select class="form-input" name="resultat">
          <option value="non_joue">Non joué</option>
          <option value="gagne">Gagné ✓</option>
          <option value="perdu">Perdu ✗</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Analyse post-match (optionnel)</label>
        <textarea class="form-input" name="analyse" rows="3"
          placeholder="Ce qui s'est passé, ce que j'aurais dû faire…"></textarea>
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
        <button type="button" class="btn btn--secondary" id="fiche-cancel">Annuler</button>
        <button type="submit" class="btn btn--primary">💾 Enregistrer le trade</button>
      </div>
    </form>
  `;

  openModal(`📋 Fiche trade — ${m.homeName} vs ${m.awayName}`, html, {
    onOpen: () => {
      document.getElementById('fiche-cancel')?.addEventListener('click', closeModal);
      document.getElementById('fiche-trade-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const trade = {
          date:       fd.get('date'),
          ligue:      fd.get('ligue'),
          match:      fd.get('match'),
          fhgPct:     parseFloat(fd.get('fhgPct')) || null,
          strategie:  fd.get('strategie'),
          badge1MT:   fd.get('badge1MT') === 'true',
          h2h:        fd.get('h2h'),
          timer:      fd.get('timer'),
          cote:       parseFloat(fd.get('cote')) || null,
          dcPossible: fd.get('dcPossible'),
          etatEsprit: fd.get('etatEsprit'),
          resultat:   fd.get('resultat'),
          analyse:    fd.get('analyse'),
          matchId:    m.id,
        };
        addTrade(trade);
        showToast('Trade enregistré dans le journal ✓', 'success');
        closeModal();
      });
    },
  });
}
