<script>
  import { supabase } from '$lib/api/supabase.js';
  import { selectedKeys, keyOf } from '$lib/stores/selectionStore.js';
  import { getDateStr, formatDateDMY, formatDate, formatTime } from '$lib/utils/formatters.js';
  import { loadTeamMatches as _loadTeamMatches, computeTeamStats, goalBar } from '$lib/utils/teamData.js';
  import { leagueFlagUrl } from '$lib/utils/countryFlags.js';
  import SelectAlertButton from '$lib/components/SelectAlertButton.svelte';

  // ---- State ----
  let allAlerts = $state([]);
  let loading = $state(true);
  let error = $state('');
  let pastOpen = $state(false);
  let expandedId = $state(null);
  let teamMatchesCache = $state({});
  let hoverBar = $state(null); // { key, pct, min }

  // ---- Helpers: signal classification ----
  function isLG1(signal_type) { return signal_type?.startsWith('LG1'); }
  function isLG2(signal_type) { return signal_type?.startsWith('LG2'); }

  // ---- Reactive: visible alerts filtered by selectedKeys ----
  let visibleAlerts = $derived(
    allAlerts.filter(a => $selectedKeys.has(keyOf(a.match_id, a.signal_type)))
  );

  let today = $derived(getDateStr(0));

  function sortByKickoff(list) {
    return [...list].sort((a, b) => (a.kickoff_unix || 0) - (b.kickoff_unix || 0));
  }

  function sortByDateKickoff(list) {
    return [...list].sort((a, b) => {
      if (a.match_date !== b.match_date) return a.match_date < b.match_date ? -1 : 1;
      return (a.kickoff_unix || 0) - (b.kickoff_unix || 0);
    });
  }

  function sortTerminated(list) {
    return [...list].sort((a, b) => {
      if (a.match_date !== b.match_date) return b.match_date < a.match_date ? -1 : 1;
      return (b.kickoff_unix || 0) - (a.kickoff_unix || 0);
    });
  }

  // ---- Derived sections ----
  let sections = $derived.by(() => {
    const active = visibleAlerts.filter(a => a.match_date >= today);
    const past = visibleAlerts.filter(a => a.match_date < today);

    const todayAll = sortByKickoff(active.filter(a => a.match_date === today));
    const comingAll = sortByDateKickoff(active.filter(a => a.match_date > today));

    return {
      todayAll,
      comingAll,
      past: sortTerminated(past),
    };
  });

  // ---- Data loading ----
  async function loadAlerts() {
    loading = true;
    error = '';
    const keys = $selectedKeys;
    if (keys.size === 0) { allAlerts = []; loading = false; return; }
    const matchIds = [...new Set([...keys].map(k => k.split(':')[0]))];
    const { data, error: dbError } = await supabase
      .from('alerts')
      .select('*')
      .in('match_id', matchIds);
    if (dbError) {
      console.error('mes-matchs loadAlerts:', dbError);
      error = 'Impossible de charger les alertes sélectionnées.';
      allAlerts = [];
    } else {
      allAlerts = data || [];
    }
    loading = false;
  }

  // Recharge les alertes dès que selectedKeys change (s'exécute aussi au montage)
  $effect(() => {
    void $selectedKeys;
    loadAlerts();
  });

  // ---- Expand ----
  async function loadTeamMatches(teamId, context) {
    const key = `${teamId}_${context}`;
    if (teamMatchesCache[key]) return teamMatchesCache[key];
    const data = await _loadTeamMatches(teamId, context, supabase);
    teamMatchesCache[key] = data;
    teamMatchesCache = teamMatchesCache;
    return data;
  }

  async function toggleExpand(alert) {
    if (expandedId === alert.id) { expandedId = null; return; }
    await Promise.all([
      loadTeamMatches(alert.home_team_id, 'home'),
      loadTeamMatches(alert.away_team_id, 'away'),
    ]);
    expandedId = alert.id;
  }

  function getTeamMatches(teamId, context) {
    return teamMatchesCache[`${teamId}_${context}`] || [];
  }

  function onBarMove(e, key) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
    const min = Math.round(pct / 100 * 90);
    hoverBar = { key, pct, min };
  }

  function onBarLeave() { hoverBar = null; }

  // ---- UI helpers ----
  function confidenceClass(c) { return c === 'fort' ? 'alert-badge--fort' : 'alert-badge--moyen'; }
  function confidenceLabel(c) { return c === 'fort' ? 'Fort' : 'Moyen'; }
