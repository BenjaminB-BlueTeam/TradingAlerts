<script>
  import { onMount, onDestroy } from 'svelte';
  import { makeStackedBarChart } from '$lib/components/charts.js';
  import { aggregateByStrategy } from '$lib/utils/historyFilters.js';

  let { alerts = [] } = $props();

  let canvas;
  let chart;

  function draw() {
    if (!canvas) return;
    const agg = aggregateByStrategy(alerts);
    const labels = ['FHG', 'DC', 'LG2'];
    const validated = labels.map(k => agg[k].validated);
    const lost      = labels.map(k => agg[k].lost);
    chart = makeStackedBarChart(canvas, {
      labels,
      datasets: [
        { label: 'Validés', data: validated, color: 'rgba(29,158,117,0.85)', border: '#1D9E75' },
        { label: 'Perdus',  data: lost,      color: 'rgba(226,75,74,0.85)',  border: '#E24B4A' },
      ],
    });
  }

  $effect(() => { alerts; draw(); });

  onMount(() => draw());
  onDestroy(() => { if (chart) chart.destroy(); });
</script>

<div class="chart-card">
  <div class="chart-card__header">
    <h3 class="chart-title">Résultats par stratégie</h3>
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
  }
  .chart-title {
    font-size: 13px;
    font-weight: 700;
    margin: 0;
    color: var(--color-text-primary);
  }
  .chart-body { position: relative; height: 240px; }
</style>
