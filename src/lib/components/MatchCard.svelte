<script>
  import { onMount, tick } from 'svelte';
  import GoalTimeline from './GoalTimeline.svelte';
  import { createGoalDistChart, createCircleSVG } from '$lib/components/charts.js';
  import { formaterH2HTimeline } from '$lib/core/h2h.js';
  import { getTimerConseille } from '$lib/core/scoring.js';
  import { config } from '$lib/stores/appStore.js';
  import { get } from 'svelte/store';
  import { isWindowActive } from '$lib/core/filters.js';

  export let match;         // résultat de analyserMatch()
  export let onTrade = null; // callback optionnel pour ouvrir la fiche trade

  const m  = match;
  const sc = m.scoreChoisi || {};

  let expanded = false;
  let chartCanvas;
  let chartInstance = null;

  $: scoreClass = sc.signal === 'fort' ? 'green' : sc.signal === 'moyen' ? 'orange' : 'grey';
  $: fhgColor   = (sc.tauxN || 0) >= 75 ? 'green' : (sc.tauxN || 0) >= 60 ? 'orange' : 'grey';
  $: forme5Count = Math.round(((sc.forme5M || 0) / 20));
  $: forme5Color = (sc.forme5M || 0) >= 60 ? 'green' : 'orange';
  $: windowActive = isWindowActive(m.time);
  $: h2hTimeline = formaterH2HTimeline(m.h2h || [], m.equipeSignal || '');

  async function toggleDetail() {
    expanded = !expanded;
    if (expanded) {
      await tick();
      initChart();
    } else if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  }

  function initChart() {
    if (!chartCanvas) return;
    const dist = buildGoalDist(m.teamData);
    chartInstance = createGoalDistChart(chartCanvas, dist);
  }

  function buildGoalDist(teamData) {
    if (!teamData) return {};
    return {
      '0-15':  teamData.goals_scored_min_0_to_15  || 0,
      '16-30': teamData.goals_scored_min_16_to_30 || 0,
      '31-45': teamData.goals_scored_min_31_to_45 || 0,
      '46-60': teamData.goals_scored_min_46_to_60 || 0,
      '61-75': teamData.goals_scored_min_61_to_75 || 0,
      '76-90': teamData.goals_scored_min_76_to_90 || 0,
    };
  }

  $: cfg = get(config);
  $: timer = getTimerConseille(cfg?.profil || 'intermediaire');
  $: circleSVG = createCircleSVG(sc.pct1MT || 0);
</script>

