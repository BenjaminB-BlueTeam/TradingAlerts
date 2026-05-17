<script>
  import data from '$lib/data/red-card-stats.json';
  import { leagueFlagUrl } from '$lib/utils/countryFlags.js';
  import {
    makeSimpleBarChart,
    makeLineChart,
    makeDistributionBarChart,
  } from '$lib/components/charts.js';

  const { sample, by_minute_bucket, by_league, wait_strategy, red_min_distribution } = data;

  // ---- Tableau ligues ----
  // "Top 15" | "Bottom 15" | "All"
  let tableFilter = $state('top15');

  const sortedLeagues = [...by_league].sort((a, b) => b.pct_goal - a.pct_goal);

  let displayedLeagues = $derived.by(() => {
    if (tableFilter === 'top15') return sortedLeagues.slice(0, 15);
    if (tableFilter === 'bottom15') return sortedLeagues.slice(-15);
    return sortedLeagues;
  });

  // ---- Graphiques ----
  let chartBucketCanvas = $state(null);
  let chartWaitCanvas   = $state(null);
  let chartDistCanvas   = $state(null);

  // Couleur par valeur de pct_goal : dégradé vert → orange → rouge
  function bucketColor(pct) {
    if (pct >= 80) return 'rgba(29,158,117,0.85)';
    if (pct >= 60) return 'rgba(239,159,39,0.85)';
    return 'rgba(226,75,74,0.85)';
  }
  function bucketBorder(pct) {
    if (pct >= 80) return '#1D9E75';
    if (pct >= 60) return '#EF9F27';
    return '#E24B4A';
  }

  // Palette wait_strategy
  const WAIT_COLORS = {
    'Early (0-30)':    '#378ADD',
    'Mid (31-60)':     '#EF9F27',
    'Late (61-75)':    '#7F77DD',
    'Very late (76+)': '#888780',
  };

  $effect(() => {
    if (!chartBucketCanvas) return;

    const labels = by_minute_bucket.map(b => b.bucket);
    const values = by_minute_bucket.map(b => b.pct_goal);
    const colors = by_minute_bucket.map(b => bucketColor(b.pct_goal));

    makeSimpleBarChart(chartBucketCanvas, {
      labels,
      values,
      colors,
      yMax: 100,
      yLabel: '%',
      tooltipSuffix: '%',
    });
  });

  $effect(() => {
    if (!chartWaitCanvas) return;

    const waitLabels = wait_strategy[0].points.map(p => `${p.wait} min`);

    const datasets = wait_strategy.map(bucket => {
      const color = WAIT_COLORS[bucket.red_bucket] ?? '#888780';
      return {
        label: bucket.red_bucket,
        color,
        data: bucket.points.map((p, i) => {
          if (p.pct == null || p.n === 0) return null;
          return { x: i, y: p.pct };
        }),
      };
    });

    makeLineChart(chartWaitCanvas, { labels: waitLabels, datasets });
  });

  $effect(() => {
    if (!chartDistCanvas) return;

    const rows = red_min_distribution.map(b => ({
      label: b.bucket,
      value: b.count,
      pct: b.pct,
    }));

    makeDistributionBarChart(chartDistCanvas, {
      rows,
      color: '#378ADD',
      tooltipSuffix: ' matchs',
    });
  });
</script>

