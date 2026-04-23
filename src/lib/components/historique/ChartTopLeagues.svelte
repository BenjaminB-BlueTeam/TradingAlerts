<script>
  import { onMount, onDestroy } from 'svelte';
  import { makeHorizontalBarChart } from '$lib/components/charts.js';
  import { aggregateByLeague } from '$lib/utils/historyFilters.js';

  let { alerts = [], minMatches = 3, topN = 10 } = $props();

  let canvas;
  let chart;

  function draw() {
    if (!canvas) return;
    const rows = aggregateByLeague(alerts, { minMatches, topN });
    chart = makeHorizontalBarChart(canvas, rows.map(r => ({
      label: r.leagueName,
      pct: r.pct,
      total: r.total,
      validated: r.validated,
      lost: r.lost,
    })));
  }

  $effect(() => { alerts; minMatches; topN; draw(); });

  onMount(() => draw());
  onDestroy(() => { if (chart) chart.destroy(); });

  let hasData = $derived(aggregateByLeague(alerts, { minMatches, topN }).length > 0);
</script>

<div class="chart-card">
  <div class="chart-card__header">
    <h3 class="chart-title">Top {topN} ligues</h3>
    <span class="muted">min {minMatches} matchs</span>
  </div>
  <div class="chart-body">
    {#if !hasData}
      <div class="empty">Pas assez de données</div>
    {/if}
    <canvas bind:this={canvas}></canvas>
  </div>
</div>

<style>
  .chart-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .chart-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .chart-title {
    font-size: 13px;
    font-weight: 700;
    margin: 0;
    color: var(--color-text-primary);
  }
  .muted { font-size: 11px; color: var(--color-text-muted); }
  .chart-body { position: relative; height: 280px; }
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    font-size: 12px;
    z-index: 1;
    pointer-events: none;
  }
</style>
