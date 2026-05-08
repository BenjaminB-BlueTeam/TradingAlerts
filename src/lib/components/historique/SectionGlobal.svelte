<script>
  import { onMount, onDestroy } from 'svelte';
  import { Chart } from 'chart.js';
  import { strategyOf } from '$lib/utils/historyFilters.js';
  import { fetchAlertTrades } from '$lib/api/supabase.js';

  let { alerts = [], strategy = 'LG1' } = $props();

  let trades = $state([]);

  // ---------- Filtrage interne ----------
  let fortAlerts = $derived(
    alerts.filter(
      a => !a.user_excluded &&
        ['validated', 'lost'].includes(a.status) &&
        a.confidence === 'fort' &&
        strategyOf(a) === strategy
    )
  );

  // ---------- KPI ----------
  let n = $derived(fortAlerts.length);
  let taux = $derived(
    n >= 3
      ? fortAlerts.filter(a => a.status === 'validated').length / n
      : null
  );
  let coteSeuil = $derived(taux ? (1 / taux).toFixed(2) : null);

  function pctColor(pct) {
    if (pct === null) return 'var(--color-text-muted)';
    if (pct >= 65) return 'var(--color-accent-green)';
    if (pct >= 50) return 'var(--color-signal-moyen)';
    return 'var(--color-text-muted)';
  }

  // ---------- Meilleures/pires ligues ----------
  let leagueStats = $derived((() => {
    const map = new Map();
    for (const a of fortAlerts) {
      const key = a.league_name;
      if (!key) continue;
      if (!map.has(key)) map.set(key, { v: 0, t: 0 });
      const e = map.get(key);
      e.t++;
      if (a.status === 'validated') e.v++;
    }
    return [...map.entries()]
      .filter(([, e]) => e.t >= 3)
      .map(([league, e]) => ({ league, taux: e.v / e.t, v: e.v, t: e.t }))
      .sort((a, b) => b.taux - a.taux);
  })());

  let bestLeague = $derived(leagueStats.length > 0 ? leagueStats[0].league : null);
  let worstLeague = $derived(leagueStats.length > 0 ? leagueStats[leagueStats.length - 1].league : null);

  // ---------- ROI ----------
  const COTES = Array.from({ length: 19 }, (_, i) => +(1.20 + i * 0.10).toFixed(2));
  const COTE_LABELS = COTES.map(c => c.toFixed(2));

  const STRATEGY_COLOR = { LG1: '#1D9E75', LG2: '#E24B4A' };

  function roiData(t) {
    if (t === null) return COTES.map(() => null);
    return COTES.map(c => +((t * (c - 1) - (1 - t)) * 100).toFixed(2));
  }

  // ---------- Slider ----------
  let targetCote = $state(2.00);

  let roiSlider = $derived(
    taux !== null
      ? +((taux * (targetCote - 1) - (1 - taux)) * 100).toFixed(1)
      : null
  );

  function formatRoi(val) {
    if (val === null) return '—';
    return (val >= 0 ? '+' : '') + val.toFixed(1) + '%';
  }
  function roiColor(val) {
    if (val === null) return 'var(--color-text-muted)';
    return val >= 0 ? 'var(--color-accent-green)' : 'var(--color-danger)';
  }

  // ---------- Chart ----------
  let canvas;
  let chart = null;
  let open = $state(false);
  const color = STRATEGY_COLOR[strategy] || '#1D9E75';

  function draw() {
    if (!canvas) return;
    if (chart) { chart.destroy(); chart = null; }

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: COTE_LABELS,
        datasets: [
          {
            label: `${strategy} Fort`,
            data: roiData(taux),
            borderColor: color,
            backgroundColor: color + '14',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.3,
            fill: false,
          },
          {
            label: 'Equilibre',
            data: COTES.map(() => 0),
            borderColor: 'rgba(255,255,255,0.3)',
            borderWidth: 1,
            borderDash: [4, 4],
            pointRadius: 0,
            tension: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#A0A3B1',
              font: { size: 11 },
              filter: item => item.text !== 'Equilibre',
            },
          },
          tooltip: {
            backgroundColor: '#1A1D27',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleColor: '#F0F0F0',
            bodyColor: '#A0A3B1',
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) + '%' : '—'}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#888780', font: { size: 11 } },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              color: '#888780',
              font: { size: 11 },
              callback: v => v.toFixed(0) + '%',
            },
          },
        },
      },
    });
  }

  $effect(() => {
    fortAlerts;
    taux;
    if (open && canvas) draw();
  });

  onMount(async () => {
    trades = await fetchAlertTrades();
    if (open) draw();
  });
  onDestroy(() => { if (chart) chart.destroy(); });

  // ---------- P&L réel (depuis alert_trades) ----------
  let realPnl = $derived.by(() => {
    let totalPnl = 0;
    let totalMise = 0;
    let hasData = false;
    const terminated = new Set(fortAlerts.filter(a => ['validated','lost'].includes(a.status)).map(a => a.match_id + ':' + a.signal_type));
    for (const t of trades) {
      if (!t.mise) continue;
      const key = t.match_id + ':' + t.signal_type;
      if (!terminated.has(key)) continue;
      const alert = fortAlerts.find(a => a.match_id === t.match_id && a.signal_type === t.signal_type);
      if (!alert) continue;
      hasData = true;
      totalMise += +t.mise;
      if (alert.status === 'validated') totalPnl += +t.mise * (+t.cote - 1);
      else if (alert.status === 'lost') totalPnl -= +t.mise;
    }
    if (!hasData) return null;
    return { pnl: +totalPnl.toFixed(2), mise: +totalMise.toFixed(2), roi: totalMise > 0 ? +(totalPnl / totalMise * 100).toFixed(1) : null };
  });

  function formatPnl(val) {
    if (val === null) return '—';
    return (val >= 0 ? '+' : '') + val.toFixed(2) + '€';
  }
  function pnlColor(val) {
    if (val === null) return 'var(--color-text-muted)';
    return val >= 0 ? 'var(--color-accent-green)' : 'var(--color-danger)';
  }

  // ---------- Tabs ----------
  let activeTab = $state('ligue');

  // ---------- Par ligue ----------
  let leagueRows = $derived((() => {
    const map = new Map();
    for (const a of fortAlerts) {
      const key = a.league_name;
      if (!key) continue;
      if (!map.has(key)) map.set(key, { league: key, v: 0, t: 0 });
      const e = map.get(key);
      e.t++;
      if (a.status === 'validated') e.v++;
    }
    return [...map.values()]
      .filter(e => e.t >= 2)
      .map(e => ({ ...e, pct: Math.round(e.v / e.t * 100), seuil: (1 / (e.v / e.t)).toFixed(2) }))
      .sort((a, b) => b.pct - a.pct);
  })());

  // ---------- Par équipe ----------
  let teamRows = $derived((() => {
    const map = new Map();
    for (const a of fortAlerts) {
      for (const name of [a.home_team_name, a.away_team_name]) {
        if (!name) continue;
        if (!map.has(name)) map.set(name, { name, v: 0, t: 0 });
        const e = map.get(name);
        e.t++;
        if (a.status === 'validated') e.v++;
      }
    }
    return [...map.values()]
      .filter(e => e.t >= 2)
      .map(e => ({ ...e, pct: Math.round(e.v / e.t * 100), seuil: (1 / (e.v / e.t)).toFixed(2) }))
      .sort((a, b) => b.pct - a.pct);
  })());

  const sectionTitle = `${strategy} Fort — Global`;
