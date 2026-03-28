<script>
  import { signaux, exclus, loading, leagues, config, prefs, savePrefs } from '$lib/stores/appStore.js';
  import { calcDashboardStats, getNextMatchCountdown } from '$lib/core/filters.js';
  import MatchCard from '$lib/components/MatchCard.svelte';

  let focusModeActive = false;
  let exclusAccordionOpen = false;

  // Stats dashboard
  $: activeLeaguesCount = $leagues.filter(l => l.active).length;
  $: stats = calcDashboardStats($signaux, $exclus, activeLeaguesCount);
  $: signauxForts  = $signaux.filter(m => m.scoreChoisi?.signal === 'fort');
  $: signauxMoyens = $signaux.filter(m => m.scoreChoisi?.signal === 'moyen');
  $: watchlist     = $signaux.filter(m => (m.scoreChoisi?.score || 0) >= 50 && (m.scoreChoisi?.score || 0) < 60);
  $: countdown     = getNextMatchCountdown([...$signaux, ...$exclus]);

  // Date et heure
  $: now = new Date();
  $: dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  $: timeLabel = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  function toggleFocusMode() {
    focusModeActive = !focusModeActive;
    savePrefs({ focusMode: focusModeActive });
  }

  function getScoreColor(score) {
    if (score >= 75) return 'green';
    if (score >= 60) return 'orange';
    return 'grey';
  }
</script>

<!-- FOCUS MODE -->
{#if focusModeActive}
  <div class="focus-mode-overlay">
    <div class="focus-mode-header">
      <span class="focus-mode-title">🎯 Mode Focus — Signaux Forts</span>
      <button class="btn btn--secondary" on:click={toggleFocusMode}>✕ Quitter le focus</button>
    </div>
    <div class="matches-list">
      {#each signauxForts as match (match.id)}
        <MatchCard {match} />
      {/each}
      {#if signauxForts.length === 0}
        <div class="empty-state">
          <div class="empty-state__icon">🎯</div>
          <div class="empty-state__title">Aucun signal fort</div>
          <div class="empty-state__desc">Pas de match avec score ≥ 75 pts aujourd'hui</div>
        </div>
      {/if}
    </div>
  </div>

{:else}
  <!-- DASHBOARD HEADER -->
  <div class="dashboard-header">
    <div class="dashboard-header__left">
      <div class="dashboard-header__date">{dateLabel}</div>
      <div class="dashboard-header__time">{timeLabel}</div>
    </div>
    <div class="dashboard-header__right">
      {#if countdown}
        <span class="next-window-label">Prochain match</span>
        <div class="countdown">
          <span class="countdown__num">{countdown.label}</span>
          <span style="font-size:12px;color:var(--color-text-muted);">
            {countdown.match.homeName} vs {countdown.match.awayName}
          </span>
        </div>
      {/if}
      <button class="btn btn--secondary btn--sm" on:click={toggleFocusMode} style="margin-top:4px;">
        🎯 Mode Focus
      </button>
    </div>
  </div>

  <!-- METRIC GRID -->
  <div class="metric-grid">
    <div class="metric-card">
      <div class="metric-card__label">Signaux Forts</div>
      <div class="metric-card__value green">{stats.signauxForts}</div>
      <div class="metric-card__sub">Score ≥ 75 pts</div>
    </div>
    <div class="metric-card">
      <div class="metric-card__label">Matchs Analysés</div>
      <div class="metric-card__value">{stats.matchesAnalyses}</div>
      <div class="metric-card__sub">Dont {stats.matchesExclus} exclus H2H</div>
    </div>
    <div class="metric-card">
      <div class="metric-card__label">Ligues Actives</div>
      <div class="metric-card__value blue">{stats.liguesActives}</div>
      <div class="metric-card__sub">Ligues surveillées</div>
    </div>
    <div class="metric-card">
      <div class="metric-card__label">Exclus H2H</div>
      <div class="metric-card__value red">{stats.matchesExclus}</div>
      <div class="metric-card__sub">Clean Sheet détecté</div>
    </div>
  </div>

  {#if $loading}
    <div class="page-loading">
      <div class="spinner"></div>
      <p style="color:var(--color-text-muted);">Analyse des matchs en cours…</p>
    </div>
  {:else}

    <!-- SIGNAUX FORTS -->
    {#if signauxForts.length > 0}
      <div class="section-title">🔥 SIGNAUX FORTS — Score ≥ 75 pts</div>
      <div class="matches-list" style="margin-bottom:24px;">
        {#each signauxForts as match (match.id)}
          <MatchCard {match} />
        {/each}
      </div>
    {/if}

    <!-- SIGNAUX MOYENS -->
    {#if signauxMoyens.length > 0}
      <div class="section-title">⚡ SIGNAUX MOYENS — Score 60-74 pts</div>
      <div class="matches-list" style="margin-bottom:24px;">
        {#each signauxMoyens as match (match.id)}
          <MatchCard {match} />
        {/each}
      </div>
    {/if}

    <!-- EMPTY STATE -->
    {#if $signaux.length === 0}
      <div class="empty-state">
        <div class="empty-state__icon">📊</div>
        <div class="empty-state__title">Aucun signal détecté</div>
        <div class="empty-state__desc">
          {#if $leagues.filter(l => l.active).length === 0}
            Aucune ligue active — activez des ligues dans Paramètres
          {:else}
            Pas de match avec suffisamment de données aujourd'hui
          {/if}
        </div>
      </div>
    {/if}

    <!-- EXCLUS H2H (accordéon) -->
    {#if $exclus.length > 0}
      <div class="accordion" class:open={exclusAccordionOpen} style="margin-bottom:24px;">
        <div class="accordion__header" on:click={() => exclusAccordionOpen = !exclusAccordionOpen}
          role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && (exclusAccordionOpen = !exclusAccordionOpen)}>
          <span class="accordion__title">
            🚫 Matchs exclus — Clean Sheet H2H
            <span class="badge badge--exclu">{$exclus.length}</span>
          </span>
          <span class="accordion__chevron">▼</span>
        </div>
        {#if exclusAccordionOpen}
          <div class="accordion__body">
            <div class="matches-list">
              {#each $exclus as match (match.id)}
                <MatchCard {match} />
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- WATCHLIST -->
    {#if watchlist.length > 0}
      <div class="section-title" style="margin-top:8px;">👁 WATCHLIST — Score 50-59 pts</div>
      <div class="watchlist-grid" style="margin-bottom:24px;">
        {#each watchlist as match (match.id)}
          <div class="watchlist-card">
            <div class="watchlist-card__teams">
              {match.homeName} vs {match.awayName}
            </div>
            <div class="watchlist-card__meta">
              <span class="badge badge--faible">{match.scoreChoisi?.score || 0} pts</span>
              <span style="font-size:11px;color:var(--color-text-muted);">{match.time || '—'}</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}

  {/if}
{/if}
