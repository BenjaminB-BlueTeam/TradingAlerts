<script>
  import { supabase } from '$lib/api/supabase.js';
  import { selectedKeys, keyOf } from '$lib/stores/selectionStore.js';
  import { getDateStr, formatDateDMY, formatDate, formatTime } from '$lib/utils/formatters.js';
  import { loadTeamMatches as _loadTeamMatches, computeTeamStats, goalBar } from '$lib/utils/teamData.js';
  import { leagueFlagUrl } from '$lib/utils/countryFlags.js';
  import SelectAlertButton from '$lib/components/SelectAlertButton.svelte';
  import TeamLgBadges from '$lib/components/TeamLgBadges.svelte';

  // ---- State ----
  let allAlerts = $state([]);
  let noteMap = $state(new Map()); // Map<"matchId:signalType", string|null>
  let loading = $state(true);
  let error = $state('');
  let pastOpen = $state(false);
  let expandedId = $state(null);
  let filterType = $state('all');       // 'all' | 'lg1' | 'lg2'
  let filterConfidence = $state('all'); // 'all' | 'fort' | 'moyen'
  let now = $state(Math.floor(Date.now() / 1000));
  let teamMatchesCache = $state({});
  let hoverBar = $state(null); // { key, pct, min }
  // Note editing state
  let editingNote = $state(null); // { matchId, signalType } | null
  let editNoteValue = $state('');

  // ---- Helpers: signal classification ----
  function isLG1(signal_type) { return signal_type?.startsWith('LG1'); }
  function isLG2(signal_type) { return signal_type?.startsWith('LG2'); }

  // ---- Reactive: visible alerts filtered by selectedKeys ----
  let visibleAlerts = $derived(
    allAlerts.filter(a => $selectedKeys.has(keyOf(a.match_id, a.signal_type)))
  );

  let today = $derived(getDateStr(0));

  let filteredAlerts = $derived(visibleAlerts.filter(a => {
    if (filterType === 'lg1' && !isLG1(a.signal_type)) return false;
    if (filterType === 'lg2' && !isLG2(a.signal_type)) return false;
    if (filterConfidence !== 'all' && a.confidence !== filterConfidence) return false;
    return true;
  }));

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

  function groupByMatch(alerts, nm) {
    const map = new Map();
    for (const a of alerts) {
      const sig = {
        id: a.id,
        signal_type: a.signal_type,
        confidence: a.confidence,
        note: nm?.get(`${a.match_id}:${a.signal_type}`) ?? null,
      };
      if (!map.has(a.match_id)) {
        map.set(a.match_id, { ...a, signals: [sig] });
      } else {
        map.get(a.match_id).signals.push(sig);
      }
    }
    for (const item of map.values()) {
      item.signals.sort((a, b) => (isLG1(a.signal_type) ? 0 : 1) - (isLG1(b.signal_type) ? 0 : 1));
    }
    return [...map.values()];
  }

  // Ticker 60s pour "En cours"
  $effect(() => {
    const t = setInterval(() => { now = Math.floor(Date.now() / 1000); }, 60000);
    return () => clearInterval(t);
  });

  const IN_PLAY_WINDOW = 7200; // 2h en secondes

  // ---- Derived sections ----
  let sections = $derived.by(() => {
    const nm = noteMap;
    const inPlayAll = groupByMatch(sortByKickoff(
      filteredAlerts.filter(a => a.kickoff_unix && a.kickoff_unix <= now && a.kickoff_unix > now - IN_PLAY_WINDOW)
    ), nm);
    const todayAll = groupByMatch(sortByKickoff(
      filteredAlerts.filter(a => a.match_date === today && (!a.kickoff_unix || a.kickoff_unix > now))
    ), nm);
    const comingAll = groupByMatch(sortByDateKickoff(
      filteredAlerts.filter(a => a.match_date > today)
    ), nm);
    const past = groupByMatch(sortTerminated(
      filteredAlerts.filter(a => a.match_date < today || (a.kickoff_unix && a.kickoff_unix <= now - IN_PLAY_WINDOW))
    ), nm);
    return { inPlayAll, todayAll, comingAll, past };
  });

  // ---- Data loading ----
  async function loadAlerts() {
    loading = true;
    error = '';
    const keys = $selectedKeys;
    if (keys.size === 0) { allAlerts = []; noteMap = new Map(); loading = false; return; }
    const matchIds = [...new Set([...keys].map(k => k.split(':')[0]))];
    const [alertsRes, notesRes] = await Promise.all([
      supabase.from('alerts').select('*').in('match_id', matchIds),
      supabase.from('selected_alerts').select('match_id, signal_type, user_note').in('match_id', matchIds),
    ]);
    if (alertsRes.error) {
      console.error('mes-matchs loadAlerts:', alertsRes.error);
      error = 'Impossible de charger les alertes sélectionnées.';
      allAlerts = [];
    } else {
      allAlerts = alertsRes.data || [];
      prefetchTeamStats(allAlerts);
    }
    if (!notesRes.error && notesRes.data) {
      const nm = new Map();
      for (const row of notesRes.data) {
        if (row.user_note != null) {
          nm.set(`${row.match_id}:${row.signal_type}`, row.user_note);
        }
      }
      noteMap = nm;
    }
    loading = false;
  }

  // ---- Note editing ----
  function startEditNote(matchId, signalType, currentNote) {
    editingNote = { matchId, signalType };
    editNoteValue = currentNote || '';
  }

  function cancelEditNote() {
    editingNote = null;
    editNoteValue = '';
  }

  async function saveNote(matchId, signalType) {
    const val = editNoteValue.trim() || null;
    try {
      const { error: upErr } = await supabase
        .from('selected_alerts')
        .update({ user_note: val })
        .eq('match_id', matchId)
        .eq('signal_type', signalType);
      if (upErr) throw upErr;
      const nm = new Map(noteMap);
      if (val) {
        nm.set(`${matchId}:${signalType}`, val);
      } else {
        nm.delete(`${matchId}:${signalType}`);
      }
      noteMap = nm;
    } catch (e) {
      console.error('saveNote:', e);
    }
    editingNote = null;
    editNoteValue = '';
  }

  function onNoteKeydown(e, matchId, signalType) {
    if (e.key === 'Enter') { e.preventDefault(); saveNote(matchId, signalType); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEditNote(); }
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
    if (expandedId === alert.match_id) { expandedId = null; return; }
    await Promise.all([
      loadTeamMatches(alert.home_team_id, 'home'),
      loadTeamMatches(alert.away_team_id, 'away'),
    ]);
    expandedId = alert.match_id;
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

  // ---- Team stats cache (pour TeamLgBadges preload) ----
  // Map<teamId, {lg1_after30_pct, lg2_pct, matches_count}> — derniere saison connue par team
  let teamStatsCache = $state(new Map());

  async function prefetchTeamStats(alertsList) {
    if (alertsList.length === 0) return;
    const teamIds = new Set();
    for (const a of alertsList) {
      if (a.home_team_id) teamIds.add(a.home_team_id);
      if (a.away_team_id) teamIds.add(a.away_team_id);
    }
    const teamIdsArr = [...teamIds];
    if (teamIdsArr.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('team_lg1_cache')
        .select('team_id, lg1_after30_pct, lg2_pct, matches_count, lg1_home_pct, lg1_away_pct, lg2_home_pct, lg2_away_pct, matches_home, matches_away, updated_at')
        .in('team_id', teamIdsArr)
        .order('updated_at', { ascending: false });
      if (error || !data) return;
      const newCache = new Map(teamStatsCache);
      for (const row of data) {
        if (newCache.has(row.team_id)) continue;
        newCache.set(row.team_id, row);
      }
      teamStatsCache = newCache;
    } catch (e) {
      console.warn('mes-matchs prefetchTeamStats error:', e.message);
    }
  }

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
      Va sur <a href="/alerts/lg1">Alertes LG1</a> ou <a href="/alerts/lg2">Alertes LG2</a> pour faire ta première sélection.
    </div>
  </div>

{:else}
  <div class="mm-filters">
    <div class="mm-filter-group">
      <button class="mm-filter-btn" class:active={filterType === 'all'} onclick={() => filterType = 'all'}>Tout</button>
      <button class="mm-filter-btn mm-filter-btn--lg1" class:active={filterType === 'lg1'} onclick={() => filterType = 'lg1'}>LG1</button>
      <button class="mm-filter-btn mm-filter-btn--lg2" class:active={filterType === 'lg2'} onclick={() => filterType = 'lg2'}>LG2</button>
    </div>
    <div class="mm-filter-group">
      <button class="mm-filter-btn" class:active={filterConfidence === 'all'} onclick={() => filterConfidence = 'all'}>Tout</button>
      <button class="mm-filter-btn mm-filter-btn--fort" class:active={filterConfidence === 'fort'} onclick={() => filterConfidence = 'fort'}>Fort</button>
      <button class="mm-filter-btn mm-filter-btn--moyen" class:active={filterConfidence === 'moyen'} onclick={() => filterConfidence = 'moyen'}>Moyen</button>
    </div>
  </div>

  {#if filteredAlerts.length === 0}
    <div class="empty-state" style="padding:32px;">
      <div class="empty-state__title">Aucun match pour ces filtres</div>
    </div>
  {:else}
  <div class="mes-matchs-sections">

    <!-- ============================================================
         EN COURS
    ============================================================ -->
    {#if sections.inPlayAll.length > 0}
      <section class="mes-section">
        <h2 class="mes-section__title">
          <span class="inplay-dot"></span>
          <span class="mes-section__badge mes-section__badge--inplay">{sections.inPlayAll.length}</span>
          En cours
        </h2>
        <div class="alerts-list">
          {#each sections.inPlayAll as a (a.match_id)}
            {@render alertCard(a)}
          {/each}
        </div>
      </section>
    {/if}

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
          {#each sections.todayAll as a (a.match_id)}
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
          {#each sections.comingAll as a (a.match_id)}
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
            {#each sections.past as a (a.match_id)}
              {@render alertCard(a)}
            {/each}
          </div>
        {/if}
      </section>
    {/if}

  </div>
  {/if}
{/if}

<!-- ============================================================
     SNIPPET: alert card
============================================================ -->
{#snippet alertCard(a)}
  {@const inPlay = !!a.kickoff_unix && a.kickoff_unix <= now && a.kickoff_unix > now - IN_PLAY_WINDOW}
  <div
    class="alert-card"
    class:alert-card--expanded={expandedId === a.match_id}
  >
    <!-- Header CLIQUABLE pour expand -->
    <div
      class="alert-card__header"
      onclick={() => toggleExpand(a)}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(a); } }}
      role="button"
      tabindex="0"
      aria-expanded={expandedId === a.match_id}
    >
      <div class="alert-card__time">
        <div class="alert-card__day">{formatDateDMY(a.match_date)}</div>
        <div class="alert-card__hour">
          {#if inPlay}<span class="inplay-dot inplay-dot--sm"></span>{/if}
          {formatTime(a.kickoff_unix)}
        </div>
      </div>
      <div class="alert-card__match">
        <div class="alert-card__teams">{a.home_team_name} vs {a.away_team_name}</div>
        <div class="alert-card__league">
          {#if leagueFlagUrl(a.league_name)}
            <img class="country-flag" src={leagueFlagUrl(a.league_name)} alt="" loading="lazy" />
          {/if}
          {a.league_name || '—'}
        </div>
        {#if a.home_team_id && a.away_team_id}
          <div class="alert-card__team-badges">
            <div class="alert-card__team-badge-row">
              <span class="alert-card__team-label">{a.home_team_name}</span>
              <TeamLgBadges
                teamId={a.home_team_id}
                context="home"
                size="sm"
                inline
                preload={teamStatsCache.get(a.home_team_id) ?? null}
              />
            </div>
            <div class="alert-card__team-badge-row">
              <span class="alert-card__team-label">{a.away_team_name}</span>
              <TeamLgBadges
                teamId={a.away_team_id}
                context="away"
                size="sm"
                inline
                preload={teamStatsCache.get(a.away_team_id) ?? null}
              />
            </div>
          </div>
        {/if}
      </div>
      <div class="alert-card__badges">
        {#each a.signals as sig}
          <div class="signal-row">
            <div class="signal-row__badges">
              {#if isLG1(sig.signal_type)}
                <span class="strategy-badge strategy-badge--lg1">LG1</span>
              {:else if isLG2(sig.signal_type)}
                <span class="strategy-badge strategy-badge--lg2">LG2</span>
              {/if}
              <span class="alert-badge {confidenceClass(sig.confidence)}">{confidenceLabel(sig.confidence)}</span>
              <SelectAlertButton alert={{ ...a, id: sig.id, signal_type: sig.signal_type, confidence: sig.confidence }} onclick={e => e.stopPropagation()} />
            </div>
            <div class="signal-note-row" onclick={e => e.stopPropagation()}>
              {#if editingNote?.matchId === a.match_id && editingNote?.signalType === sig.signal_type}
                <input
                  class="note-edit-input"
                  type="text"
                  bind:value={editNoteValue}
                  onblur={() => saveNote(a.match_id, sig.signal_type)}
                  onkeydown={e => onNoteKeydown(e, a.match_id, sig.signal_type)}
                  placeholder="Ajouter une note..."
                  autofocus
                />
              {:else}
                {#if sig.note}
                  <span class="signal-note">{sig.note}</span>
                {/if}
                <button
                  class="note-edit-btn"
                  title="Modifier la note"
                  onclick={() => startEditNote(a.match_id, sig.signal_type, sig.note)}
                  aria-label="Modifier la note"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
      <span class="alert-card__arrow">{expandedId === a.match_id ? '▼' : '▶'}</span>
    </div>

    <!-- EXPAND — 2 colonnes dom/ext -->
    {#if expandedId === a.match_id}
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
                {@const barKey = `${a.match_id}_home`}
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
                      <span class="goal-bar__marker" style="left:33%">30'</span>
                      <span class="goal-bar__marker" style="left:50%">HT</span>
                      {#if a.signals.some(s => isLG2(s.signal_type))}
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
            <p style="color:var(--color-text-muted);text-align:center;padding:1rem;font-size:13px;">Aucun match joué cette saison</p>
          {/if}
        </div>

        <!-- EXTERIEUR -->
        <div class="team-detail">
          <div class="team-detail__header">
            <span class="team-detail__name">{a.away_team_name}</span>
            <span class="team-detail__context">Extérieur</span>
          </div>
          {#if awayMatches.length > 0}
            <div class="team-matches">
              {#each awayMatches as m, i}
                {@const bar = goalBar(m, 'away')}
                {@const barKey = `${a.match_id}_away`}
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
                      <span class="goal-bar__marker" style="left:33%">30'</span>
                      <span class="goal-bar__marker" style="left:50%">HT</span>
                      {#if a.signals.some(s => isLG2(s.signal_type))}
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
            <p style="color:var(--color-text-muted);text-align:center;padding:1rem;font-size:13px;">Aucun match joué cette saison</p>
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

  /* ---- Filters ---- */
  .mm-filters {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .mm-filter-group {
    display: flex;
    gap: 4px;
  }
  .mm-filter-btn {
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 12px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }
  .mm-filter-btn.active { background: var(--color-accent-blue); border-color: var(--color-accent-blue); color: white; }
  .mm-filter-btn--lg1.active { background: rgba(29,158,117,0.8); border-color: var(--color-accent-green); }
  .mm-filter-btn--lg2.active { background: rgba(127,119,221,0.8); border-color: var(--color-badge-violet); }
  .mm-filter-btn--fort.active { background: rgba(251,191,36,0.8); border-color: #f59e0b; }
  .mm-filter-btn--moyen.active { background: rgba(107,114,128,0.6); border-color: #6b7280; }

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

  .mes-section__badge--inplay {
    background: rgba(239, 68, 68, 0.18);
    color: #ef4444;
  }

  .inplay-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
    flex-shrink: 0;
    animation: pulse-dot 1.4s ease-in-out infinite;
  }
  .inplay-dot--sm {
    width: 6px;
    height: 6px;
    display: inline-block;
    vertical-align: middle;
    margin-right: 4px;
  }
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.75); }
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

  .alert-card__team-badges {
    margin-top: 5px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .alert-card__team-badge-row {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }
  .alert-card__team-label {
    font-size: 10px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 110px;
    flex-shrink: 0;
  }

  .alert-card__badges {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
    align-items: flex-end;
  }

  .signal-row {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
  }

  .signal-row__badges {
    display: flex;
    gap: 4px;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .signal-note-row {
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: flex-end;
  }

  .signal-note {
    font-size: 11px;
    color: var(--color-text-muted);
    font-style: italic;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }

  .note-edit-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    background: none;
    border: none;
    color: var(--color-text-muted);
    opacity: 0.5;
    cursor: pointer;
    transition: opacity var(--transition-fast);
    flex-shrink: 0;
  }
  .note-edit-btn:hover {
    opacity: 1;
  }

  .note-edit-input {
    font-size: 11px;
    color: var(--color-text-primary);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 2px 6px;
    width: 180px;
    max-width: 100%;
  }
  .note-edit-input:focus {
    border-color: var(--color-accent-blue);
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
      display: grid;
      grid-template-columns: auto 1fr auto;
      grid-template-areas:
        "time match arrow"
        "actions actions actions";
      align-items: start;
      gap: 8px 12px;
      padding: 12px;
    }
    .alert-card__time { grid-area: time; text-align: left; min-width: 0; }
    .alert-card__match { grid-area: match; min-width: 0; }
    .alert-card__teams { white-space: normal; line-height: 1.3; }
    .alert-card__arrow { grid-area: arrow; align-self: start; padding-top: 4px; }
    .alert-card__badges {
      grid-area: actions;
      width: 100%;
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
      border-top: 1px solid var(--color-border);
      padding-top: 10px;
    }
    .signal-row {
      align-items: stretch;
    }
    .signal-row__badges {
      justify-content: flex-end;
    }
    .alert-card__team-label { max-width: 90px; font-size: 11px; }
  }
</style>
