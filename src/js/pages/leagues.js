/* ================================================
   leagues.js — Page Ligues actives
   FHG Tracker
   ================================================ */

import { getState, saveLeagues } from '../store/store.js';
import { calcLeagueStats } from '../core/filters.js';
import { showToast } from '../components/matchCard.js';

/**
 * Rendre la page Ligues actives.
 */
export function renderLeagues() {
  const { leagues, signaux, exclus } = getState();
  const allLeagues = leagues || [];
  const allMatches = [...(signaux || []), ...(exclus || [])];

  const actives  = allLeagues.filter(l => l.active).length;
  const maxLeagues = 50;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
      <div>
        <div class="page-title">Ligues actives</div>
        <div class="page-subtitle">Gérez les ligues surveillées par la stratégie FHG</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:13px;color:var(--color-text-muted);">
          <span style="font-weight:600;color:${actives >= maxLeagues ? 'var(--color-danger)' : 'var(--color-accent-green)'};">
            ${actives}
          </span>/${maxLeagues} ligues (plan Hobby)
        </div>
      </div>
    </div>

    <!-- INFO BUNDESLIGA/LA LIGA -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
      <div class="info-box">
        <span>🇩🇪</span>
        <div>
          <strong>Bundesliga</strong> — Ligue la plus favorable au FHG<br>
          <span style="font-size:11px;">Ratio DOM/EXT : 51/49 · Recommandée en priorité</span>
        </div>
      </div>
      <div class="warning-box">
        <span>🇪🇸</span>
        <div>
          <strong>La Liga</strong> — Structurellement défavorable<br>
          <span style="font-size:11px;">Ratio DOM/EXT : 43/57 · À utiliser avec prudence</span>
        </div>
      </div>
    </div>

    <!-- GRILLE LIGUES -->
    <div class="section-title">Ligues configurées</div>
    <div class="leagues-grid" id="leagues-grid">
      ${allLeagues.map(league => renderLeagueCard(league, allMatches)).join('')}
    </div>
  `;
}

function renderLeagueCard(league, allMatches) {
  const stats = calcLeagueStats(allMatches, league.id);

  return `
    <div class="league-card ${!league.active ? 'card--excluded' : ''}" data-league-id="${league.id}"
      style="${!league.active ? 'opacity:0.5;' : ''}">
      <div class="league-card__header">
        <span class="league-card__flag">${league.flag}</span>
        <div>
          <div class="league-card__name">${league.name}</div>
          <div style="font-size:11px;color:var(--color-text-muted);">${league.country}</div>
        </div>
        <div class="league-card__toggle">
          <label class="toggle-switch">
            <input type="checkbox" class="league-toggle"
              data-league="${league.id}"
              ${league.active ? 'checked' : ''}/>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="league-card__stats">
        <div class="league-stat">
          <div class="league-stat__label">Signaux FHG >75%</div>
          <div class="league-stat__value ${stats.forts > 0 ? 'green' : ''}">${stats.forts}</div>
        </div>
        <div class="league-stat">
          <div class="league-stat__label">Badge 1MT 50%+</div>
          <div class="league-stat__value ${stats.badge1MT > 0 ? 'green' : ''}">${stats.badge1MT}</div>
        </div>
        <div class="league-stat">
          <div class="league-stat__label">Taux FHG moy.</div>
          <div class="league-stat__value ${stats.avgFHG >= 60 ? 'green' : ''}">${stats.avgFHG}%</div>
        </div>
        <div class="league-stat">
          <div class="league-stat__label">Matchs exclus</div>
          <div class="league-stat__value ${stats.exclus > 0 ? 'orange' : ''}">${stats.exclus}</div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="badge ${league.active ? 'badge--fort' : 'badge--faible'}">
          ${league.active ? '● Active' : '○ Inactive'}
        </span>
        <span style="font-size:11px;color:var(--color-text-muted);">
          Taux 1MT moy. : ${stats.avg1MT}%
        </span>
      </div>
    </div>
  `;
}

/**
 * Initialiser les événements de la page.
 */
export function initLeagues(container) {
  if (!container) return;

  // Toggles activation/désactivation
  container.querySelectorAll('.league-toggle').forEach(toggle => {
    toggle.addEventListener('change', () => {
      const id      = toggle.dataset.league;
      const leagues = [...(getState('leagues') || [])];
      const idx     = leagues.findIndex(l => l.id === id);
      if (idx === -1) return;

      const active = leagues.filter(l => l.active).length;

      // Vérification limite 50 ligues
      if (toggle.checked && !leagues[idx].active && active >= 50) {
        toggle.checked = false;
        showToast('Limite de 50 ligues atteinte (plan Hobby)', 'warning');
        return;
      }

      leagues[idx] = { ...leagues[idx], active: toggle.checked };
      saveLeagues(leagues);

      // Mettre à jour visuellement la carte
      const card = container.querySelector(`[data-league-id="${id}"]`);
      if (card) {
        card.style.opacity = toggle.checked ? '1' : '0.5';
        const badge = card.querySelector('.badge');
        if (badge) {
          badge.className = `badge ${toggle.checked ? 'badge--fort' : 'badge--faible'}`;
          badge.textContent = toggle.checked ? '● Active' : '○ Inactive';
        }
      }

      showToast(
        toggle.checked
          ? `${leagues[idx].name} activée`
          : `${leagues[idx].name} désactivée`,
        'info'
      );
    });
  });
}
