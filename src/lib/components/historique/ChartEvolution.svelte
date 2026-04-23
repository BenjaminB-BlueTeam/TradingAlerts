<script>
  import { onMount, onDestroy } from 'svelte';
  import { makeLineChart } from '$lib/components/charts.js';
  import { aggregateByDate, rateForBuckets } from '$lib/utils/historyFilters.js';

  let { alerts = [], strategy = 'tous', granularity = $bindable('jour') } = $props();

  const GRAN_OPTIONS = [
    { key: 'jour', label: 'Jour' },
    { key: 'mois', label: 'Mois' },
    { key: 'annee', label: 'Année' },
  ];

  let canvas;
  let chart;

  const STRAT_COLOR = { FHG: '#1D9E75', DC: '#EF9F27', LG2: '#E24B4A' };

  function buildDatasets(buckets, visibleStrategies) {
    return visibleStrategies.map(s => ({
      label: s,
      color: STRAT_COLOR[s],
      data: rateForBuckets(buckets, s).map(r => ({
        x: r.bucket,
        y: r.pct,
        v: r.v,
        t: r.t,
      })),
    }));
  }

  function draw() {
    if (!canvas) return;
    const buckets = aggregateByDate(alerts, granularity);
    const labels = buckets.map(b => b.bucket);
    const visible = strategy === 'tous'
      ? ['FHG', 'DC', 'LG2']
      : [strategy.toUpperCase()];
    const datasets = buildDatasets(buckets, visible);
    chart = makeLineChart(canvas, { labels, datasets });
  }

  $effect(() => { alerts; strategy; granularity; draw(); });

  onMount(() => draw());
  onDestroy(() => { if (chart) chart.destroy(); });
</script>

<div class="chart-card">
  <div class="chart-card__header">
    <h3 class="chart-title">Évolution du taux</h3>
    <div class="gran-switcher">
      {#each GRAN_OPTIONS as g}
        <button type="button" class="gran-btn" class:active={granularity === g.key}
          onclick={() => granularity = g.key}>{g.label}</button>
      {/each}
    </div>
  </div>
  <div class="chart-body">
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
    flex-wrap: wrap;
    gap: 6px;
  }
  .chart-title {
    font-size: 13px;
    font-weight: 700;
    margin: 0;
    color: var(--color-text-primary);
  }
  .gran-switcher { display: flex; gap: 3px; }
  .gran-btn {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--color-border);
    border-radius: 5px;
    padding: 3px 9px;
    font-size: 11px;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .gran-btn.active {
    background: var(--color-accent-blue);
    border-color: var(--color-accent-blue);
    color: #fff;
  }
  .chart-body {
    position: relative;
    height: 240px;
  }
</style>
