<script>
  import { onMount, onDestroy } from 'svelte';
  import { Chart } from 'chart.js';
  import { strategyOf } from '$lib/utils/historyFilters.js';

  let { alerts = [] } = $props();

  // ---------- Filtrage interne ----------
  let fhgFort = $derived(
    alerts.filter(
      a => !a.user_excluded &&
        ['validated', 'lost'].includes(a.status) &&
        strategyOf(a) === 'FHG' &&
        a.confidence === 'fort'
    )
  );

  let lg2Fort = $derived(
    alerts.filter(
      a => !a.user_excluded &&
        ['validated', 'lost'].includes(a.status) &&
        strategyOf(a) === 'LG2' &&
        a.confidence === 'fort'
    )
  );

  // ---------- KPI ----------
  let nFhg = $derived(fhgFort.length);
  let nLg2 = $derived(lg2Fort.length);

  let tauxFhg = $derived(
    nFhg >= 3
      ? fhgFort.filter(a => a.status === 'validated').length / nFhg
      : null
  );
  let tauxLg2 = $derived(
    nLg2 >= 3
      ? lg2Fort.filter(a => a.status === 'validated').length / nLg2
      : null
  );

  let coteSeuilFhg = $derived(tauxFhg ? (1 / tauxFhg).toFixed(2) : null);
  let coteSeuillg2 = $derived(tauxLg2 ? (1 / tauxLg2).toFixed(2) : null);

  function toPct(taux) {
    return taux !== null ? Math.round(taux * 100) : null;
  }

  function pctColor(pct) {
    if (pct === null) return 'var(--color-text-muted)';
    if (pct >= 65) return 'var(--color-accent-green)';
    if (pct >= 50) return 'var(--color-signal-moyen)';
    return 'var(--color-text-muted)';
  }

  // ---------- ROI ----------
  const COTES = Array.from({ length: 19 }, (_, i) => +(1.20 + i * 0.10).toFixed(2));
  const COTE_LABELS = COTES.map(c => c.toFixed(2));

  function roiData(taux) {
    if (taux === null) return COTES.map(() => null);
    return COTES.map(c => +((taux * (c - 1) - (1 - taux)) * 100).toFixed(2));
  }

  // ---------- Slider ----------
  let targetCote = $state(2.00);

  let roiFhgSlider = $derived(
    tauxFhg !== null
      ? +((tauxFhg * (targetCote - 1) - (1 - tauxFhg)) * 100).toFixed(1)
      : null
  );
  let roiLg2Slider = $derived(
    tauxLg2 !== null
      ? +((tauxLg2 * (targetCote - 1) - (1 - tauxLg2)) * 100).toFixed(1)
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
  let open = $state(true);

  function draw() {
    if (!canvas) return;
    if (chart) { chart.destroy(); chart = null; }

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: COTE_LABELS,
        datasets: [
          {
            label: 'FHG Fort',
            data: roiData(tauxFhg),
            borderColor: '#1D9E75',
            backgroundColor: 'rgba(29,158,117,0.08)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.3,
            fill: false,
          },
          {
            label: 'LG2 Fort',
            data: roiData(tauxLg2),
            borderColor: '#E24B4A',
            backgroundColor: 'rgba(226,75,74,0.08)',
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
    alerts;
    tauxFhg;
    tauxLg2;
    if (open && canvas) draw();
  });

  onMount(() => { if (open) draw(); });
  onDestroy(() => { if (chart) chart.destroy(); });

  // ---------- Tabs ----------
  let activeTab = $state('ligue');

  // ---------- Par ligue ----------
  function aggregateByLeague(fhgAlerts, lg2Alerts) {
    const map = new Map();

    for (const a of fhgAlerts) {
      const key = a.league_name;
      if (!key) continue;
      if (!map.has(key)) map.set(key, { league: key, fhg: { v: 0, t: 0 }, lg2: { v: 0, t: 0 } });
      const e = map.get(key);
      e.fhg.t++;
      if (a.status === 'validated') e.fhg.v++;
    }
    for (const a of lg2Alerts) {
      const key = a.league_name;
      if (!key) continue;
      if (!map.has(key)) map.set(key, { league: key, fhg: { v: 0, t: 0 }, lg2: { v: 0, t: 0 } });
      const e = map.get(key);
      e.lg2.t++;
      if (a.status === 'validated') e.lg2.v++;
    }

    return [...map.values()]
      .filter(e => e.fhg.t >= 2 || e.lg2.t >= 2)
      .sort((a, b) => {
        const ra = a.fhg.t ? a.fhg.v / a.fhg.t : NaN;
        const rb = b.fhg.t ? b.fhg.v / b.fhg.t : NaN;
        if (isNaN(ra) && isNaN(rb)) return 0;
        if (isNaN(ra)) return 1;
        if (isNaN(rb)) return -1;
        return rb - ra;
      });
  }

  let leagueRows = $derived(aggregateByLeague(fhgFort, lg2Fort));

  // ---------- Par équipe ----------
  function aggregateTeamData(fortAlerts, strategy) {
    const map = new Map();
    for (const a of fortAlerts) {
      if (strategyOf(a) !== strategy || a.confidence !== 'fort') continue;
      if (!['validated', 'lost'].includes(a.status)) continue;
      if (a.user_excluded) continue;
      for (const name of [a.home_team_name, a.away_team_name]) {
        if (!name) continue;
        if (!map.has(name)) map.set(name, { name, v: 0, t: 0 });
        const e = map.get(name);
        e.t++;
        if (a.status === 'validated') e.v++;
      }
    }
    return [...map.values()].filter(e => e.t >= 2);
  }

  let teamFhg = $derived(aggregateTeamData(fhgFort, 'FHG'));
  let teamLg2 = $derived(aggregateTeamData(lg2Fort, 'LG2'));

  // Merge par équipe pour la table combinée
  function mergeTeamRows(fhgRows, lg2Rows) {
    const map = new Map();
    for (const r of fhgRows) {
      map.set(r.name, { name: r.name, fhg: r, lg2: null });
    }
    for (const r of lg2Rows) {
      if (map.has(r.name)) map.get(r.name).lg2 = r;
      else map.set(r.name, { name: r.name, fhg: null, lg2: r });
    }
    return [...map.values()].sort((a, b) => {
      const ra = a.fhg ? a.fhg.v / a.fhg.t : NaN;
      const rb = b.fhg ? b.fhg.v / b.fhg.t : NaN;
      if (isNaN(ra) && isNaN(rb)) return 0;
      if (isNaN(ra)) return 1;
      if (isNaN(rb)) return -1;
      return rb - ra;
    });
  }

  let teamRows = $derived(mergeTeamRows(teamFhg, teamLg2));

  // ---------- Helpers affichage ----------
  function cellData(entry) {
    if (!entry || entry.t === 0) return null;
    const pct = Math.round((entry.v / entry.t) * 100);
    const seuil = (1 / (entry.v / entry.t)).toFixed(2);
    return { v: entry.v, t: entry.t, pct, seuil };
  }
</script>

<div class="analytix-block">
  <button
    type="button"
    class="analytix-header"
    onclick={() => (open = !open)}
    aria-expanded={open}
  >
    <span class="analytix-title">Bet Analytix</span>
    <span class="analytix-meta">Rentabilite par cote et strategie</span>
    <span class="chevron" class:chevron--open={open}>&#8250;</span>
  </button>

  {#if open}
    <div class="analytix-body">

      <!-- KPI ROW -->
      <div class="kpi-row">
        <!-- FHG Fort -->
        <div class="kpi-badge">
          <span class="kpi-badge__label">FHG Fort</span>
          {#if nFhg < 3}
            <span class="kpi-badge__value" style:color="var(--color-text-muted)">{nFhg} alerte{nFhg > 1 ? 's' : ''}</span>
            <span class="kpi-badge__sub">(donnees insuffisantes)</span>
          {:else}
            <span class="kpi-badge__value" style:color={pctColor(toPct(tauxFhg))}>{toPct(tauxFhg)}%</span>
            <span class="kpi-badge__sub">{nFhg} alertes</span>
          {/if}
        </div>

        <!-- LG2 Fort -->
        <div class="kpi-badge">
          <span class="kpi-badge__label">LG2 Fort</span>
          {#if nLg2 < 3}
            <span class="kpi-badge__value" style:color="var(--color-text-muted)">{nLg2} alerte{nLg2 > 1 ? 's' : ''}</span>
            <span class="kpi-badge__sub">(donnees insuffisantes)</span>
          {:else}
            <span class="kpi-badge__value" style:color={pctColor(toPct(tauxLg2))}>{toPct(tauxLg2)}%</span>
            <span class="kpi-badge__sub">{nLg2} alertes</span>
          {/if}
        </div>

        <!-- Cote seuil FHG -->
        <div class="kpi-badge">
          <span class="kpi-badge__label">Cote seuil FHG</span>
          {#if coteSeuilFhg}
            <span class="kpi-badge__value" style:color="var(--color-text-primary)">{coteSeuilFhg}</span>
            <span class="kpi-badge__sub">rentable au-dessus</span>
          {:else}
            <span class="kpi-badge__value" style:color="var(--color-text-muted)">—</span>
            <span class="kpi-badge__sub">(donnees insuffisantes)</span>
          {/if}
        </div>

        <!-- Cote seuil LG2 -->
        <div class="kpi-badge">
          <span class="kpi-badge__label">Cote seuil LG2</span>
          {#if coteSeuillg2}
            <span class="kpi-badge__value" style:color="var(--color-text-primary)">{coteSeuillg2}</span>
            <span class="kpi-badge__sub">rentable au-dessus</span>
          {:else}
            <span class="kpi-badge__value" style:color="var(--color-text-muted)">—</span>
            <span class="kpi-badge__sub">(donnees insuffisantes)</span>
          {/if}
        </div>
      </div>

      <!-- ROI CHART -->
      <div class="chart-wrap">
        <canvas bind:this={canvas}></canvas>
      </div>

      <!-- SLIDER -->
      <div class="slider-block">
        <label class="slider-label" for="cote-slider">
          Cote simulee : <strong>{(+targetCote).toFixed(2)}</strong>
        </label>
        <input
          id="cote-slider"
          type="range"
          min="1.20"
          max="3.00"
          step="0.05"
          bind:value={targetCote}
          class="slider"
        />
        <div class="slider-results">
          <span>
            FHG :
            <strong style:color={roiColor(roiFhgSlider)}>{formatRoi(roiFhgSlider)}</strong>
          </span>
          <span class="sep">|</span>
          <span>
            LG2 :
            <strong style:color={roiColor(roiLg2Slider)}>{formatRoi(roiLg2Slider)}</strong>
          </span>
        </div>
      </div>

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
          <p class="empty-msg">Pas encore de donnees (minimum 2 alertes terminees par ligue)</p>
        {:else}
          <table class="analytix-table">
            <thead>
              <tr>
                <th>Ligue</th>
                <th>FHG Fort</th>
                <th>LG2 Fort</th>
              </tr>
            </thead>
            <tbody>
              {#each leagueRows as row}
                {@const fhgCell = cellData(row.fhg)}
                {@const lg2Cell = cellData(row.lg2)}
                <tr>
                  <td class="td-league">{row.league}</td>
                  <td>
                    {#if fhgCell}
                      <span style:color={pctColor(fhgCell.pct)}>{fhgCell.pct}%</span>
                      <span class="td-sub">{fhgCell.v}/{fhgCell.t} · cote {fhgCell.seuil}</span>
                    {:else}
                      <span class="td-empty">—</span>
                    {/if}
                  </td>
                  <td>
                    {#if lg2Cell}
                      <span style:color={pctColor(lg2Cell.pct)}>{lg2Cell.pct}%</span>
                      <span class="td-sub">{lg2Cell.v}/{lg2Cell.t} · cote {lg2Cell.seuil}</span>
                    {:else}
                      <span class="td-empty">—</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}

      <!-- TABLE PAR EQUIPE -->
      {:else}
        {#if teamRows.length === 0}
          <p class="empty-msg">Pas encore de donnees (minimum 2 alertes terminees par equipe)</p>
        {:else}
          <table class="analytix-table">
            <thead>
              <tr>
                <th>Equipe</th>
                <th>FHG Fort</th>
                <th>LG2 Fort</th>
              </tr>
            </thead>
            <tbody>
              {#each teamRows as row}
                {@const fhgCell = cellData(row.fhg)}
                {@const lg2Cell = cellData(row.lg2)}
                <tr>
                  <td class="td-league">{row.name}</td>
                  <td>
                    {#if fhgCell}
                      <span style:color={pctColor(fhgCell.pct)}>{fhgCell.pct}%</span>
                      <span class="td-sub">{fhgCell.v}/{fhgCell.t} · cote {fhgCell.seuil}</span>
                    {:else}
                      <span class="td-empty">—</span>
                    {/if}
                  </td>
                  <td>
                    {#if lg2Cell}
                      <span style:color={pctColor(lg2Cell.pct)}>{lg2Cell.pct}%</span>
                      <span class="td-sub">{lg2Cell.v}/{lg2Cell.t} · cote {lg2Cell.seuil}</span>
                    {:else}
                      <span class="td-empty">—</span>
                    {/if}
                  </td>
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
  .analytix-block {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    margin-top: 12px;
    overflow: hidden;
  }

  .analytix-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    cursor: pointer;
    background: none;
    border: none;
    text-align: left;
  }
  .analytix-header:hover {
    background: rgba(255,255,255,0.02);
  }

  .analytix-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text-primary);
  }
  .analytix-meta {
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
  }
  .chevron--open {
    transform: rotate(-90deg);
  }

  .analytix-body {
    padding: 12px 14px 16px;
    border-top: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* KPI row */
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
  .kpi-badge__sub {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  /* Chart */
  .chart-wrap {
    position: relative;
    height: 220px;
  }

  /* Slider */
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
  .slider-results {
    font-size: 12px;
    color: var(--color-text-secondary);
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .sep {
    color: var(--color-text-muted);
  }

  /* Tabs */
  .tabs-row {
    display: flex;
    gap: 6px;
  }

  /* Table */
  .analytix-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .analytix-table thead th {
    text-align: left;
    padding: 5px 8px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border);
  }
  .analytix-table tbody tr {
    border-bottom: 1px solid var(--color-border);
  }
  .analytix-table tbody tr:last-child {
    border-bottom: none;
  }
  .analytix-table tbody tr:hover {
    background: rgba(255,255,255,0.02);
  }
  .analytix-table td {
    padding: 6px 8px;
    vertical-align: middle;
    color: var(--color-text-primary);
  }
  .td-league {
    color: var(--color-text-secondary);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .td-sub {
    display: block;
    font-size: 10px;
    color: var(--color-text-muted);
    margin-top: 1px;
  }
  .td-empty {
    color: var(--color-text-muted);
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
    .td-league { max-width: 120px; }
  }
</style>
