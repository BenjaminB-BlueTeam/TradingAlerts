<script>
  import { onMount, tick } from 'svelte';
  import { calcStatsTradesGlobal } from '$lib/stores/tradeStats.js';
  import { createWinRateChart } from '$lib/components/charts.js';

  let winrateCanvas = $state(null);
  let stats = $derived(calcStatsTradesGlobal());

  onMount(() => {
    if (stats && stats.total >= 5) {
      tick().then(() => {
        if (winrateCanvas) {
          createWinRateChart(winrateCanvas, stats.gagnes, stats.total);
        }
      });
    }
  });
</script>

<div class="settings-block">
  <div class="settings-block__title">📈 Stats personnelles</div>
  {#if stats}
    <div class="stats-grid mb-24">
      <div class="stat-card">
        <div class="stat-card__label">Taux de reussite</div>
        <div class="stat-card__value" class:green={stats.tauxGlobal >= 55} class:orange={stats.tauxGlobal < 55}>
          {stats.tauxGlobal}%
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Trades joues</div>
        <div class="stat-card__value">{stats.total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Cote moyenne</div>
        <div class="stat-card__value">{stats.coteMoy || '—'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">ROI estime</div>
        <div class="stat-card__value" class:green={(stats.roi || 0) >= 0} class:orange={(stats.roi || 0) < 0}>
          {stats.roi !== null ? stats.roi + '%' : '—'}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Meilleure serie</div>
        <div class="stat-card__value green">{stats.maxWin}W</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Pire serie</div>
        <div class="stat-card__value orange">{stats.maxLoss}L</div>
      </div>
    </div>
    {#if stats.total >= 5}
      <div class="chart-wrapper" style="height:200px;">
        <canvas bind:this={winrateCanvas}></canvas>
      </div>
    {/if}
  {:else}
    <div class="info-box" style="font-size:12px;">
      ℹ Enregistrez des trades pour voir vos statistiques personnelles.
    </div>
  {/if}
</div>
