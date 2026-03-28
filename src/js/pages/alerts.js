/* ================================================
   alerts.js — Page Alertes et configuration
   FHG Tracker
   ================================================ */

import { getState, saveConfig, calcStatsTradesGlobal } from '../store/store.js';
import { showToast } from '../components/matchCard.js';

/**
 * Rendre la page Alertes.
 */
export function renderAlerts() {
  const config = getState('config') || {};
  const trades = getState('trades') || [];
  const tradesJoues = trades.filter(t => t.resultat !== 'non_joue');
  const stats  = calcStatsTradesGlobal();

  return `
    <div class="page-title">Alertes & Configuration</div>
    <div class="page-subtitle">Paramétrez les seuils de la stratégie FHG</div>

    <!-- BLOC FHG -->
    <div class="settings-block">
      <div class="settings-block__title">⚡ Critères FHG principaux</div>

      <div class="slider-row mb-16">
        <div class="slider-header">
          <span class="slider-label">Seuil FHG 31-45min saison N</span>
          <span class="slider-value" id="val-seuilFHG">${config.seuilFHG}%</span>
        </div>
        <input type="range" class="form-input config-slider"
          data-config="seuilFHG" min="60" max="90" value="${config.seuilFHG}" />
      </div>

      <div class="slider-row mb-16">
        <div class="slider-header">
          <span class="slider-label">Seuil forme 5 derniers matchs</span>
          <span class="slider-value" id="val-seuil5Matchs">${config.seuil5Matchs}/5</span>
        </div>
        <input type="range" class="form-input config-slider"
          data-config="seuil5Matchs" min="2" max="5" value="${config.seuil5Matchs}" />
      </div>

      <div class="toggle-row">
        <div class="toggle-info">
          <div class="toggle-info__label">Ignorer début de saison</div>
          <div class="toggle-info__sub">Malus -10 pts si moins de ${config.seuilMatchsMin} matchs joués</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" class="config-toggle" data-config="ignoreDebutSaison"
            ${config.ignoreDebutSaison ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="slider-row mb-16 mt-12">
        <div class="slider-header">
          <span class="slider-label">Seuil matchs joués min (début saison)</span>
          <span class="slider-value" id="val-seuilMatchsMin">${config.seuilMatchsMin} matchs</span>
        </div>
        <input type="range" class="form-input config-slider"
          data-config="seuilMatchsMin" min="5" max="15" value="${config.seuilMatchsMin}" />
      </div>

      <div class="toggle-row">
        <div class="toggle-info">
          <div class="toggle-info__label">Pondération saison N-1</div>
          <div class="toggle-info__sub">Intègre les stats de la saison précédente (25%)</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" class="config-toggle" data-config="ponderationN1"
            ${config.ponderationN1 ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- BLOC 1MT -->
    <div class="settings-block">
      <div class="settings-block__title">★ Bonus 1MT 50%+</div>

      <div class="toggle-row">
        <div class="toggle-info">
          <div class="toggle-info__label">Afficher le badge 1MT 50%+</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" class="config-toggle" data-config="afficher1MT"
            ${config.afficher1MT ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="toggle-row">
        <div class="toggle-info">
          <div class="toggle-info__label">Alerter en priorité si badge présent</div>
          <div class="toggle-info__sub">Remonte les matchs avec badge 1MT en tête de liste</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" class="config-toggle" data-config="alerter1MT"
            ${config.alerter1MT ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="slider-row mb-0 mt-12">
        <div class="slider-header">
          <span class="slider-label">Seuil du badge 1MT</span>
          <span class="slider-value" id="val-seuil1MT">${config.seuil1MT}%</span>
        </div>
        <input type="range" class="form-input config-slider"
          data-config="seuil1MT" min="50" max="70" value="${config.seuil1MT}" />
      </div>
    </div>

    <!-- BLOC H2H -->
    <div class="settings-block">
      <div class="settings-block__title">⚔ H2H Clean Sheet</div>

      <div class="toggle-row">
        <div class="toggle-info">
          <div class="toggle-info__label">Filtre H2H actif</div>
          <div class="toggle-info__sub" style="color:${config.filtreH2HActif ? 'var(--color-text-muted)' : 'var(--color-danger)'};">
            ${config.filtreH2HActif
              ? 'Les matchs à 0 but en 1MT sur H2H sont automatiquement exclus'
              : '⚠ FILTRE DÉSACTIVÉ — Contre-recommandé'
            }
          </div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" class="config-toggle" data-config="filtreH2HActif"
            id="toggle-filtreH2H"
            ${config.filtreH2HActif ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div id="h2h-warning-box" class="${config.filtreH2HActif ? 'hidden' : ''}">
        <div class="danger-box mt-8">
          🚫 Désactiver ce filtre va à l'encontre de la règle fondamentale de la méthode.
          La récurrence prime sur tout. Un FHG de 90% ne justifie pas de prendre un match
          où l'équipe n'a jamais marqué en 1MT contre cet adversaire. Zéro exception.
        </div>
      </div>

      <div class="slider-row mb-16 mt-12">
        <div class="slider-header">
          <span class="slider-label">Nb minimum H2H pour appliquer exclusion</span>
          <span class="slider-value" id="val-minH2H">${config.minH2H}</span>
        </div>
        <input type="range" class="form-input config-slider"
          data-config="minH2H" min="1" max="5" value="${config.minH2H}" />
      </div>

      <div class="slider-row mb-0">
        <div class="slider-header">
          <span class="slider-label">Pénalité H2H orange (1 but en 1MT)</span>
          <span class="slider-value" id="val-penaliteH2H">-${config.penaliteH2H} pts</span>
        </div>
        <input type="range" class="form-input config-slider"
          data-config="penaliteH2H" min="5" max="15" value="${config.penaliteH2H}" />
      </div>
    </div>

    <!-- BLOC DC -->
    <div class="settings-block">
      <div class="settings-block__title">🔄 Double Chance (DC)</div>

      <div class="toggle-row">
        <div class="toggle-info">
          <div class="toggle-info__label">Analyse DC automatique</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" class="config-toggle" data-config="analyseDC"
            ${config.analyseDC ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="slider-row mb-16 mt-12">
        <div class="slider-header">
          <span class="slider-label">Seuil % retour au score si encaisse</span>
          <span class="slider-value" id="val-seuilRetourDC">${config.seuilRetourDC}%</span>
        </div>
        <input type="range" class="form-input config-slider"
          data-config="seuilRetourDC" min="45" max="75" value="${config.seuilRetourDC}" />
      </div>

      <div class="info-box" style="font-size:12px;">
        🔒 DC identifiée uniquement après analyse FHG — Règle absolue (non modifiable)
      </div>
    </div>

    <!-- BLOC TIMING -->
    <div class="settings-block">
      <div class="settings-block__title">⏱ Timing</div>

      <div class="form-group">
        <label class="form-label">Profil joueur</label>
        <div class="profile-selector" id="profil-selector">
          ${['debutant','intermediaire','expert'].map(p => `
            <button class="profile-btn ${config.profil === p ? 'active' : ''}" data-profil="${p}">
              <span class="profile-btn__name">
                ${{ debutant:'Débutant', intermediaire:'Intermédiaire', expert:'Expert' }[p]}
              </span>
              <span class="profile-btn__desc">
                ${{ debutant:'5-10e, cote ~1.50', intermediaire:'15-20e', expert:'25-35e, cote 2.30+' }[p]}
              </span>
            </button>
          `).join('')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px;">
        <div class="slider-row">
          <div class="slider-header">
            <span class="slider-label">Ne pas alerter avant la</span>
            <span class="slider-value" id="val-minuteMin">${config.minuteMin}e min</span>
          </div>
          <input type="range" class="form-input config-slider"
            data-config="minuteMin" min="1" max="40" value="${config.minuteMin}" />
        </div>
        <div class="slider-row">
          <div class="slider-header">
            <span class="slider-label">Ne pas alerter après la</span>
            <span class="slider-value" id="val-minuteMax">${config.minuteMax}e min</span>
          </div>
          <input type="range" class="form-input config-slider"
            data-config="minuteMax" min="50" max="90" value="${config.minuteMax}" />
        </div>
      </div>
    </div>

    <!-- BLOC SESSION -->
    <div class="settings-block">
      <div class="settings-block__title">🎮 Session</div>

      <div class="slider-row mb-16">
        <div class="slider-header">
          <span class="slider-label">Max alertes par session</span>
          <span class="slider-value" id="val-maxAlertes">${config.maxAlertes}</span>
        </div>
        <input type="range" class="form-input config-slider"
          data-config="maxAlertes" min="1" max="15" value="${config.maxAlertes}" />
      </div>

      <div class="toggle-row">
        <div class="toggle-info">
          <div class="toggle-info__label">Stop après N victoires consécutives</div>
          <div class="toggle-info__sub">Pause automatique après une série gagnante</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" class="config-toggle" data-config="stopVictoires"
            ${config.stopVictoires ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="slider-row mt-12">
        <div class="slider-header">
          <span class="slider-label">Nb de victoires avant pause</span>
          <span class="slider-value" id="val-nbVictoires">${config.nbVictoires}</span>
        </div>
        <input type="range" class="form-input config-slider"
          data-config="nbVictoires" min="2" max="10" value="${config.nbVictoires}" />
      </div>
    </div>

    <!-- HISTORIQUE ALERTES -->
    <div class="settings-block">
      <div class="settings-block__title">📋 Historique des alertes</div>

      ${tradesJoues.length >= 20 && stats ? `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
          <div class="stat-card">
            <div class="stat-card__label">Avec badge 1MT 50%+</div>
            <div class="stat-card__value ${stats.taux1MT >= 60 ? 'green' : 'orange'}">${stats.taux1MT ?? '—'}%</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__label">Sans badge 1MT</div>
            <div class="stat-card__value">${stats.tauxSans1MT ?? '—'}%</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__label">H2H vert</div>
            <div class="stat-card__value green">${stats.tauxH2HVert ?? '—'}%</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__label">H2H orange</div>
            <div class="stat-card__value orange">${stats.tauxH2HOrange ?? '—'}%</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__label">H2H insuffisant</div>
            <div class="stat-card__value">${stats.tauxH2HGris ?? '—'}%</div>
          </div>
          <div class="stat-card">
            <div class="stat-card__label">Taux global</div>
            <div class="stat-card__value ${stats.tauxGlobal >= 50 ? 'green' : 'orange'}">${stats.tauxGlobal}%</div>
          </div>
        </div>
      ` : `
        <div class="info-box mb-16" style="font-size:12px;">
          ℹ Les stats croisées apparaîtront après 20+ trades enregistrés
          (actuellement ${tradesJoues.length} trade${tradesJoues.length > 1 ? 's' : ''}).
        </div>
      `}

      ${trades.length === 0
        ? `<div class="empty-state" style="padding:24px;">
             <div class="empty-state__icon">📋</div>
             <div class="empty-state__title">Aucun trade enregistré</div>
             <div class="empty-state__desc">Utilisez la fiche rapide sur une carte match pour noter vos trades.</div>
           </div>`
        : `
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Match</th>
                  <th>Signal</th>
                  <th>1MT</th>
                  <th>H2H</th>
                  <th>Résultat</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${trades.slice().reverse().slice(0, 20).map(t => `
                  <tr>
                    <td>${t.date || '—'}</td>
                    <td style="font-size:12px;">${t.match || '—'}</td>
                    <td>${t.fhgPct ? t.fhgPct + '%' : '—'}</td>
                    <td>${t.badge1MT ? '<span class="badge badge--1mt">★</span>' : '—'}</td>
                    <td>
                      ${t.h2h === 'favorable'
                        ? '<span class="badge badge--h2h-vert">✓</span>'
                        : t.h2h === 'defavorable'
                          ? '<span class="badge badge--h2h-orange">⚠</span>'
                          : '<span class="badge badge--h2h-gris">?</span>'
                      }
                    </td>
                    <td>
                      <select class="form-input" style="padding:3px 6px;font-size:11px;width:100px;"
                        data-trade-id="${t.id}" data-trade-result>
                        <option value="non_joue" ${t.resultat === 'non_joue' ? 'selected' : ''}>Non joué</option>
                        <option value="gagne"    ${t.resultat === 'gagne'    ? 'selected' : ''}>Gagné ✓</option>
                        <option value="perdu"    ${t.resultat === 'perdu'    ? 'selected' : ''}>Perdu ✗</option>
                      </select>
                    </td>
                    <td>
                      <button class="btn btn--ghost btn--sm" data-delete-trade="${t.id}">🗑</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${trades.length > 20 ? `<p style="font-size:12px;color:var(--color-text-muted);margin-top:8px;">Affichage des 20 derniers trades. Voir l'historique complet dans Paramètres.</p>` : ''}
        `
      }
    </div>
  `;
}

/**
 * Initialiser les événements.
 */
export function initAlerts(container) {
  if (!container) return;

  // Sliders
  container.querySelectorAll('.config-slider').forEach(slider => {
    slider.addEventListener('input', () => {
      const key = slider.dataset.config;
      const val = parseInt(slider.value);
      const display = document.getElementById(`val-${key}`);
      if (display) {
        if (key === 'seuilFHG' || key === 'seuil1MT' || key === 'seuilRetourDC') {
          display.textContent = val + '%';
        } else if (key === 'penaliteH2H') {
          display.textContent = '-' + val + ' pts';
        } else if (key === 'minuteMin' || key === 'minuteMax') {
          display.textContent = val + 'e min';
        } else if (key === 'seuilMatchsMin') {
          display.textContent = val + ' matchs';
        } else {
          display.textContent = val;
        }
      }
    });
    slider.addEventListener('change', () => {
      const key = slider.dataset.config;
      const val = parseInt(slider.value);
      saveConfig({ [key]: val });
      showToast('Configuration sauvegardée', 'success');
    });
  });

  // Toggles
  container.querySelectorAll('.config-toggle').forEach(toggle => {
    toggle.addEventListener('change', () => {
      const key = toggle.dataset.config;
      const val = toggle.checked;
      saveConfig({ [key]: val });

      // Warning H2H spécial
      if (key === 'filtreH2HActif') {
        const warn = document.getElementById('h2h-warning-box');
        warn?.classList.toggle('hidden', val);
        if (!val) {
          showToast('⚠ Filtre H2H désactivé — contre-recommandé !', 'warning');
        }
      } else {
        showToast('Configuration sauvegardée', 'success');
      }
    });
  });

  // Profil selector
  container.querySelectorAll('[data-profil]').forEach(btn => {
    btn.addEventListener('click', () => {
      const profil = btn.dataset.profil;
      saveConfig({ profil });
      container.querySelectorAll('[data-profil]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showToast(`Profil "${profil}" sélectionné`, 'info');
    });
  });

  // Mise à jour résultat trade
  container.querySelectorAll('[data-trade-result]').forEach(sel => {
    sel.addEventListener('change', () => {
      const id = sel.dataset.tradeId;
      import('../store/store.js').then(({ updateTrade }) => {
        updateTrade(parseInt(id), { resultat: sel.value });
        showToast('Résultat mis à jour', 'success');
      });
    });
  });

  // Suppression trade
  container.querySelectorAll('[data-delete-trade]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.deleteTrade;
      if (confirm('Supprimer ce trade ?')) {
        import('../store/store.js').then(({ deleteTrade }) => {
          deleteTrade(parseInt(id));
          import('../app.js').then(m => m.navigateTo?.('alerts'));
          showToast('Trade supprimé', 'info');
        });
      }
    });
  });
}