{#if m.exclu}
  <!-- CARTE EXCLUE -->
  <div class="match-card match-card--exclu">
    <div class="match-card__header">
      <div class="match-card__teams">
        <div class="match-card__time">⏰ {m.time || '—'}</div>
        <div class="match-card__teams-names">{m.homeName} vs {m.awayName}</div>
        <div class="match-card__league">{m.leagueFlag || ''} {m.leagueName || ''}</div>
      </div>
      <span class="badge badge--exclu">✗ EXCLU</span>
    </div>
    <div style="padding:0 16px 14px;">
      <div class="danger-box">
        <span>🚫</span>
        <span>{m.raisonExclusion || 'Clean Sheet H2H'}</span>
      </div>
      <p style="font-size:11px;color:var(--color-text-muted);margin-top:8px;font-style:italic;">
        La récurrence H2H prime sur tout — aucune exception.
      </p>
    </div>
  </div>

{:else}
  <!-- CARTE NORMALE -->
  <div class="match-card" class:match-card--warning={sc.warningH2H === 'orange'}>

    <div class="match-card__header">
      <div class="match-card__teams">
        <div class="match-card__time">⏰ {m.time || '—'}</div>
        <div class="match-card__teams-names">
          {m.homeName} <span style="color:var(--color-text-muted);font-weight:400">vs</span> {m.awayName}
        </div>
        <div class="match-card__league">{m.leagueFlag || ''} {m.leagueName || ''}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        <span class="badge badge--{sc.signal || 'faible'}">
          {sc.signal === 'fort' ? '🔥 FORT' : sc.signal === 'moyen' ? '⚡ MOYEN' : '— FAIBLE'}
        </span>
        <span class="match-card__context">{m.context || 'DOM'}</span>
      </div>
    </div>

    <!-- BADGES -->
    <div class="match-card__badges">
      {#if sc.badge1MT50}
        <span class="badge badge--1mt">★ 1MT 50%+</span>
      {/if}
      {#if sc.warningH2H === 'vert'}
        <span class="badge badge--h2h-vert">✓ H2H ✓ ({sc.butsH2H1MT}/{sc.nbH2H})</span>
      {:else if sc.warningH2H === 'orange'}
        <span class="badge badge--h2h-orange">⚠ H2H ⚠ ({sc.butsH2H1MT}/{sc.nbH2H})</span>
      {:else if sc.warningH2H === 'insuffisant'}
        <span class="badge badge--h2h-gris">? H2H ? ({sc.nbH2H || 0})</span>
      {/if}
      {#if sc.debutSaison}
        <span class="badge badge--debut-saison">⚠ Début saison</span>
      {/if}
      {#if windowActive}
        <span class="badge badge--window-open">🕐 FENÊTRE ACTIVE</span>
      {/if}
    </div>

    <!-- WARNING TROP BEAU -->
    {#if sc.tropBeau}
      <div class="warning-box" style="margin:0 16px 10px;">
        ⚠ FHG très élevé ({sc.tauxN}%) — Vérifier que l'adversaire encaisse aussi en 1MT
      </div>
    {/if}

    <!-- STATS BARS -->
    <div class="match-card__stats">
      <div class="stat-row">
        <span class="stat-row__label">FHG 31-45min (saison)</span>
        <div class="stat-row__bar">
          <div class="progress-bar">
            <div class="progress-bar__fill progress-bar__fill--{fhgColor}"
              style="width:{Math.min(sc.tauxN || 0, 100)}%"></div>
          </div>
        </div>
        <span class="stat-row__value {fhgColor}">{sc.tauxN || 0}%</span>
      </div>
      <div class="stat-row">
        <span class="stat-row__label">FHG 5 derniers matchs</span>
        <div class="stat-row__bar">
          <div class="progress-bar">
            <div class="progress-bar__fill progress-bar__fill--{forme5Color}"
              style="width:{Math.min(sc.forme5M || 0, 100)}%"></div>
          </div>
        </div>
        <span class="stat-row__value {forme5Color}">{forme5Count}/5</span>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="match-card__footer">
      <div class="match-card__score-global">
        <span class="score-number {scoreClass}">{sc.score || 0}</span>
        <span class="score-label">pts</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        {#if m.scoreDC}
          <span class="badge badge--h2h-gris">DC: {m.scoreDC}pts</span>
        {/if}
        {#if onTrade}
          <button class="btn btn--primary btn--sm" on:click={() => onTrade(m)}>
            + Trade
          </button>
        {/if}
        <button class="btn btn--ghost btn--sm" on:click={toggleDetail}>
          Analyse {expanded ? '▴' : '▾'}
        </button>
      </div>
    </div>

    <!-- DÉTAIL DÉPLIABLE -->
    {#if expanded}
      <div class="match-card__detail open">

        <!-- Distribution buts -->
        <div class="detail-section">
          <div class="detail-section__title">📊 Distribution des buts par tranche</div>
          <div class="chart-wrapper" style="height:160px;">
            <canvas bind:this={chartCanvas}></canvas>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          <!-- Cercle 1MT -->
          <div class="detail-section">
            <div class="detail-section__title">🎯 Matchs avec but en 1MT</div>
            <div class="circle-progress">
              {@html circleSVG}
              <div class="circle-progress__label">
                {#if sc.badge1MT50}
                  <span class="badge badge--1mt">★ 1MT 50%+</span>
                {:else}
                  <span style="color:var(--color-text-muted);font-size:11px;">{sc.pct1MT || 0}% des matchs</span>
                {/if}
              </div>
            </div>
          </div>

          <!-- DC -->
          <div class="detail-section">
            <div class="detail-section__title">🔄 Indicateur DC</div>
            {#if m.scoreDC}
              <div class="dc-indicator">
                <div>
                  <div class="dc-indicator__label">Score DC</div>
                  <div class="dc-indicator__value">{m.scoreDC} pts</div>
                </div>
                <div>
                  <div class="dc-indicator__label">Retour si encaisse</div>
                  <div style="font-size:14px;font-weight:600;color:var(--color-accent-blue);">
                    {m.teamData?.pct_retour_si_encaisse || '—'}%
                  </div>
                </div>
              </div>
            {:else}
              <p style="font-size:12px;color:var(--color-text-muted);">DC non disponible (FHG &lt; 60pts)</p>
            {/if}
          </div>
        </div>

        <!-- H2H Timeline -->
        {#if h2hTimeline.length > 0}
          <div class="detail-section">
            <div class="detail-section__title">🔁 Historique H2H — 5 derniers matchs</div>
            <p style="font-size:11px;color:var(--color-text-muted);margin-bottom:8px;">
              Équipe ciblée : <strong style="color:var(--color-text-primary);">{m.equipeSignal}</strong>
            </p>
            <GoalTimeline {h2hTimeline} equipeNom={m.equipeSignal} />
          </div>
        {/if}

        <!-- Timer conseillé -->
        <div class="detail-section">
          <div class="detail-section__title">⏱ Timer conseillé</div>
          <div class="timer-badge">
            ⏰ Entrer entre {timer.min}e et {timer.max}e — Cote conseillée : {timer.cote}
          </div>
        </div>

      </div>
    {/if}
  </div>
{/if}
