/**
 * alerts.js — Page "Alertes" (configuration + historique)
 */

import store from '../store/store.js';
import { showToast } from '../components/modal.js';

export function renderAlerts() {
  const page = document.getElementById('page-alerts');
  if (!page) return;

  const config = store.get('alertsConfig');
  const trades = store.get('trades') || [];
  const tradeStats = store.getTradeStats();

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Alertes</div>
        <div class="page-subtitle">Configuration des critères et historique</div>
      </div>
      <button id="btn-save-alerts" class="btn btn-primary">💾 Sauvegarder</button>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:0;">
      <!-- Colonne gauche -->
      <div>
        ${buildFHGBlock(config)}
        ${buildBonus1MTBlock(config)}
        ${buildH2HBlock(config)}
        ${buildDCBlock(config)}
      </div>
      <!-- Colonne droite -->
      <div>
        ${buildTimingBlock(config)}
        ${buildSessionBlock(config)}
        ${buildLiguesJoursBlock(config)}
      </div>
    </div>

    <!-- Historique alertes -->
    <div style="margin-top:24px;">
      ${buildHistoriqueBlock(trades, tradeStats)}
    </div>
  `;

  initAlertsForms(config);
  document.getElementById('btn-save-alerts')?.addEventListener('click', saveConfig);
}

function buildFHGBlock(config) {
  return `
    <div class="settings-block">
      <div class="settings-block-title">⚡ Critères FHG principaux</div>

      <div class="slider-group">
        <div class="slider-header">
          <span class="slider-label">Seuil FHG 31-45min saison N</span>
          <span class="slider-value" id="val-seuilFHGN">${config.seuilFHGN}%</span>
        </div>
        <input type="range" class="form-range" id="seuil-fhg-n"
          min="60" max="90" value="${config.seuilFHGN}"
          data-config="seuilFHGN" data-suffix="%" />
      </div>

      <div class="slider-group">
        <div class="slider-header">
          <span class="slider-label">Seuil forme 5 derniers matchs</span>
          <span class="slider-value" id="val-seuilForme5M">${config.seuilForme5M}/5</span>
        </div>
        <input type="range" class="form-range" id="seuil-forme"
          min="2" max="5" value="${config.seuilForme5M}"
          data-config="seuilForme5M" data-suffix="/5" />
      </div>

      <div class="settings-divider"></div>

      <div class="toggle-group">
        <div class="toggle-info">
          <div class="toggle-label">Ignorer début de saison</div>
          <div class="toggle-desc">Malus -10 pts si matchs joués insuffisants</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" data-config="ignoreDebutSaison" ${config.ignoreDebutSaison ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="slider-group" id="group-seuilMatchesSaison">
        <div class="slider-header">
          <span class="slider-label">Seuil matchs joués (début saison)</span>
          <span class="slider-value" id="val-seuilMatchesSaison">${config.seuilMatchesSaison} matchs</span>
        </div>
        <input type="range" class="form-range"
          min="4" max="15" value="${config.seuilMatchesSaison}"
          data-config="seuilMatchesSaison" data-suffix=" matchs" />
      </div>

      <div class="toggle-group">
        <div class="toggle-info">
          <div class="toggle-label">Pondération saison N-1</div>
          <div class="toggle-desc">Inclure la saison précédente dans le calcul (25%)</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" data-config="ponderationN1" ${config.ponderationN1 ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  `;
}