</script>

<div class="page-header">
  <h1 class="page-title">Mes matchs</h1>
  <p class="page-subtitle">
    {visibleAlerts.length} alerte{visibleAlerts.length !== 1 ? 's' : ''} sélectionnée{visibleAlerts.length !== 1 ? 's' : ''} — LG1 &amp; LG2
  </p>
</div>

{#if error}
  <p class="error-msg">{error}</p>
{/if}

{#if loading}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">⏳</div>
    <div class="empty-state__title">Chargement...</div>
  </div>

{:else if visibleAlerts.length === 0}
  <div class="empty-state" style="padding:48px;">
    <div class="empty-state__icon">⭐</div>
    <div class="empty-state__title">Aucune alerte sélectionnée</div>
    <div class="empty-state__desc">
      Va sur <a href="/alerts-lg1">Sélection LG1</a> ou <a href="/alerts-lg2">Sélection LG2</a> pour faire ta première sélection.
    </div>
  </div>

{:else}
  <div class="mes-matchs-sections">

    <!-- ============================================================
         AUJOURD'HUI
    ============================================================ -->
    {#if sections.todayAll.length > 0}
      <section class="mes-section">
        <h2 class="mes-section__title">
          <span class="mes-section__badge mes-section__badge--today">{sections.todayAll.length}</span>
          Aujourd'hui
        </h2>
        <div class="alerts-list">
          {#each sections.todayAll as a (a.id)}
            {@render alertCard(a)}
          {/each}
        </div>
      </section>
    {/if}

    <!-- ============================================================
         A VENIR
    ============================================================ -->
    {#if sections.comingAll.length > 0}
      <section class="mes-section">
        <h2 class="mes-section__title">
          <span class="mes-section__badge mes-section__badge--coming">{sections.comingAll.length}</span>
          À venir
        </h2>
        <div class="alerts-list">
          {#each sections.comingAll as a (a.id)}
            {@render alertCard(a)}
          {/each}
        </div>
      </section>
    {/if}

    <!-- ============================================================
         SECTION PASSES (collapsible)
    ============================================================ -->
    {#if sections.past.length > 0}
      <section class="mes-section">
        <button
          class="mes-section__collapsible"
          onclick={() => (pastOpen = !pastOpen)}
          aria-expanded={pastOpen}
        >
          <span class="mes-section__chevron" class:mes-section__chevron--open={pastOpen}>›</span>
          <span class="mes-section__title-text">Passés</span>
          <span class="mes-section__badge mes-section__badge--terminated">{sections.past.length}</span>
        </button>

        {#if pastOpen}
          <div class="alerts-list" style="margin-top:10px;">
            {#each sections.past as a (a.id)}
              {@render alertCard(a)}
            {/each}
          </div>
        {/if}
      </section>
    {/if}

  </div>
{/if}

<!-- ============================================================
     SNIPPET: alert card
============================================================ -->
{#snippet alertCard(a)}
  <div
    class="alert-card"
    class:alert-card--expanded={expandedId === a.id}
  >
    <!-- Header CLIQUABLE pour expand -->
    <div
      class="alert-card__header"
      onclick={() => toggleExpand(a)}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(a); } }}
      role="button"
      tabindex="0"
      aria-expanded={expandedId === a.id}
    >
      <div class="alert-card__time">
        <div class="alert-card__day">{formatDateDMY(a.match_date)}</div>
        <div class="alert-card__hour">{formatTime(a.kickoff_unix)}</div>
      </div>
      <div class="alert-card__match">
        <div class="alert-card__teams">{a.home_team_name} vs {a.away_team_name}</div>
        <div class="alert-card__league">
          {#if leagueFlagUrl(a.league_name)}
            <img class="country-flag" src={leagueFlagUrl(a.league_name)} alt="" loading="lazy" />
          {/if}
          {a.league_name || '—'}
        </div>
      </div>
      <div class="alert-card__badges">
        {#if isLG1(a.signal_type)}
          <span class="strategy-badge strategy-badge--lg1">LG1</span>
        {:else if isLG2(a.signal_type)}
          <span class="strategy-badge strategy-badge--lg2">LG2</span>
        {/if}
        <span class="alert-badge {confidenceClass(a.confidence)}">{confidenceLabel(a.confidence)}</span>
        <SelectAlertButton alert={a} onclick={e => e.stopPropagation()} />
      </div>
      <span class="alert-card__arrow">{expandedId === a.id ? '▼' : '▶'}</span>
    </div>

    <!-- EXPAND — identique à /alerts-lg1, + marqueur 80' si LG2 -->
    {#if expandedId === a.id}
      {@const homeMatches = getTeamMatches(a.home_team_id, 'home')}
      {@const awayMatches = getTeamMatches(a.away_team_id, 'away')}
      <div class="alert-expand">

        <!-- DOMICILE -->
        <div class="team-detail">
          <div class="team-detail__header">
            <span class="team-detail__name">{a.home_team_name}</span>
            <span class="team-detail__context">Domicile</span>
          </div>
          {#if homeMatches.length > 0}
            <div class="team-matches">
              {#each homeMatches as m, i}
                {@const bar = goalBar(m, 'home')}
                {@const barKey = `${a.id}_home`}
                <div class="match-row">
                  <span class="match-row__date">{formatDate(m.match_date)}</span>
                  <span class="match-row__home match-row__bold">{m.home_team_name}</span>
                  <span class="match-row__score match-row__score--{bar.result}">{m.home_goals}-{m.away_goals}</span>
                  <span class="match-row__away">{m.away_team_name}</span>
                  <div class="match-row__bar">
                    <div class="goal-bar"
                      onmousemove={(e) => onBarMove(e, barKey)}
                      onmouseleave={onBarLeave}
                    >
                      <span class="goal-bar__marker" style="left:50%">HT</span>
                      {#if isLG2(a.signal_type)}
                        <span class="goal-bar__marker" style="left:89%">80'</span>
                      {/if}
                      <span class="goal-bar__marker" style="left:98%">FT</span>
                      {#if hoverBar?.key === barKey}
                        <div class="goal-cursor" style="left:{hoverBar.pct}%"></div>
                      {/if}
                      {#if hoverBar?.key === barKey && i === 0}
                        <span class="bar-hover-min" style="position:absolute;bottom:calc(100% + 4px);left:{hoverBar.pct}%;transform:translateX(-50%);z-index:10;">{hoverBar.min}'</span>
                      {/if}
                      {#each bar.goals as g}
                        <span class="goal-dot" class:goal-dot--conceded={!g.scored} style="left:{g.pct}%" data-tip="{g.label || g.min + '\''}"></span>
                      {/each}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p style="color:var(--color-text-muted);text-align:center;padding:1rem;font-size:13px;">Aucun match joue cette saison</p>
          {/if}
        </div>

        <!-- EXTERIEUR -->
        <div class="team-detail">
          <div class="team-detail__header">
            <span class="team-detail__name">{a.away_team_name}</span>
            <span class="team-detail__context">Exterieur</span>
          </div>
          {#if awayMatches.length > 0}
            <div class="team-matches">
              {#each awayMatches as m, i}
                {@const bar = goalBar(m, 'away')}
                {@const barKey = `${a.id}_away`}
                <div class="match-row">
                  <span class="match-row__date">{formatDate(m.match_date)}</span>
                  <span class="match-row__home">{m.home_team_name}</span>
                  <span class="match-row__score match-row__score--{bar.result}">{m.home_goals}-{m.away_goals}</span>
                  <span class="match-row__away match-row__bold">{m.away_team_name}</span>
                  <div class="match-row__bar">
                    <div class="goal-bar"
                      onmousemove={(e) => onBarMove(e, barKey)}
                      onmouseleave={onBarLeave}
                    >
                      <span class="goal-bar__marker" style="left:50%">HT</span>
                      {#if isLG2(a.signal_type)}
                        <span class="goal-bar__marker" style="left:89%">80'</span>
                      {/if}
                      <span class="goal-bar__marker" style="left:98%">FT</span>
                      {#if hoverBar?.key === barKey}
                        <div class="goal-cursor" style="left:{hoverBar.pct}%"></div>
                      {/if}
                      {#if hoverBar?.key === barKey && i === 0}
                        <span class="bar-hover-min" style="position:absolute;bottom:calc(100% + 4px);left:{hoverBar.pct}%;transform:translateX(-50%);z-index:10;">{hoverBar.min}'</span>
                      {/if}
                      {#each bar.goals as g}
                        <span class="goal-dot" class:goal-dot--conceded={!g.scored} style="left:{g.pct}%" data-tip="{g.label || g.min + '\''}"></span>
                      {/each}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p style="color:var(--color-text-muted);text-align:center;padding:1rem;font-size:13px;">Aucun match joue cette saison</p>
          {/if}
        </div>

      </div>
    {/if}
  </div>
{/snippet}

<style>
  .page-header {
    margin-bottom: 20px;
  }

  .error-msg {
    color: var(--color-danger);
    font-size: 13px;
    margin-bottom: 12px;
  }

  .empty-state__desc {
    font-size: 13px;
    color: var(--color-text-muted);
    margin-top: 10px;
    line-height: 1.6;
  }
  .empty-state__desc a {
    color: var(--color-accent-blue);
  }

  /* ---- Sections ---- */
  .mes-matchs-sections {
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .mes-section__title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    margin-bottom: 10px;
  }

  /* Collapsible section header */
  .mes-section__collapsible {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    width: 100%;
    text-align: left;
    transition: color var(--transition-fast);
  }
  .mes-section__collapsible:hover {
    color: var(--color-text-primary);
  }

  .mes-section__chevron {
    font-size: 16px;
    line-height: 1;
    transition: transform var(--transition-fast);
    display: inline-block;
    color: var(--color-text-muted);
  }
  .mes-section__chevron--open {
    transform: rotate(90deg);
  }

  .mes-section__title-text {
    flex: 1;
  }

  /* Section count badges */
  .mes-section__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    border-radius: 11px;
    font-size: 11px;
    font-weight: 700;
    padding: 0 6px;
  }

  .mes-section__badge--today {
    background: rgba(29, 158, 117, 0.18);
    color: var(--color-accent-green);
  }

  .mes-section__badge--coming {
    background: rgba(59, 130, 246, 0.18);
    color: var(--color-accent-blue);
  }

  .mes-section__badge--terminated {
    background: rgba(160, 163, 177, 0.12);
    color: var(--color-text-muted);
  }

  .alerts-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* ---- Alert card ---- */
  .alert-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .alert-card:hover {
    border-color: var(--color-accent-blue);
  }
  .alert-card--expanded {
    border-color: var(--color-accent-blue);
  }

  /* Header row — cliquable */
  .alert-card__header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .alert-card__header:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .alert-card__arrow {
    font-size: 11px;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .alert-card__time {
    min-width: 65px;
    text-align: center;
    flex-shrink: 0;
  }
  .alert-card__day {
    font-size: 10px;
    color: var(--color-text-muted);
  }
  .alert-card__hour {
    font-size: 14px;
    font-weight: 600;
  }

  .alert-card__match {
    flex: 1;
    min-width: 0;
  }
  .alert-card__teams {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .alert-card__league {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 2px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .alert-card__league .country-flag {
    width: 16px;
    height: 12px;
    object-fit: cover;
    border-radius: 2px;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
  }

  .alert-card__badges {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    align-items: center;
    flex-wrap: wrap;
  }

  /* Strategy badge LG1 / LG2 */
  .strategy-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 3px 7px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .strategy-badge--lg1 {
    background: rgba(29, 158, 117, 0.18);
    color: var(--color-accent-green);
  }
  .strategy-badge--lg2 {
    background: rgba(127, 119, 221, 0.18);
    color: var(--color-badge-violet);
  }

  /* ---- Expand ---- */
  .alert-expand {
    border-top: 1px solid var(--color-border);
    padding: 16px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  /* ---- Responsive ---- */
  @media (max-width: 1200px) {
    .alert-expand {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .alert-card__header {
      flex-wrap: wrap;
    }
    .alert-card__badges {
      flex-wrap: wrap;
      width: 100%;
    }
  }
</style>
