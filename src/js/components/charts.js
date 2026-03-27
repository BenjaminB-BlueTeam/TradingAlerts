/**
 * charts.js — Wrappers Chart.js pour FHG Tracker
 */

// Couleurs du design system
const COLORS = {
  green: '#1D9E75',
  orange: '#EF9F27',
  gray: '#444441',
  blue: '#378ADD',
  violet: '#7F77DD',
  danger: '#E24B4A',
  textMuted: '#888780',
  border: 'rgba(255,255,255,0.08)',
};

// Defaults Chart.js
Chart.defaults.color = '#A0A3B1';
Chart.defaults.borderColor = COLORS.border;
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 11;

/**
 * Graphique distribution des buts par tranche de temps
 * La tranche 31-45 est mise en évidence en vert
 *
 * @param {string|HTMLElement} canvasId
 * @param {Object} data - { '0-15': n, '16-30': n, '31-45': n, ... }
 * @param {string} teamName
 * @returns {Chart}
 */
export function createGoalDistributionChart(canvasId, data, teamName = '') {
  const canvas = typeof canvasId === 'string'
    ? document.getElementById(canvasId)
    : canvasId;

  if (!canvas) return null;

  // Détruire le chart existant si présent
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  const labels = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90'];
  const values = labels.map(l => data[l] ?? 0);

  const colors = labels.map(l =>
    l === '31-45' ? COLORS.green : COLORS.gray
  );

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: teamName || 'Buts',
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => `Tranche ${ctx[0].label}`,
            label: ctx => `${ctx.parsed.y} but${ctx.parsed.y > 1 ? 's' : ''}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 } },
        },
        y: {
          grid: { color: COLORS.border },
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            font: { size: 10 },
          },
        },
      },
    },
  });
}

/**
 * Mini sparkline — buts par match récent
 * @param {string|HTMLElement} canvasId
 * @param {Array<number>} values
 */
export function createSparkline(canvasId, values) {
  const canvas = typeof canvasId === 'string'
    ? document.getElementById(canvasId)
    : canvasId;

  if (!canvas) return null;

  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: values.map((_, i) => `M${i + 1}`),
      datasets: [{
        data: values,
        borderColor: COLORS.green,
        backgroundColor: 'rgba(29,158,117,0.1)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: COLORS.green,
        fill: true,
        tension: 0.4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false, beginAtZero: true },
      },
      animation: { duration: 400 },
    },
  });
}

/**
 * Graphique performance personnelle (trades)
 * @param {string|HTMLElement} canvasId
 * @param {Array} trades
 */
export function createPerformanceChart(canvasId, trades) {
  const canvas = typeof canvasId === 'string'
    ? document.getElementById(canvasId)
    : canvasId;

  if (!canvas) return null;

  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  // Calcul ROI cumulé
  let cumul = 0;
  const labels = [];
  const data = [];

  trades.forEach((t, i) => {
    if (t.resultat === 'gagne') cumul += ((t.coteObjectif || 2) - 1) * (t.mise || 1);
    else if (t.resultat === 'perdu') cumul -= (t.mise || 1);
    labels.push(`#${i + 1}`);
    data.push(parseFloat(cumul.toFixed(2)));
  });

  const color = data[data.length - 1] >= 0 ? COLORS.green : COLORS.danger;

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'P&L cumulé (€)',
        data,
        borderColor: color,
        backgroundColor: color === COLORS.green
          ? 'rgba(29,158,117,0.08)'
          : 'rgba(226,75,74,0.08)',
        borderWidth: 2,
        pointRadius: 2,
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `P&L : ${ctx.parsed.y >= 0 ? '+' : ''}${ctx.parsed.y}€`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, maxTicksLimit: 10 },
        },
        y: {
          grid: { color: COLORS.border },
          ticks: {
            callback: v => `${v >= 0 ? '+' : ''}${v}€`,
            font: { size: 10 },
          },
        },
      },
    },
  });
}

/**
 * Donut chart pour taux de réussite
 * @param {string|HTMLElement} canvasId
 * @param {number} pct - pourcentage (0-100)
 */
export function createSuccessDonut(canvasId, pct) {
  const canvas = typeof canvasId === 'string'
    ? document.getElementById(canvasId)
    : canvasId;

  if (!canvas) return null;

  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  const color = pct >= 65 ? COLORS.green : pct >= 50 ? COLORS.orange : COLORS.danger;

  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [pct, 100 - pct],
        backgroundColor: [color, 'rgba(255,255,255,0.06)'],
        borderWidth: 0,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
    },
  });
}

/**
 * SVG Progress Circle (pas de Chart.js, pur SVG)
 * @param {number} pct - pourcentage 0-100
 * @param {string} color - couleur CSS
 * @param {string} label - texte central
 * @param {string} subLabel - sous-texte
 * @returns {string} HTML SVG
 */
export function renderSVGProgressCircle(pct, color, label, subLabel = '') {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  // Couleur selon seuil
  let strokeColor = color;
  if (!color) {
    if (pct >= 65) strokeColor = COLORS.green;
    else if (pct >= 50) strokeColor = COLORS.violet;
    else strokeColor = COLORS.gray;
  }

  return `
    <div class="svg-progress-wrap">
      <div class="svg-progress">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r="${radius}"
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            stroke-width="8"
          />
          <circle
            cx="50" cy="50" r="${radius}"
            fill="none"
            stroke="${strokeColor}"
            stroke-width="8"
            stroke-linecap="round"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${offset}"
            style="transition: stroke-dashoffset 0.6s ease;"
          />
        </svg>
        <div class="svg-progress-text">
          <div class="svg-progress-value" style="color:${strokeColor}">${label}</div>
          ${subLabel ? `<div class="svg-progress-sub">${subLabel}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}
