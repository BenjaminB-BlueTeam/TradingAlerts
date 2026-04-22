<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/api/supabase.js';
  import { getDateStr, formatDate, formatTime, isInPlay, defeatColor } from '$lib/utils/formatters.js';

  let alerts = [];
  let loading = true;
  let selectedDay = null;
  let expandedId = null;
  let h2hCache = {};

  const days = [
    { label: 'Pass\u00e9s', offset: -3 },
    { label: "Aujourd'hui", offset: 0 },
    { label: 'Demain', offset: 1 },
    { label: 'Apr\u00e8s-demain', offset: 2 },
  ];

  async function loadAlerts() {
    loading = true;
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .gte('match_date', getDateStr(-3))
      .lte('match_date', getDateStr(2))
      .in('signal_type', ['DC', 'FHG+DC'])
      .order('match_date', { ascending: false })
      .order('kickoff_unix', { ascending: true });
    alerts = error ? [] : (data || []);
    loading = false;
  }

  $: filteredAlerts = alerts.filter(a => {
    if (selectedDay !== null && a.match_date !== getDateStr(selectedDay)) return false;
    return true;
  });

  async function loadH2H(homeId, awayId) {
    const key = [homeId, awayId].sort().join('_');
    if (h2hCache[key]) return h2hCache[key];
    const { data } = await supabase
      .from('h2h_matches')
      .select('*')
      .or(`and(home_team_id.eq.${homeId},away_team_id.eq.${awayId}),and(home_team_id.eq.${awayId},away_team_id.eq.${homeId})`)
      .order('match_date', { ascending: false })
      .limit(10);
    h2hCache[key] = data || [];
    h2hCache = h2hCache;
    return h2hCache[key];
  }

  async function toggleExpand(alert) {
    if (expandedId === alert.id) { expandedId = null; return; }
    await loadH2H(alert.home_team_id, alert.away_team_id);
    expandedId = alert.id;
  }

  function getH2H(homeId, awayId) {
    return h2hCache[[homeId, awayId].sort().join('_')] || [];
  }

  function confidenceClass(c) {
    return c === 'fort' ? 'dc-badge--fort' : 'dc-badge--moyen';
  }

  // Pour chaque match H2H, savoir si le dc_best_side a perdu
  function h2hResult(match, dcBestSide, homeFavId) {
    const isHomeFav = homeFavId === match.home_team_id;
    const favGoals = isHomeFav ? (match.home_goals || 0) : (match.away_goals || 0);
    const oppGoals = isHomeFav ? (match.away_goals || 0) : (match.home_goals || 0);
    if (favGoals > oppGoals) return 'W';
    if (favGoals === oppGoals) return 'D';
    return 'L';
  }

  onMount(() => { loadAlerts(); });
</script>

<div class="page-title">🎯 Sélection DC</div>
<div class="page-subtitle">
  {alerts.length} signal{alerts.length > 1 ? 's' : ''} Double Chance — 3 derniers jours + à venir
</div>

