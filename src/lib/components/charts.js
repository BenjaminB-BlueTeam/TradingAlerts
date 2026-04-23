/* ================================================
   charts.js — Wrappers Chart.js
   FHG Tracker
   ================================================ */

import {
  Chart,
  BarController,
  DoughnutController,
  LineController,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  Filler,
} from 'chart.js';

Chart.register(
  BarController,
  DoughnutController,
  LineController,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  Filler,
);

export function createGoalDistChart(canvas, dist) {
  if (!canvas) return null;

  const labels = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90'];
  const data   = labels.map(l => dist[l] || 0);

  const colors = labels.map(l =>
    l === '31-45' ? 'rgba(29,158,117,0.85)' : 'rgba(68,68,65,0.75)'
  );
  const borderColors = labels.map(l =>
    l === '31-45' ? '#1D9E75' : '#444441'
  );

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

export function createWinRateChart(canvas, gagnes, total) {
  if (!canvas) return null;

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

export function createBankrollChart(canvas, values, labels) {
  if (!canvas) return null;
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

export function createCircleSVG(pct, color) {
  const r    = 38;
  const circ = 2 * Math.PI * r;
  const off  = circ - (pct / 100) * circ;

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

function destroyChart(canvas) {
  if (canvas._chartInstance) {
    canvas._chartInstance.destroy();
    canvas._chartInstance = null;
  }
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
}

// ============================================================
// Helpers génériques pour /historique (refonte dashboard)
// ============================================================

const TOOLTIP_STYLE = {
  backgroundColor: '#1A1D27',
  borderColor: 'rgba(255,255,255,0.1)',
  borderWidth: 1,
  titleColor: '#F0F0F0',
  bodyColor: '#A0A3B1',
};
const AXIS_STYLE = {
  grid: { color: 'rgba(255,255,255,0.04)' },
  ticks: { color: '#888780', font: { size: 11 } },
};

/**
 * Line chart multi-séries pour l'évolution des taux.
 * datasets = [{ label, data: [{x, y}], color }]
 */
export function makeLineChart(canvas, { labels, datasets }) {
  if (!canvas) return null;
  destroyChart(canvas);
  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map(d => ({
        label: d.label,
        data: d.data,
        borderColor: d.color,
        backgroundColor: d.color + '20',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: d.color,
        tension: 0.3,
        spanGaps: true,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#A0A3B1', font: { size: 11 } } },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: ctx => {
              const raw = ctx.raw;
              if (raw == null || raw.y == null) return ` ${ctx.dataset.label}: —`;
              const { v, t } = raw;
              return ` ${ctx.dataset.label}: ${raw.y}%  (${v ?? 0}/${t ?? 0})`;
            },
          },
        },
      },
      scales: {
        x: AXIS_STYLE,
        y: { ...AXIS_STYLE, beginAtZero: true, max: 100, ticks: { ...AXIS_STYLE.ticks, callback: v => `${v}%` } },
      },
    },
  });
  canvas._chartInstance = chart;
  return chart;
}

/**
 * Stacked bar chart (validés / perdus par stratégie).
 * datasets = [{ label: 'Validés', data, color }, { label: 'Perdus', data, color }]
 */
export function makeStackedBarChart(canvas, { labels, datasets }) {
  if (!canvas) return null;
  destroyChart(canvas);
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map(d => ({
        label: d.label,
        data: d.data,
        backgroundColor: d.color,
        borderColor: d.border || d.color,
        borderWidth: 1,
        borderRadius: 4,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#A0A3B1', font: { size: 11 } } },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}`,
          },
        },
      },
      scales: {
        x: { ...AXIS_STYLE, stacked: true },
        y: { ...AXIS_STYLE, stacked: true, beginAtZero: true, ticks: { ...AXIS_STYLE.ticks, stepSize: 1 } },
      },
    },
  });
  canvas._chartInstance = chart;
  return chart;
}

/**
 * Horizontal bar chart (top équipes / ligues par taux).
 * rows = [{ label, pct, total, validated, lost }]
 */
export function makeHorizontalBarChart(canvas, rows) {
  if (!canvas) return null;
  destroyChart(canvas);
  const colors = rows.map(r => (r.pct >= 65 ? '#1D9E75' : r.pct >= 50 ? '#EF9F27' : '#E24B4A'));
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.label),
      datasets: [{
        data: rows.map(r => r.pct),
        backgroundColor: colors.map(c => c + 'AA'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: ctx => {
              const r = rows[ctx.dataIndex];
              return ` ${r.pct}%  (${r.validated}/${r.total})`;
            },
          },
        },
      },
      scales: {
        x: { ...AXIS_STYLE, beginAtZero: true, max: 100, ticks: { ...AXIS_STYLE.ticks, callback: v => `${v}%` } },
        y: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, font: { size: 10 } } },
      },
    },
  });
  canvas._chartInstance = chart;
  return chart;
}

export { destroyChart };