function buildBonus1MTBlock(config) {
  return `
    <div class="settings-block">
      <div class="settings-block-title">★ Bonus 1MT 50%+</div>

      <div class="toggle-group">
        <div class="toggle-info">
          <div class="toggle-label">Afficher le badge 1MT 50%+</div>
          <div class="toggle-desc">Badge violet sur les cartes éligibles</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" data-config="afficherBadge1MT" ${config.afficherBadge1MT ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="toggle-group">
        <div class="toggle-info">
          <div class="toggle-label">Alerter en priorité si badge présent</div>
          <div class="toggle-desc">Les matchs avec badge 1MT+ remontent en tête</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" data-config="alerterPriorite1MT" ${config.alerterPriorite1MT ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="slider-group">
        <div class="slider-header">
          <span class="slider-label">Seuil du badge 1MT</span>
          <span class="slider-value" id="val-seuil1MT">${config.seuil1MT}%</span>
        </div>
        <input type="range" class="form-range"
          min="50" max="70" value="${config.seuil1MT}"
          data-config="seuil1MT" data-suffix="%" />
      </div>
    </div>
  `;
}

function buildH2HBlock(config) {
  return `
    <div class="settings-block">
      <div class="settings-block-title">🔍 Filtre H2H Clean Sheet</div>

      <div class="toggle-group">
        <div class="toggle-info">
          <div class="toggle-label">Filtre H2H actif</div>
          <div class="toggle-desc">Exclut les matchs sans but en 1MT en H2H</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" data-config="filtreH2HActif" id="toggle-h2h-filtre" ${config.filtreH2HActif ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div id="h2h-warning" class="warning-box orange" style="display:${config.filtreH2HActif ? 'none' : 'flex'};">
        <span>⚠</span>
        <span>Désactiver ce filtre va à l'encontre de la règle fondamentale. <strong>La récurrence prime sur tout.</strong></span>
      </div>

      <div class="slider-group">
        <div class="slider-header">
          <span class="slider-label">Nb minimum H2H pour exclusion</span>
          <span class="slider-value" id="val-minMatchesH2H">${config.minMatchesH2HPourExclusion} matchs</span>
        </div>
        <input type="range" class="form-range"
          min="1" max="5" value="${config.minMatchesH2HPourExclusion}"
          data-config="minMatchesH2HPourExclusion" data-suffix=" matchs" />
      </div>

      <div class="slider-group">
        <div class="slider-header">
          <span class="slider-label">Pénalité H2H orange (1 but en 1MT)</span>
          <span class="slider-value" id="val-penaliteH2H">${config.penaliteH2HOrange} pts</span>
        </div>
        <input type="range" class="form-range"
          min="-15" max="-5" value="${config.penaliteH2HOrange}"
          data-config="penaliteH2HOrange" data-suffix=" pts" />
      </div>
    </div>
  `;
}

function buildDCBlock(config) {
  return `
    <div class="settings-block">
      <div class="settings-block-title">📈 Double Chance (DC)</div>

      <div class="toggle-group">
        <div class="toggle-info">
          <div class="toggle-label">Analyse DC automatique</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" data-config="analyseDCAutomatique" ${config.analyseDCAutomatique ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="slider-group">
        <div class="slider-header">
          <span class="slider-label">Seuil % retour au score si encaisse</span>
          <span class="slider-value" id="val-seuilDC">${config.seuilDC}%</span>
        </div>
        <input type="range" class="form-range"
          min="40" max="80" value="${config.seuilDC}"
          data-config="seuilDC" data-suffix="%" />
      </div>

      <div class="toggle-group" style="opacity:0.6;">
        <div class="toggle-info">
          <div class="toggle-label">DC uniquement si FHG validé</div>
          <div class="toggle-desc" style="color:var(--color-danger);">🔒 Règle absolue — non modifiable</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" checked disabled />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  `;
}

