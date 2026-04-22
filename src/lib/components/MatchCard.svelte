<script>
  import { onMount, tick } from 'svelte';
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

  let scoreClass = $derived((sc.compositeScore || 0) >= 80 ? 'green' : (sc.compositeScore || 0) >= 70 ? 'orange' : 'grey');
  let fhgColor   = $derived((sc.pct1MT || 0) >= 80 ? 'green' : (sc.pct1MT || 0) >= 70 ? 'orange' : 'grey');
  let advColor   = $derived((sc.pctAdversaire || 0) >= 50 ? 'green' : (sc.pctAdversaire || 0) >= 30 ? 'orange' : 'grey');
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
        <span class="badge badge--1mt">ALERTE FHG</span>
      {/if}
      {#if sc.warningH2H === 'vert'}
        <span class="badge badge--h2h-vert">✓ H2H ✓ ({sc.butsH2H1MT}/{sc.nbH2H})</span>
      {:else if sc.warningH2H === 'orange'}
        <span class="badge badge--h2h-orange">⚠ H2H ⚠ ({sc.butsH2H1MT}/{sc.nbH2H})</span>
      {:else if sc.warningH2H === 'insuffisant'}
        <span class="badge badge--h2h-gris">? H2H ? ({sc.nbH2H || 0})</span>
      {/if}
      {#if sc.excluded}
        <span class="badge badge--exclu">{sc.exclusionReason}</span>
      {/if}
      {#if windowActive}
        <span class="badge badge--window-open">🕐 FENÊTRE ACTIVE</span>
      {/if}
    </div>

    <!-- STATS BARS -->
    <div class="match-card__stats">
      <div class="stat-row">
        <span class="stat-row__label">But en 1MT</span>
        <div class="stat-row__bar">
          <div class="progress-bar">
            <div class="progress-bar__fill progress-bar__fill--{fhgColor}"
              style="width:{Math.min(sc.pct1MT || 0, 100)}%"></div>
          </div>
        </div>
        <span class="stat-row__value {fhgColor}">{sc.pct1MT || 0}%</span>
      </div>
      <div class="stat-row">
        <span class="stat-row__label">2+ buts en 1MT</span>
        <div class="stat-row__bar">
          <div class="progress-bar">
            <div class="progress-bar__fill progress-bar__fill--{(sc.pct2Plus1MT || 0) >= 30 ? 'green' : 'orange'}"
              style="width:{Math.min(sc.pct2Plus1MT || 0, 100)}%"></div>
          </div>
        </div>
        <span class="stat-row__value">{sc.pct2Plus1MT || 0}%</span>
      </div>
      <div class="stat-row">
        <span class="stat-row__label">Adversaire encaisse 1MT</span>
        <div class="stat-row__bar">
          <div class="progress-bar">
            <div class="progress-bar__fill progress-bar__fill--{advColor}"
              style="width:{Math.min(sc.pctAdversaire || 0, 100)}%"></div>
          </div>
        </div>
        <span class="stat-row__value {advColor}">{sc.pctAdversaire || 0}%</span>
      </div>
      {#if sc.pctReaction !== null && sc.pctReaction !== undefined}
        <div class="stat-row">
          <span class="stat-row__label">Réaction si menée</span>
          <div class="stat-row__bar">
            <div class="progress-bar">
              <div class="progress-bar__fill progress-bar__fill--{(sc.pctReaction || 0) >= 30 ? 'green' : 'orange'}"
                style="width:{Math.min(sc.pctReaction || 0, 100)}%"></div>
            </div>
          </div>
          <span class="stat-row__value">{sc.pctReaction}%</span>
        </div>
      {/if}
    </div>

    <!-- FOOTER -->
    <div class="match-card__footer">
      <div class="match-card__score-global">
        <span class="score-number {scoreClass}">{sc.compositeScore || 0}</span>
        <span class="score-label">%</span>
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

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          <!-- Pourcentages détaillés -->
          <div class="detail-section">
            <div class="detail-section__title">🎯 Détail des % bruts</div>
            <div class="dc-indicator">
              <div>
                <div class="dc-indicator__label">But en 1MT</div>
                <div class="dc-indicator__value">{sc.pct1MT || 0}%</div>
              </div>
              <div>
                <div class="dc-indicator__label">2+ buts 1MT</div>
                <div class="dc-indicator__value">{sc.pct2Plus1MT || 0}%</div>
              </div>
              <div>
                <div class="dc-indicator__label">Adv. encaisse</div>
                <div class="dc-indicator__value">{sc.pctAdversaire || 0}%</div>
              </div>
              {#if sc.pctReaction !== null && sc.pctReaction !== undefined}
                <div>
                  <div class="dc-indicator__label">Réaction</div>
                  <div class="dc-indicator__value">{sc.pctReaction}%</div>
                </div>
              {/if}
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
              <p style="font-size:12px;color:var(--color-text-muted);">DC non disponible (FHG &lt; 70%)</p>
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