<div class="dc-filters">
  <button class="dc-filter-btn" class:active={selectedDay === null} on:click={() => selectedDay = null}>
    Tous ({alerts.length})
  </button>
  {#each days as day}
    {@const count = alerts.filter(a => a.match_date === getDateStr(day.offset)).length}
    <button class="dc-filter-btn" class:active={selectedDay === day.offset}
      on:click={() => selectedDay = (selectedDay === day.offset ? null : day.offset)}>
      {day.label} ({count})
    </button>
  {/each}
</div>

{#if loading}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">⏳</div>
    <div class="empty-state__title">Chargement...</div>
  </div>
{:else if filteredAlerts.length === 0}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">🎯</div>
    <div class="empty-state__title">Aucun signal DC</div>
    <div style="font-size:12px;color:var(--color-text-muted);margin-top:8px;">
      Les signaux sont générés automatiquement toutes les 12h
    </div>
  </div>
{:else}
  <div class="dc-list">
    {#each filteredAlerts as a (a.id)}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <div class="dc-card"
        class:dc-card--expanded={expandedId === a.id}
        class:dc-card--validated={a.status === 'validated'}
        class:dc-card--lost={a.status === 'lost'}
        class:dc-card--live={a.status === 'pending' && isInPlay(a)}
      >
        <div class="dc-card__header" on:click={() => toggleExpand(a)} role="button" tabindex="0">
          <div class="dc-card__time">
            <div class="dc-card__day">{a.match_date}</div>
            <div class="dc-card__hour">{formatTime(a.kickoff_unix)}</div>
          </div>
          <div class="dc-card__match">
            <div class="dc-card__teams">{a.home_team_name} vs {a.away_team_name}</div>
            <div class="dc-card__league">{a.league_name || '—'}</div>
          </div>
          <div class="dc-card__stats">
            <div class="dc-pill">
              <span class="dc-pill__label">Favori</span>
              <span class="dc-pill__value">{a.dc_best_side === 'home' ? a.home_team_name : a.away_team_name}</span>
            </div>
            <div class="dc-pill">
              <span class="dc-pill__label">% défaite</span>
              <span class="dc-pill__value" style:color={defeatColor(a.dc_defeat_pct)}>{a.dc_defeat_pct}%</span>
            </div>
            <div class="dc-pill">
              <span class="dc-pill__label">H2H</span>
              <span class="dc-pill__value">{a.h2h_count}</span>
            </div>
          </div>
          <div class="dc-card__badges">
            {#if a.signal_type === 'FHG+DC'}
              <span class="dc-badge dc-badge--fhg">+FHG</span>
            {/if}
            <span class="dc-badge {confidenceClass(a.confidence)}">{a.confidence}</span>
            {#if a.status === 'validated'}
              <span class="dc-badge dc-badge--validated">✓ Validé</span>
            {:else if a.status === 'lost'}
              <span class="dc-badge dc-badge--lost">✗ Perdu</span>
            {:else if isInPlay(a)}
              <span class="dc-badge dc-badge--live">EN COURS</span>
            {/if}
          </div>
          <span class="dc-card__arrow">{expandedId === a.id ? '▼' : '▶'}</span>
        </div>

        {#if expandedId === a.id}
          {@const h2h = getH2H(a.home_team_id, a.away_team_id)}
          {@const favId = a.dc_best_side === 'home' ? a.home_team_id : a.away_team_id}
          {@const favName = a.dc_best_side === 'home' ? a.home_team_name : a.away_team_name}
          <div class="dc-expand">
            <div class="dc-expand__title">
              H2H — Historique : <strong>{favName}</strong> ne perd pas à {a.dc_defeat_pct}% ({a.h2h_count} matchs)
            </div>
            {#if h2h.length > 0}
              <div class="h2h-list">
                {#each h2h as m}
                  {@const res = h2hResult(m, a.dc_best_side, favId)}
                  <div class="h2h-row">
                    <span class="h2h-row__date">{formatDate(m.match_date)}</span>
                    <span class="h2h-row__home" class:h2h-bold={m.home_team_id === favId}>{m.home_team_name}</span>
                    <span class="h2h-row__score h2h-row__score--{res}">{m.home_goals ?? '?'}-{m.away_goals ?? '?'}</span>
                    <span class="h2h-row__away" class:h2h-bold={m.away_team_id === favId}>{m.away_team_name}</span>
                    <span class="h2h-row__result h2h-row__result--{res}">{res}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <div style="padding:12px;text-align:center;color:var(--color-text-muted);font-size:12px;">Aucun H2H trouvé</div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .dc-filters { display: flex; gap: 4px; margin-bottom: 20px; flex-wrap: wrap; }
  .dc-filter-btn { background: rgba(255,255,255,0.05); border: 1px solid var(--color-border); border-radius: 6px; padding: 5px 12px; font-size: 12px; color: var(--color-text-muted); cursor: pointer; transition: all 0.15s; }
  .dc-filter-btn.active { background: var(--color-accent-blue); border-color: var(--color-accent-blue); color: white; }

  .dc-list { display: flex; flex-direction: column; gap: 8px; }

  .dc-card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 10px; overflow: hidden; transition: border-color 0.2s; }
  .dc-card:hover { border-color: var(--color-accent-blue); }
  .dc-card--expanded { border-color: var(--color-accent-blue); }
  .dc-card--validated { border-color: var(--color-accent-green) !important; background: rgba(29,158,117,0.04); }
  .dc-card--lost { border-color: var(--color-danger) !important; background: rgba(226,75,74,0.04); }
  .dc-card--live { border-color: var(--color-signal-moyen) !important; background: rgba(239,159,39,0.04); }

  .dc-card__header { display: flex; align-items: center; gap: 14px; padding: 12px 16px; cursor: pointer; transition: background 0.15s; }
  .dc-card__header:hover { background: rgba(255,255,255,0.02); }

  .dc-card__time { min-width: 65px; text-align: center; }
  .dc-card__day { font-size: 10px; color: var(--color-text-muted); }
  .dc-card__hour { font-size: 14px; font-weight: 600; }
  .dc-card__match { flex: 1; min-width: 0; }
  .dc-card__teams { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dc-card__league { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }
  .dc-card__arrow { font-size: 11px; color: var(--color-text-muted); flex-shrink: 0; }

  .dc-card__stats { display: flex; gap: 6px; flex-shrink: 0; }
  .dc-pill { display: flex; flex-direction: column; align-items: center; background: rgba(255,255,255,0.04); border-radius: 6px; padding: 3px 8px; min-width: 44px; }
  .dc-pill__label { font-size: 9px; font-weight: 600; text-transform: uppercase; color: var(--color-text-muted); }
  .dc-pill__value { font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px; }

  .dc-card__badges { display: flex; gap: 4px; flex-shrink: 0; }
  .dc-badge { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; }
  .dc-badge--fhg { background: rgba(29, 158, 117, 0.15); color: var(--color-accent-green); }
  .dc-badge--fort { background: rgba(29, 158, 117, 0.15); color: var(--color-accent-green); }
  .dc-badge--moyen { background: rgba(239, 159, 39, 0.15); color: var(--color-signal-moyen); }
  .dc-badge--validated { background: rgba(29, 158, 117, 0.2); color: var(--color-accent-green); }
  .dc-badge--lost { background: rgba(226, 75, 74, 0.2); color: var(--color-danger); }
  .dc-badge--live { background: rgba(239, 159, 39, 0.2); color: var(--color-signal-moyen); animation: pulse 2s infinite; }

  .dc-expand { border-top: 1px solid var(--color-border); padding: 14px 16px; }
  .dc-expand__title { font-size: 12px; color: var(--color-text-muted); margin-bottom: 10px; }
  .dc-expand__title strong { color: var(--color-text-primary); }

  .h2h-list { display: table; width: 100%; border-collapse: collapse; }
  .h2h-row { display: table-row; font-size: 11px; }
  .h2h-row > span { display: table-cell; vertical-align: middle; padding: 4px 4px; border-bottom: 1px solid rgba(255,255,255,0.03); }
  .h2h-row__date { width: 44px; color: var(--color-text-muted); font-size: 10px; }
  .h2h-row__home, .h2h-row__away { width: 100px; max-width: 100px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .h2h-bold { font-weight: 700; color: var(--color-text-primary); }
  .h2h-row__score { width: 32px; font-weight: 700; text-align: center; }
  .h2h-row__score--W { color: var(--color-accent-green); }
  .h2h-row__score--D { color: var(--color-signal-moyen); }
  .h2h-row__score--L { color: var(--color-danger); }
  .h2h-row__result { width: 24px; font-size: 10px; font-weight: 800; text-align: right; }
  .h2h-row__result--W { color: var(--color-accent-green); }
  .h2h-row__result--D { color: var(--color-signal-moyen); }
  .h2h-row__result--L { color: var(--color-danger); }

  @media (max-width: 768px) {
    .dc-card__header { flex-wrap: wrap; }
    .dc-card__stats { width: 100%; }
  }
</style>