function buildTimingBlock(config) {
  return `
    <div class="settings-block">
      <div class="settings-block-title">⏱ Timing & Profil</div>

      <div class="form-group">
        <label class="form-label">Profil joueur</label>
        <div class="profile-selector">
          <div class="profile-option ${config.profil === 'debutant' ? 'active' : ''}" data-profile="debutant">
            <div class="profile-option-label">Débutant</div>
            <div class="profile-option-desc">5-10e min · cote ~1,50</div>
          </div>
          <div class="profile-option ${config.profil === 'intermediaire' ? 'active' : ''}" data-profile="intermediaire">
            <div class="profile-option-label">Intermédiaire</div>
            <div class="profile-option-desc">15-20e min · ~1,80</div>
          </div>
          <div class="profile-option ${config.profil === 'expert' ? 'active' : ''}" data-profile="expert">
            <div class="profile-option-label">Expert</div>
            <div class="profile-option-desc">25-35e min · 2,30+</div>
          </div>
        </div>
      </div>

      <div class="slider-group">
        <div class="slider-header">
          <span class="slider-label">Ne pas alerter avant la Xe minute</span>
          <span class="slider-value" id="val-neAlertePasAvant">${config.neAlertePasAvant}e min</span>
        </div>
        <input type="range" class="form-range"
          min="0" max="40" value="${config.neAlertePasAvant}"
          data-config="neAlertePasAvant" data-suffix="e min" />
      </div>

      <div class="slider-group">
        <div class="slider-header">
          <span class="slider-label">Ne pas alerter après la Ye minute</span>
          <span class="slider-value" id="val-neAlertePasApres">${config.neAlertePasApres}e min</span>
        </div>
        <input type="range" class="form-range"
          min="30" max="90" value="${config.neAlertePasApres}"
          data-config="neAlertePasApres" data-suffix="e min" />
      </div>
    </div>
  `;
}

function buildSessionBlock(config) {
  return `
    <div class="settings-block">
      <div class="settings-block-title">🎯 Session</div>

      <div class="slider-group">
        <div class="slider-header">
          <span class="slider-label">Max alertes par session</span>
          <span class="slider-value" id="val-maxAlertes">${config.maxAlertesSession}</span>
        </div>
        <input type="range" class="form-range"
          min="1" max="15" value="${config.maxAlertesSession}"
          data-config="maxAlertesSession" data-suffix="" />
      </div>

      <div class="toggle-group">
        <div class="toggle-info">
          <div class="toggle-label">Stop après N victoires consécutives</div>
          <div class="toggle-desc">Discipline : on arrête sur une bonne série</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" data-config="stopApresVictoires" ${config.stopApresVictoires ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="slider-group">
        <div class="slider-header">
          <span class="slider-label">Stop après X victoires</span>
          <span class="slider-value" id="val-stopApresN">${config.stopApresNVictoires}</span>
        </div>
        <input type="range" class="form-range"
          min="2" max="10" value="${config.stopApresNVictoires}"
          data-config="stopApresNVictoires" data-suffix="" />
      </div>

      <button id="btn-pause-inline" class="btn btn-danger btn-full" style="margin-top:8px;">
        ⏸ PAUSE SESSION
      </button>
    </div>
  `;
}

function buildLiguesJoursBlock(config) {
  const jours = [
    { val: 1, label: 'Lun' },
    { val: 2, label: 'Mar' },
    { val: 3, label: 'Mer' },
    { val: 4, label: 'Jeu' },
    { val: 5, label: 'Ven' },
    { val: 6, label: 'Sam' },
    { val: 0, label: 'Dim' },
  ];

  const joursBtns = jours.map(j => `
    <button class="filter-btn ${config.joursActifs.includes(j.val) ? 'active' : ''}" data-jour="${j.val}">
      ${j.label}
    </button>
  `).join('');

  return `
    <div class="settings-block">
      <div class="settings-block-title">📅 Jours de surveillance</div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        ${joursBtns}
      </div>
    </div>
  `;
}