</script>

<div class="section-block">
  <button
    type="button"
    class="section-header"
    onclick={() => {
      open = !open;
      if (open) setTimeout(() => draw(), 10);
    }}
    aria-expanded={open}
  >
    <span class="section-title">Statistiques {sectionTitle}</span>
    <span class="section-meta">{n} alerte{n !== 1 ? 's' : ''} terminée{n !== 1 ? 's' : ''}</span>
    <span class="chevron" class:chevron--open={open}>&#8250;</span>
  </button>

  {#if open}
    <div class="section-body">

      <!-- KPI ROW -->
      <div class="kpi-row">
        <div class="kpi-badge">
          <span class="kpi-badge__label">{strategy} Fort</span>
          {#if n < 3}
            <span class="kpi-badge__value" style:color="var(--color-text-muted)">{n} alerte{n !== 1 ? 's' : ''}</span>
            <span class="kpi-badge__sub">donnees insuffisantes</span>
          {:else}
            <span class="kpi-badge__value" style:color={pctColor(Math.round(taux * 100))}>{Math.round(taux * 100)}%</span>
            <span class="kpi-badge__sub">{n} alertes</span>
          {/if}
        </div>

        <div class="kpi-badge">
          <span class="kpi-badge__label">Cote seuil</span>
          {#if coteSeuil}
            <span class="kpi-badge__value" style:color="var(--color-text-primary)">{coteSeuil}</span>
            <span class="kpi-badge__sub">rentable au-dessus</span>
          {:else}
            <span class="kpi-badge__value" style:color="var(--color-text-muted)">—</span>
            <span class="kpi-badge__sub">donnees insuffisantes</span>
          {/if}
        </div>

        <div class="kpi-badge">
          <span class="kpi-badge__label">Meilleure ligue</span>
          {#if bestLeague && bestLeague !== worstLeague}
            <span class="kpi-badge__value kpi-badge__value--sm" style:color="var(--color-accent-green)">{bestLeague}</span>
            <span class="kpi-badge__sub">taux le plus haut (min 3)</span>
          {:else}
            <span class="kpi-badge__value" style:color="var(--color-text-muted)">—</span>
            <span class="kpi-badge__sub">min 3 alertes/ligue</span>
          {/if}
        </div>

        <div class="kpi-badge">
          <span class="kpi-badge__label">Pire ligue</span>
          {#if worstLeague && bestLeague !== worstLeague}
            <span class="kpi-badge__value kpi-badge__value--sm" style:color="var(--color-danger)">{worstLeague}</span>
            <span class="kpi-badge__sub">taux le plus bas (min 3)</span>
          {:else}
            <span class="kpi-badge__value" style:color="var(--color-text-muted)">—</span>
            <span class="kpi-badge__sub">min 3 alertes/ligue</span>
          {/if}
        </div>

        <div class="kpi-badge">
          <span class="kpi-badge__label">P&amp;L réel</span>
          {#if realPnl !== null}
            <span class="kpi-badge__value" style:color={pnlColor(realPnl.pnl)}>{formatPnl(realPnl.pnl)}</span>
            <span class="kpi-badge__sub">{realPnl.mise.toFixed(2)}€ misés</span>
          {:else}
            <span class="kpi-badge__value" style:color="var(--color-text-muted)">—</span>
            <span class="kpi-badge__sub">aucune mise saisie</span>
          {/if}
        </div>

        <div class="kpi-badge">
          <span class="kpi-badge__label">ROI réel</span>
          {#if realPnl?.roi !== null && realPnl !== null}
            <span class="kpi-badge__value" style:color={pnlColor(realPnl.roi)}>{realPnl.roi >= 0 ? '+' : ''}{realPnl.roi}%</span>
            <span class="kpi-badge__sub">sur mise totale</span>
          {:else}
            <span class="kpi-badge__value" style:color="var(--color-text-muted)">—</span>
            <span class="kpi-badge__sub">aucune mise saisie</span>
          {/if}
        </div>
      </div>

      <!-- ROI CHART -->
      {#if taux !== null}
        <div class="chart-wrap">
          <canvas bind:this={canvas}></canvas>
        </div>

        <!-- SLIDER -->
        <div class="slider-block">
          <label class="slider-label" for="slider-{strategy}">
            Cote simulee : <strong>{(+targetCote).toFixed(2)}</strong>
          </label>
          <input
            id="slider-{strategy}"
            type="range"
            min="1.20"
            max="3.00"
            step="0.05"
            bind:value={targetCote}
            class="slider"
          />
          <div class="slider-result">
            Cote {(+targetCote).toFixed(2)} &rarr; ROI :
            <strong style:color={roiColor(roiSlider)}>{formatRoi(roiSlider)}</strong>
            <span class="slider-sub">(sur {n} alertes)</span>
          </div>
        </div>
      {:else}
        <p class="empty-msg">Pas encore assez de donnees pour le graphique (min 3 alertes terminees)</p>
      {/if}

      <!-- TABS -->
      <div class="tabs-row">
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          class:btn--active={activeTab === 'ligue'}
          onclick={() => (activeTab = 'ligue')}
        >Par ligue</button>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          class:btn--active={activeTab === 'equipe'}
          onclick={() => (activeTab = 'equipe')}
        >Par equipe</button>
      </div>

      <!-- TABLE PAR LIGUE -->
      {#if activeTab === 'ligue'}
        {#if leagueRows.length === 0}
          <p class="empty-msg">Pas encore de donnees (min 2 alertes terminees par ligue)</p>
        {:else}
          <table class="data-table">
            <thead>
              <tr>
                <th>Ligue</th>
                <th>V/T</th>
                <th>Taux</th>
                <th>Cote seuil</th>
              </tr>
            </thead>
            <tbody>
              {#each leagueRows as row}
                <tr>
                  <td class="td-name">{row.league}</td>
                  <td class="td-num">{row.v}/{row.t}</td>
                  <td class="td-num"><span style:color={pctColor(row.pct)}>{row.pct}%</span></td>
                  <td class="td-num">{row.seuil}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}

      <!-- TABLE PAR EQUIPE -->
      {:else}
        {#if teamRows.length === 0}
          <p class="empty-msg">Pas encore de donnees (min 2 alertes terminees par equipe)</p>
        {:else}
          <table class="data-table">
            <thead>
              <tr>
                <th>Equipe</th>
                <th>V/T</th>
                <th>Taux</th>
                <th>Cote seuil</th>
              </tr>
            </thead>
            <tbody>
              {#each teamRows as row}
                <tr>
                  <td class="td-name">{row.name}</td>
                  <td class="td-num">{row.v}/{row.t}</td>
                  <td class="td-num"><span style:color={pctColor(row.pct)}>{row.pct}%</span></td>
                  <td class="td-num">{row.seuil}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      {/if}

    </div>
  {/if}
</div>

<style>
  .section-block {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    margin-top: 12px;
    overflow: hidden;
  }

  .section-header {
    width: 100%;
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 10px 14px;
    cursor: pointer;
    background: none;
    border: none;
    text-align: left;
  }
  .section-header:hover {
    background: rgba(255,255,255,0.02);
  }

  .section-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text-primary);
  }
  .section-meta {
    font-size: 11px;
    color: var(--color-text-muted);
    flex: 1;
  }

  .chevron {
    color: var(--color-text-muted);
    font-size: 18px;
    line-height: 1;
    transform: rotate(90deg);
    transition: transform var(--transition-fast);
    display: inline-block;
    align-self: center;
  }
  .chevron--open {
    transform: rotate(-90deg);
  }

  .section-body {
    padding: 12px 14px 16px;
    border-top: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .kpi-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .kpi-badge {
    flex: 1;
    min-width: 120px;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .kpi-badge__label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted);
  }
  .kpi-badge__value {
    font-size: 22px;
    font-weight: 700;
    line-height: 1.2;
  }
  .kpi-badge__value--sm {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kpi-badge__sub {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .chart-wrap {
    position: relative;
    height: 200px;
  }

  .slider-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .slider-label {
    font-size: 12px;
    color: var(--color-text-secondary);
  }
  .slider {
    width: 100%;
    accent-color: var(--color-accent-blue);
    cursor: pointer;
  }
  .slider-result {
    font-size: 12px;
    color: var(--color-text-secondary);
  }
  .slider-sub {
    color: var(--color-text-muted);
    margin-left: 4px;
  }

  .tabs-row {
    display: flex;
    gap: 6px;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .data-table thead th {
    text-align: left;
    padding: 5px 8px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border);
  }
  .data-table tbody tr {
    border-bottom: 1px solid var(--color-border);
  }
  .data-table tbody tr:last-child {
    border-bottom: none;
  }
  .data-table tbody tr:hover {
    background: rgba(255,255,255,0.02);
  }
  .data-table td {
    padding: 6px 8px;
    vertical-align: middle;
    color: var(--color-text-primary);
  }
  .td-name {
    color: var(--color-text-secondary);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .td-num {
    text-align: right;
    white-space: nowrap;
  }

  .empty-msg {
    font-size: 12px;
    color: var(--color-text-muted);
    padding: 8px 0;
  }

  @media (max-width: 640px) {
    .kpi-row { gap: 8px; }
    .kpi-badge { min-width: 100px; }
    .kpi-badge__value { font-size: 18px; }
    .td-name { max-width: 120px; }
  }
</style>
