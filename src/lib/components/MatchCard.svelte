<script>
  import { tick } from 'svelte';
  import GoalTimeline from './GoalTimeline.svelte';
  import { createGoalDistChart } from '$lib/components/charts.js';
  import { formaterH2HTimeline } from '$lib/core/h2h.js';
  import { getTimerConseille } from '$lib/core/scoring.js';
  import { config } from '$lib/stores/appStore.js';
  import { isWindowActive } from '$lib/core/filters.js';

  let { match, onTrade = null } = $props();

  let m  = $derived(match);
  let sc = $derived(m.scoreChoisi || {});

  let expanded = $state(false);
  let chartCanvas = $state(null);
  let chartInstance = $state(null);

  // Streak v2 : extraire les factors du scoreChoisi
  let streakA    = $derived(sc.signalType === 'FHG_A+B' ? sc.factors?.scenarioA : (sc.signalType === 'FHG_A' ? sc.factors : null));
  let streakB    = $derived(sc.signalType === 'FHG_A+B' ? sc.factors?.scenarioB : (sc.signalType === 'FHG_B' ? sc.factors : null));
  let streakPrincipal = $derived(streakA?.streakScored ?? streakB?.streakConceded ?? 0);
  let confirmRate = $derived(streakA?.oppConcedesRate ?? streakB?.teamScoresRate ?? 0);
  let scoreClass = $derived(sc.confidence === 'fort_double' ? 'green' : sc.confidence === 'fort' ? 'green' : sc.confidence === 'moyen' ? 'orange' : 'grey');
  let fhgColor   = $derived(streakPrincipal >= 3 ? 'green' : streakPrincipal >= 2 ? 'orange' : 'grey');
  let advColor   = $derived(confirmRate >= 60 ? 'green' : confirmRate >= 40 ? 'orange' : 'grey');
  let windowActive = $derived(isWindowActive(m.time));
  let h2hTimeline = $derived(formaterH2HTimeline(m.h2h || [], m.equipeSignal || ''));

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

  let cfg = $derived($config);
  let timer = $derived(getTimerConseille(cfg?.profil || 'intermediaire'));
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
        <span class="badge badge--{sc.confidence === 'fort' ? 'fort' : sc.confidence === 'moyen' ? 'moyen' : 'faible'}">
          {sc.confidence === 'fort' ? '🔥 FORT' : sc.confidence === 'moyen' ? '⚡ MOYEN' : '— FAIBLE'}
        </span>
        <span class="match-card__context">{m.context || 'DOM'}</span>
      </div>
    </div>

    <!-- BADGES -->
    <div class="match-card__badges">
      {#if sc.isAlert}
        <span class="badge badge--1mt">{sc.signalType || 'ALERTE FHG'}</span>
      {/if}
      {#if sc.cleanSheetBlock}
        <span class="badge badge--exclu">✗ Clean Sheet H2H</span>
      {/if}
      {#if windowActive}
        <span class="badge badge--window-open">🕐 FENÊTRE ACTIVE</span>
      {/if}
    </div>

    <!-- STATS BARS streak v2 -->
    <div class="match-card__stats">
      {#if streakA}
        <div class="stat-row">
          <span class="stat-row__label">Streak A (marque 31-45)</span>
          <div class="stat-row__bar">
            <div class="progress-bar">
              <div class="progress-bar__fill progress-bar__fill--{fhgColor}"
                style="width:{Math.min((streakA.streakScored / 5) * 100, 100)}%"></div>
            </div>
          </div>
          <span class="stat-row__value {fhgColor}">{streakA.streakScored} match{streakA.streakScored > 1 ? 's' : ''}</span>
        </div>
        <div class="stat-row">
          <span class="stat-row__label">Adv. encaisse 1MT (A)</span>
          <div class="stat-row__bar">
            <div class="progress-bar">
              <div class="progress-bar__fill progress-bar__fill--{advColor}"
                style="width:{Math.min(streakA.oppConcedesRate, 100)}%"></div>
            </div>
          </div>
          <span class="stat-row__value {advColor}">{streakA.oppConcedesRate}% ({streakA.oppConcedesSample})</span>
        </div>
      {/if}
      {#if streakB}
        <div class="stat-row">
          <span class="stat-row__label">Streak B (adv. encaisse 31-45)</span>
          <div class="stat-row__bar">
            <div class="progress-bar">
              <div class="progress-bar__fill progress-bar__fill--{fhgColor}"
                style="width:{Math.min((streakB.streakConceded / 5) * 100, 100)}%"></div>
            </div>
          </div>
          <span class="stat-row__value {fhgColor}">{streakB.streakConceded} match{streakB.streakConceded > 1 ? 's' : ''}</span>
        </div>
        <div class="stat-row">
          <span class="stat-row__label">Équipe marque 1MT (B)</span>
          <div class="stat-row__bar">
            <div class="progress-bar">
              <div class="progress-bar__fill progress-bar__fill--{advColor}"
                style="width:{Math.min(streakB.teamScoresRate, 100)}%"></div>
            </div>
          </div>
          <span class="stat-row__value {advColor}">{streakB.teamScoresRate}% ({streakB.teamScoresSample})</span>
        </div>
      {/if}
    </div>

    <!-- FOOTER -->
    <div class="match-card__footer">
      <div class="match-card__score-global">
        <span class="score-number {scoreClass}" style="font-size:13px;letter-spacing:0">
          {sc.confidence || '—'}
        </span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        {#if m.scoreDC}
          <span class="badge badge--h2h-gris">DC: {m.scoreDC}pts</span>
        {/if}
        {#if onTrade}
          <button class="btn btn--primary btn--sm" onclick={() => onTrade(m)}>
            + Trade
          </button>
        {/if}
        <button class="btn btn--ghost btn--sm" onclick={toggleDetail}>
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

        <!-- Détail factors streak -->
        {#if sc.factors}
          <div class="detail-section" style="margin-bottom:20px;">
            <div class="detail-section__title">🎯 Détail streak</div>
            <div class="dc-indicator">
              {#if sc.signalType === 'FHG_A' || sc.signalType === 'FHG_A+B'}
                {@const fA = sc.signalType === 'FHG_A+B' ? sc.factors.scenarioA : sc.factors}
                <div>
                  <div class="dc-indicator__label">Streak A (marque 31-45)</div>
                  <div class="dc-indicator__value">{fA?.streakScored ?? '—'} matchs</div>
                </div>
                <div>
                  <div class="dc-indicator__label">Adv. encaisse 1MT</div>
                  <div class="dc-indicator__value">{fA?.oppConcedesRate ?? '—'}% ({fA?.oppConcedesSample ?? '—'})</div>
                </div>
              {/if}
              {#if sc.signalType === 'FHG_B' || sc.signalType === 'FHG_A+B'}
                {@const fB = sc.signalType === 'FHG_A+B' ? sc.factors.scenarioB : sc.factors}
                <div>
                  <div class="dc-indicator__label">Streak B (adv. encaisse 31-45)</div>
                  <div class="dc-indicator__value">{fB?.streakConceded ?? '—'} matchs</div>
                </div>
                <div>
                  <div class="dc-indicator__label">Équipe marque 1MT</div>
                  <div class="dc-indicator__value">{fB?.teamScoresRate ?? '—'}% ({fB?.teamScoresSample ?? '—'})</div>
                </div>
              {/if}
            </div>
          </div>
        {/if}

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