<div class="page-container">

  <!-- 1. Header -->
  <div class="rc-header">
    <h1 class="page-title">Cartons rouges — analyse statistique</h1>
    <p class="page-subtitle">
      Echantillon : {sample.total_matches.toLocaleString('fr-FR')} matchs, 45 ligues, {sample.seasons} saisons
    </p>
    <p class="rc-meta">
      Donnees FootyStats post-match. Mise a jour : {data.generated_at}
    </p>
  </div>

  <!-- 2. KPIs -->
  <div class="metric-grid metric-grid--4">

    <div class="metric-card">
      <div class="metric-card__label">Matchs avec &ge;1 but apres le rouge</div>
      <div class="metric-card__value green">{sample.pct_goal_after}%</div>
      <div class="metric-card__sub">sur {sample.total_matches.toLocaleString('fr-FR')} matchs</div>
    </div>

    <div class="metric-card">
      <div class="metric-card__label">Matchs avec &ge;2 buts apres le rouge</div>
      <div class="metric-card__value orange">{sample.pct_2goal_after}%</div>
      <div class="metric-card__sub">multiples buts apres expulsion</div>
    </div>

    <div class="metric-card">
      <div class="metric-card__label">Buts moyens apres le rouge</div>
      <div class="metric-card__value blue">{sample.avg_goals_after}</div>
      <div class="metric-card__sub">par match avec carton</div>
    </div>

    <div class="metric-card">
      <div class="metric-card__label">Effet causal (taux buts/h)</div>
      <div class="metric-card__value green">+{sample.causal_pct}%</div>
      <div class="metric-card__sub">
        {sample.rate_before_per_hour} &rarr; {sample.rate_after_per_hour} buts/h
      </div>
    </div>

  </div>

  <!-- 3. Graphique 1 : % de but par minute du carton -->
  <div class="rc-section">
    <h2 class="rc-section__title">% de but apres le rouge selon la minute du carton</h2>
    <p class="rc-section__sub">
      Plus le rouge tombe tot, plus la probabilite d'un but subsequent est elevee.
    </p>
    <div class="rc-chart-wrap rc-chart-wrap--bar">
      <canvas bind:this={chartBucketCanvas}></canvas>
    </div>
    <div class="rc-chart-legend">
      {#each by_minute_bucket as b}
        <span class="rc-chart-legend__item">
          <span class="rc-chart-legend__bucket">{b.bucket}'</span>
          <span class="rc-chart-legend__n">N={b.n}</span>
        </span>
      {/each}
    </div>
  </div>

  <!-- 4. Graphique 2 : strategie wait-and-bet -->
  <div class="rc-section">
    <h2 class="rc-section__title">Strategie wait-and-bet : probabilite de but selon le temps d'attente</h2>
    <p class="rc-section__sub">
      Lecture : si tu attends X min sans but apres le rouge, voici la probabilite de but jusqu'a la fin du match.
      Les valeurs nulles (n=0) sont omises.
    </p>
    <div class="rc-chart-wrap rc-chart-wrap--line">
      <canvas bind:this={chartWaitCanvas}></canvas>
    </div>
    <div class="rc-chart-legend rc-chart-legend--wait">
      {#each wait_strategy as bucket}
        <span class="rc-chart-legend__wait-item" style="--c:{WAIT_COLORS[bucket.red_bucket] ?? '#888780'}">
          {bucket.red_bucket}
        </span>
      {/each}
    </div>
  </div>

  <!-- 5. Tableau Top ligues -->
  <div class="rc-section">
    <div class="rc-section__head">
      <h2 class="rc-section__title">Ligues — impact du carton rouge</h2>
      <div class="rc-filter-btns">
        <button
          class="btn btn--sm"
          class:btn--primary={tableFilter === 'top15'}
          class:btn--secondary={tableFilter !== 'top15'}
          onclick={() => tableFilter = 'top15'}
        >Top 15</button>
        <button
          class="btn btn--sm"
          class:btn--primary={tableFilter === 'bottom15'}
          class:btn--secondary={tableFilter !== 'bottom15'}
          onclick={() => tableFilter = 'bottom15'}
        >Bottom 15</button>
        <button
          class="btn btn--sm"
          class:btn--primary={tableFilter === 'all'}
          class:btn--secondary={tableFilter !== 'all'}
          onclick={() => tableFilter = 'all'}
        >Toutes ({by_league.length})</button>
      </div>
    </div>

    <div class="rc-table-wrap">
      <table class="rc-table">
        <thead>
          <tr>
            <th class="rc-table__th rc-table__th--left">Ligue</th>
            <th class="rc-table__th">N</th>
            <th class="rc-table__th">% but apres</th>
            <th class="rc-table__th rc-table__th--hide-sm">% 2 buts</th>
            <th class="rc-table__th rc-table__th--hide-sm">Buts moy.</th>
            <th class="rc-table__th rc-table__th--hide-sm">Effet causal %</th>
          </tr>
        </thead>
        <tbody>
          {#each displayedLeagues as league, i}
            {@const flagUrl = leagueFlagUrl(league.league)}
            <tr class="rc-table__row" class:rc-table__row--alt={i % 2 === 1}>
              <td class="rc-table__td rc-table__td--league">
                {#if flagUrl}
                  <img
                    src={flagUrl}
                    alt={league.country}
                    class="rc-flag"
                    loading="lazy"
                  />
                {:else}
                  <span class="rc-flag-placeholder"></span>
                {/if}
                <span class="rc-table__league-name">{league.league}</span>
              </td>
              <td class="rc-table__td rc-table__td--center">
                <span class:text-muted={league.n < 30}>{league.n}</span>
                {#if league.n < 30}<span class="rc-small-n" title="Petit echantillon (N < 30)">⚠</span>{/if}
              </td>
              <td class="rc-table__td rc-table__td--center">
                <span
                  class="rc-pct-badge"
                  class:rc-pct-badge--high={league.pct_goal >= 70}
                  class:rc-pct-badge--mid={league.pct_goal >= 55 && league.pct_goal < 70}
                  class:rc-pct-badge--low={league.pct_goal < 55}
                >{league.pct_goal}%</span>
              </td>
              <td class="rc-table__td rc-table__td--center rc-table__td--hide-sm">{league.pct_2goal}%</td>
              <td class="rc-table__td rc-table__td--center rc-table__td--hide-sm">{league.avg_goals}</td>
              <td class="rc-table__td rc-table__td--center rc-table__td--hide-sm">
                <span class:text-green={league.causal_pct > 0} class:text-danger={league.causal_pct < 0}>
                  {league.causal_pct > 0 ? '+' : ''}{league.causal_pct}%
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <!-- 6. Distribution des cartons rouges -->
  <div class="rc-section">
    <h2 class="rc-section__title">Quand tombent les cartons rouges ?</h2>
    <p class="rc-section__sub">
      71% des rouges tombent en 2e mi-temps. Les expulsions tardives (76'+) representent a elles seules 38% des cas.
    </p>
    <div class="rc-chart-wrap rc-chart-wrap--dist">
      <canvas bind:this={chartDistCanvas}></canvas>
    </div>
  </div>

  <!-- 7. Lecture et limites -->
  <div class="rc-section">
    <div class="rc-info-box">
      <div class="rc-info-box__title">Lecture &amp; limites</div>
      <ul class="rc-info-box__list">
        <li>Source : FootyStats (donnees post-match uniquement, pas de live)</li>
        <li>Effet causal mesure sur les memes matchs (avant / apres le rouge) — controle naturel</li>
        <li>Petits echantillons (N &lt; 30) a interpreter avec prudence — signales par ⚠</li>
        <li>Cotes breakeven theoriques : ne tiennent pas compte de la marge bookmaker (5-10%)</li>
      </ul>
    </div>
  </div>

</div>

<style>
  /* ---- Header ---- */
  .rc-header {
    margin-bottom: 28px;
  }
  .rc-meta {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 4px;
  }

  /* ---- Sections ---- */
  .rc-section {
    margin-bottom: 40px;
  }
  .rc-section__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
  }
  .rc-section__title {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 4px;
  }
  .rc-section__sub {
    font-size: 12px;
    color: var(--color-text-muted);
    margin-bottom: 12px;
  }

  /* ---- Graphiques ---- */
  .rc-chart-wrap {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: 16px;
  }
  .rc-chart-wrap--bar {
    height: 260px;
  }
  .rc-chart-wrap--line {
    height: 300px;
  }
  .rc-chart-wrap--dist {
    height: 220px;
  }
  .rc-chart-wrap canvas {
    width: 100% !important;
    height: 100% !important;
  }

  /* ---- Legende buckets ---- */
  .rc-chart-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .rc-chart-legend__item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--color-text-muted);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-badge);
    padding: 2px 8px;
  }
  .rc-chart-legend__bucket {
    font-weight: 600;
    color: var(--color-text-secondary);
  }
  .rc-chart-legend__n {
    color: var(--color-text-muted);
  }

  /* ---- Legende wait strategy ---- */
  .rc-chart-legend--wait {
    gap: 16px;
    margin-top: 10px;
  }
  .rc-chart-legend__wait-item {
    font-size: 12px;
    font-weight: 500;
    color: var(--c);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .rc-chart-legend__wait-item::before {
    content: '';
    display: inline-block;
    width: 20px;
    height: 3px;
    background: var(--c);
    border-radius: 2px;
  }

  /* ---- Filtres tableau ---- */
  .rc-filter-btns {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  /* ---- Tableau ---- */
  .rc-table-wrap {
    overflow-x: auto;
    border-radius: var(--radius-card);
    border: 1px solid var(--color-border);
  }
  .rc-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .rc-table__th {
    padding: 10px 12px;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: var(--color-bg-card);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
    text-align: center;
  }
  .rc-table__th--left {
    text-align: left;
  }
  .rc-table__row {
    transition: background var(--transition-fast);
  }
  .rc-table__row:hover {
    background: rgba(255,255,255,0.03);
  }
  .rc-table__row--alt {
    background: rgba(255,255,255,0.02);
  }
  .rc-table__row--alt:hover {
    background: rgba(255,255,255,0.05);
  }
  .rc-table__td {
    padding: 9px 12px;
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }
  .rc-table__td--center {
    text-align: center;
  }
  .rc-table__td--league {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 200px;
  }
  .rc-table__league-name {
    color: var(--color-text-primary);
    font-size: 13px;
  }

  /* ---- Drapeau ---- */
  .rc-flag {
    width: 20px;
    height: 14px;
    object-fit: cover;
    border-radius: 2px;
    flex-shrink: 0;
    border: 1px solid var(--color-border);
  }
  .rc-flag-placeholder {
    display: inline-block;
    width: 20px;
    height: 14px;
    background: var(--color-bg-input);
    border-radius: 2px;
    flex-shrink: 0;
  }

  /* ---- Badge % but ---- */
  .rc-pct-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-badge);
    font-size: 12px;
    font-weight: 600;
  }
  .rc-pct-badge--high {
    background: rgba(29,158,117,0.15);
    color: var(--color-accent-green);
    border: 1px solid rgba(29,158,117,0.3);
  }
  .rc-pct-badge--mid {
    background: rgba(239,159,39,0.12);
    color: var(--color-warning-orange);
    border: 1px solid rgba(239,159,39,0.25);
  }
  .rc-pct-badge--low {
    background: rgba(226,75,74,0.12);
    color: var(--color-danger);
    border: 1px solid rgba(226,75,74,0.25);
  }

  /* ---- Avertissement petit echantillon ---- */
  .rc-small-n {
    font-size: 11px;
    margin-left: 2px;
    color: var(--color-warning-orange);
  }

  /* ---- Info box ---- */
  .rc-info-box {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--color-accent-blue);
    border-radius: var(--radius-card);
    padding: 16px 20px;
  }
  .rc-info-box__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 10px;
  }
  .rc-info-box__list {
    list-style: disc;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rc-info-box__list li {
    font-size: 13px;
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  /* ---- Responsive ---- */
  @media (max-width: 768px) {
    .rc-table__td--hide-sm,
    .rc-table__th--hide-sm {
      display: none;
    }
    .rc-chart-wrap--bar  { height: 200px; }
    .rc-chart-wrap--line { height: 240px; }
    .rc-chart-wrap--dist { height: 180px; }
    .rc-section__head {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  @media (max-width: 480px) {
    .rc-table__td--league {
      min-width: 140px;
    }
  }
</style>
