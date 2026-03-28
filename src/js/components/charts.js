/* ================================================
   charts.js — Wrappers Chart.js
   FHG Tracker
   ================================================ */

/**
 * Créer le graphique de distribution des buts par tranche.
 * La tranche 31-45min est mise en valeur (vert).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Object} dist   — { '0-15': n, '16-30': n, '31-45': n, ... }
 * @returns {Chart}
 */
export function createGoalDistChart(canvas, dist) {
  if (!canvas || typeof Chart === 'undefined') return null;

  const labels = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90'];
  const data   = labels.map(l => dist[l] || 0);

  // Couleurs : tranche 31-45 = vert, autres = gris foncé
  const colors = labels.map(l =>
    l === '31-45' ? 'rgba(29,158,117,0.85)' : 'rgba(68,68,65,0.75)'
  );
  const borderColors = labels.map(l =>
    l === '31-45' ? '#1D9E75' : '#444441'
  );

  // Détruire un chart existant sur ce canvas
  destroyChart(canvas);

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor:     borderColors,
        borderWidth:     1,
        borderRadius:    4,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1A1D27',
          borderColor:     'rgba(255,255,255,0.1)',
          borderWidth:     1,
          titleColor:      '#F0F0F0',
          bodyColor:       '#A0A3B1',
          callbacks: {
            label: ctx => ` ${ctx.parsed.y} but${ctx.parsed.y > 1 ? 's' : ''}`,
          },
        },
      },
      scales: {
        x: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#888780', font: { size: 11 } },
        },
        y: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#888780', font: { size: 11 }, stepSize: 1 },
          beginAtZero: true,
        },
      },
    },
  });

  canvas._chartInstance = chart;
  return chart;
}

/**
 * Créer le graphique de réussite trades (doughnut).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} gagnes
 * @param {number} total
 * @returns {Chart}
 */
export function createWinRateChart(canvas, gagnes, total) {
  if (!canvas || typeof Chart === 'undefined') return null;

  const perdus = total - gagnes;
  destroyChart(canvas);

  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Gagnés', 'Perdus'],
      datasets: [{
        data: [gagnes, perdus],
        backgroundColor: ['rgba(29,158,117,0.8)', 'rgba(226,75,74,0.6)'],
        borderColor:     ['#1D9E75', '#E24B4A'],
        borderWidth:     2,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      cutout:              '70%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#A0A3B1', font: { size: 11 }, padding: 12 },
        },
        tooltip: {
          backgroundColor: '#1A1D27',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#F0F0F0',
          bodyColor:  '#A0A3B1',
        },
      },
    },
  });
}

/**
 * Créer un graphique de progression bankroll (line chart).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array<number>}     values  — valeurs de la bankroll
 * @param {Array<string>}     labels  — labels (jours, semaines…)
 * @returns {Chart}
 */
export function createBankrollChart(canvas, values, labels) {
  if (!canvas || typeof Chart === 'undefined') return null;
  destroyChart(canvas);

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data:            values,
        borderColor:     '#1D9E75',
        backgroundColor: 'rgba(29,158,117,0.08)',
        borderWidth:     2,
        pointRadius:     3,
        pointBackgroundColor: '#1D9E75',
        tension:         0.4,
        fill:            true,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1A1D27',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor:  '#F0F0F0',
          bodyColor:   '#A0A3B1',
          callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(0)}€` },
        },
      },
      scales: {
        x: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#888780', font: { size: 10 } },
        },
        y: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color:    '#888780',
            font:     { size: 10 },
            callback: v => `${v}€`,
          },
        },
      },
    },
  });
}

/**
 * Générer un cercle SVG de progression (1MT%).
 *
 * @param {number} pct        — pourcentage (0-100)
 * @param {string} [color]    — couleur auto si non fournie
 * @returns {string}          — HTML SVG + label
 */
export function createCircleSVG(pct, color) {
  const r    = 38;
  const circ = 2 * Math.PI * r;
  const off  = circ - (pct / 100) * circ;

  // Couleur par seuil
  let c = color;
  if (!c) {
    if (pct >= 65)      c = '#1D9E75';
    else if (pct >= 50) c = '#7F77DD';
    else                c = '#888780';
  }

  return `
    <svg class="circle-progress__svg" width="100" height="100" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="${r}" fill="none"
        stroke="rgba(255,255,255,0.08)" stroke-width="6"/>
      <circle cx="50" cy="50" r="${r}" fill="none"
        stroke="${c}" stroke-width="6"
        stroke-dasharray="${circ.toFixed(2)}"
        stroke-dashoffset="${off.toFixed(2)}"
        stroke-linecap="round"/>
      <text x="50" y="48" text-anchor="middle"
        font-size="18" font-weight="700" fill="${c}"
        dominant-baseline="middle">${pct}%</text>
      <text x="50" y="66" text-anchor="middle"
        font-size="8" fill="#888780">1MT</text>
    </svg>
  `;
}

/**
 * Détruire le chart existant sur un canvas.
 */
function destroyChart(canvas) {
  if (canvas._chartInstance) {
    canvas._chartInstance.destroy();
    canvas._chartInstance = null;
  }
  // Méthode alternative Chart.js v4
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
}