function buildHistoriqueBlock(trades, stats) {
  const recentTrades = [...trades].reverse().slice(0, 20);

  const rows = recentTrades.map(t => `
    <tr>
      <td style="font-size:12px;color:var(--color-text-muted);">${t.date || '—'}</td>
      <td style="font-size:12px;font-weight:500;">${t.match || '—'}</td>
      <td><span class="badge badge-blue" style="font-size:10px;">${t.signalFHG || '—'}%</span></td>
      <td>
        ${t.badge1MT50 ? '<span class="badge badge-violet" style="font-size:10px;">★</span>' : '<span style="color:var(--color-text-muted)">—</span>'}
      </td>
      <td>
        <span class="badge ${t.h2h === 'favorable' ? 'badge-green' : t.h2h === 'defavorable' ? 'badge-orange' : 'badge-gray'}" style="font-size:10px;">
          ${t.h2h || '?'}
        </span>
      </td>
      <td>
        <select class="form-select" style="padding:3px 24px 3px 8px;font-size:11px;width:auto;" data-trade-id="${t.id}">
          <option value="non-joue" ${t.resultat === 'non-joue' ? 'selected' : ''}>Non joué</option>
          <option value="gagne" ${t.resultat === 'gagne' ? 'selected' : ''}>Gagné ✓</option>
          <option value="perdu" ${t.resultat === 'perdu' ? 'selected' : ''}>Perdu ✗</option>
        </select>
      </td>
      <td>
        <span class="trade-result-badge ${t.resultat}">${
          t.resultat === 'gagne' ? 'Gagné' :
          t.resultat === 'perdu' ? 'Perdu' : 'En attente'
        }</span>
      </td>
    </tr>
  `).join('');

  const statsHtml = stats && trades.filter(t => t.resultat !== 'non-joue').length >= 5 ? `
    <div class="settings-block" style="margin-top:16px;">
      <div class="settings-block-title">📊 Impact des indicateurs</div>
      ${trades.filter(t => t.resultat !== 'non-joue').length < 20
        ? `<div class="text-muted" style="font-size:12px;">Stats disponibles après 20 trades résolus (${trades.filter(t => t.resultat !== 'non-joue').length}/20)</div>`
        : `
          <div class="impact-stats">
            <div class="impact-stat">
              <div class="impact-stat-header">Badge 1MT 50%+</div>
              <div class="impact-stat-compare">
                <div class="impact-stat-item">
                  <div class="impact-stat-label">Avec badge ★</div>
                  <div class="impact-stat-value" style="color:var(--color-badge-violet);">${stats.tauxAvec1MT ?? '—'}%</div>
                </div>
                <div style="color:var(--color-border);">|</div>
                <div class="impact-stat-item">
                  <div class="impact-stat-label">Sans badge</div>
                  <div class="impact-stat-value">${stats.tauxSans1MT ?? '—'}%</div>
                </div>
              </div>
            </div>
            <div class="impact-stat">
              <div class="impact-stat-header">Statut H2H</div>
              <div class="impact-stat-compare">
                <div class="impact-stat-item">
                  <div class="impact-stat-label">H2H vert ✓</div>
                  <div class="impact-stat-value" style="color:var(--color-accent-green);">${stats.tauxH2HVert ?? '—'}%</div>
                </div>
                <div style="color:var(--color-border);">|</div>
                <div class="impact-stat-item">
                  <div class="impact-stat-label">H2H orange ⚠</div>
                  <div class="impact-stat-value" style="color:var(--color-warning-orange);">${stats.tauxH2HOrange ?? '—'}%</div>
                </div>
              </div>
            </div>
          </div>
        `
      }
    </div>
  ` : '';

  return `
    <div class="settings-block">
      <div class="settings-block-title" style="display:flex;justify-content:space-between;align-items:center;">
        <span>📋 Historique des alertes</span>
        <span style="font-size:12px;color:var(--color-text-muted);">${trades.length} trade${trades.length > 1 ? 's' : ''}</span>
      </div>

      ${stats ? `
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;padding:12px;background:var(--color-bg-input);border-radius:8px;">
          <div>
            <div class="match-stat-label">Taux de réussite</div>
            <div style="font-size:20px;font-weight:700;color:${stats.tauxReussite >= 60 ? 'var(--color-accent-green)' : stats.tauxReussite >= 50 ? 'var(--color-warning-orange)' : 'var(--color-danger)'};">
              ${stats.tauxReussite}%
            </div>
          </div>
          <div>
            <div class="match-stat-label">Trades résolus</div>
            <div style="font-size:20px;font-weight:700;">${stats.gagnes}/${stats.total}</div>
          </div>
          ${stats.coteMoyenne ? `
            <div>
              <div class="match-stat-label">Cote moyenne</div>
              <div style="font-size:20px;font-weight:700;">${stats.coteMoyenne}</div>
            </div>
          ` : ''}
          <div>
            <div class="match-stat-label">Meilleure série</div>
            <div style="font-size:20px;font-weight:700;color:var(--color-accent-green);">${stats.meillereSerie}</div>
          </div>
          <div>
            <div class="match-stat-label">Pire série</div>
            <div style="font-size:20px;font-weight:700;color:var(--color-danger);">${stats.piresSerie}</div>
          </div>
        </div>
      ` : ''}

      ${trades.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">Aucun trade enregistré</div></div>`
        : `
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th><th>Match</th><th>FHG%</th>
                  <th>1MT</th><th>H2H</th><th>Décision</th><th>Résultat</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `
      }
    </div>
    ${statsHtml}
  `;
}

function initAlertsForms(config) {
  // Sliders dynamiques
  document.querySelectorAll('input[type="range"][data-config]').forEach(slider => {
    const key = slider.dataset.config;
    const suffix = slider.dataset.suffix || '';
    const valueEl = document.getElementById(`val-${key}`);

    slider.addEventListener('input', () => {
      if (valueEl) valueEl.textContent = slider.value + suffix;
    });
  });

  // Toggles
  document.querySelectorAll('input[type="checkbox"][data-config]').forEach(toggle => {
    const key = toggle.dataset.config;
    toggle.addEventListener('change', () => {
      if (key === 'filtreH2HActif') {
        const warning = document.getElementById('h2h-warning');
        if (warning) warning.style.display = toggle.checked ? 'none' : 'flex';
      }
    });
  });

  // Profil selector
  document.querySelectorAll('.profile-option[data-profile]').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.profile-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
  });

  // Jours de surveillance
  document.querySelectorAll('.filter-btn[data-jour]').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });

  // Pause session inline
  document.getElementById('btn-pause-inline')?.addEventListener('click', () => {
    store.set('sessionPaused', !store.get('sessionPaused'));
    showToast(store.get('sessionPaused') ? 'Session en pause' : 'Session reprise', 'info');
  });

  // Résultat trades
  document.querySelectorAll('select[data-trade-id]').forEach(sel => {
    sel.addEventListener('change', e => {
      const id = parseInt(e.target.dataset.tradeId);
      store.updateTrade(id, { resultat: e.target.value });
    });
  });
}

function saveConfig() {
  const newConfig = { ...store.get('alertsConfig') };

  // Récupérer sliders
  document.querySelectorAll('input[type="range"][data-config]').forEach(slider => {
    const key = slider.dataset.config;
    newConfig[key] = parseInt(slider.value);
  });

  // Récupérer toggles
  document.querySelectorAll('input[type="checkbox"][data-config]').forEach(toggle => {
    const key = toggle.dataset.config;
    newConfig[key] = toggle.checked;
  });

  // Profil
  const activeProfile = document.querySelector('.profile-option.active');
  if (activeProfile) newConfig.profil = activeProfile.dataset.profile;

  // Jours
  const joursActifs = [];
  document.querySelectorAll('.filter-btn[data-jour].active').forEach(btn => {
    joursActifs.push(parseInt(btn.dataset.jour));
  });
  newConfig.joursActifs = joursActifs;

  store.set('alertsConfig', newConfig);
  showToast('Configuration sauvegardée !', 'success');
}
