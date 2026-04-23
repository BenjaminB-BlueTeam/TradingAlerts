<script>
  import { onMount, onDestroy } from 'svelte';
  import { goalBar } from '$lib/utils/teamData.js';
  import { isInPlay } from '$lib/utils/formatters.js';
  import { supabase } from '$lib/api/supabase.js';
  import { strategyOf } from '$lib/utils/historyFilters.js';

  let { alerts = [] } = $props();

  // Tri
  const DEFAULT_SORT = { key: 'match_date', dir: 'desc' };
  let sort = $state({ ...DEFAULT_SORT });

  const COLS = [
    { key: 'match_date',   label: 'Date',   sortable: true, mobile: true },
    { key: 'league_name',  label: 'Ligue',  sortable: true, mobile: false },
    { key: 'teams',        label: 'Match',  sortable: false, mobile: true },
    { key: 'score',        label: 'Score',  sortable: false, mobile: true },
    { key: 'ht',           label: 'HT',     sortable: false, mobile: false },
    { key: 'signal_type',  label: 'Signal', sortable: true, mobile: false },
    { key: 'confidence',   label: 'Conf',   sortable: true, mobile: false },
    { key: 'status',       label: 'Résultat', sortable: true, mobile: true },
  ];

  function sortedAlerts(list) {
    const { key, dir } = sort;
    const mul = dir === 'asc' ? 1 : -1;
    const cmp = (a, b) => {
      if (key === 'match_date') {
        return ((a.match_date || '') < (b.match_date || '') ? -1 : (a.match_date || '') > (b.match_date || '') ? 1 : 0) * mul;
      }
      const va = a[key] ?? '';
      const vb = b[key] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
      return String(va).localeCompare(String(vb)) * mul;
    };
    return [...list].sort(cmp);
  }

  function toggleSort(colKey) {
    if (sort.key === colKey) {
      sort = { key: colKey, dir: sort.dir === 'asc' ? 'desc' : 'asc' };
    } else {
      sort = { key: colKey, dir: 'desc' };
    }
  }

  // Infinite scroll
  const BATCH = 50;
  let visibleCount = $state(BATCH);

  let fullList = $derived(sortedAlerts(alerts));
  let visibleList = $derived(fullList.slice(0, visibleCount));

  // Reset visibleCount quand les alerts changent (nouveau filtre)
  $effect(() => { alerts; visibleCount = BATCH; });

  let sentinel;
  let observer;

  onMount(() => {
    observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && visibleCount < fullList.length) {
        visibleCount = Math.min(visibleCount + BATCH, fullList.length);
      }
    }, { rootMargin: '200px' });
    if (sentinel) observer.observe(sentinel);
  });

  onDestroy(() => { if (observer) observer.disconnect(); });

  // Expand
  let expandedId = $state(null);
  let matchCache = $state({}); // match_id → full h2h_matches row

  async function toggleExpand(alert) {
    if (expandedId === alert.id) { expandedId = null; return; }
    if (!matchCache[alert.match_id]) {
      const { data } = await supabase
        .from('h2h_matches')
        .select('*')
        .eq('id', alert.match_id)
        .maybeSingle();
      if (data) {
        matchCache[alert.match_id] = data;
        matchCache = matchCache;
      } else {
        // Fallback : on reconstitue à partir de l'alerte elle-même (scores + goal_events pas dispo)
        matchCache[alert.match_id] = {
          id: alert.match_id,
          home_team_id: alert.home_team_id,
          away_team_id: alert.away_team_id,
          home_team_name: alert.home_team_name,
          away_team_name: alert.away_team_name,
          home_goals: alert.result_home_goals,
          away_goals: alert.result_away_goals,
          home_goals_ht: alert.result_ht_home,
          away_goals_ht: alert.result_ht_away,
          goal_events: [],
        };
        matchCache = matchCache;
      }
    }
    expandedId = alert.id;
  }

  // Formatters
  function formatShortDate(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  }
  function scoreText(a) {
    if (a.result_home_goals == null || a.result_away_goals == null) return '—';
    return `${a.result_home_goals}-${a.result_away_goals}`;
  }
  function htText(a) {
    if (a.result_ht_home == null || a.result_ht_away == null) return '—';
    return `${a.result_ht_home}-${a.result_ht_away}`;
  }
  function resultBadge(a) {
    if (a.status === 'validated') return { label: '✓ Validé', cls: 'res--validated' };
    if (a.status === 'lost')      return { label: '✗ Perdu',  cls: 'res--lost'      };
    if (isInPlay(a))              return { label: 'EN COURS', cls: 'res--live'      };
    return                               { label: 'En attente', cls: 'res--pending' };
  }
  function signalBadgeClass(sig) {
    if (sig === 'DC') return 'badge--dc';
    if (strategyOf({ signal_type: sig }) === 'LG2') return 'badge--lg2';
    if (sig === 'FHG_A+B') return 'badge--fhg-ab';
    if (sig === 'FHG_A') return 'badge--fhg-dom';
    if (sig === 'FHG_B') return 'badge--fhg-ext';
    return 'badge--fhg';
  }
  function confBadgeClass(c) {
    if (c === 'fort_double') return 'badge--fort-double';
    if (c === 'fort') return 'badge--fort';
    return 'badge--moyen';
  }
</script>

{#if alerts.length === 0}
  <div class="empty-state" style="padding:30px;">
    <div class="empty-state__title">Aucun match</div>
    <div style="font-size:12px;color:var(--color-text-muted);margin-top:6px;">
      Aucun match ne correspond aux filtres actifs.
    </div>
  </div>
{:else}
  <div class="table-wrap">
    <table class="matches-table">
      <thead>
        <tr>
          {#each COLS as c}
            <th
              class="col--{c.key}"
              class:sortable={c.sortable}
              class:mobile-hide={!c.mobile}
              onclick={c.sortable ? () => toggleSort(c.key) : undefined}
            >
              {c.label}
              {#if c.sortable && sort.key === c.key}
                <span class="sort-indicator">{sort.dir === 'asc' ? '▲' : '▼'}</span>
              {/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each visibleList as a (a.id)}
          {@const r = resultBadge(a)}
          <tr class="data-row" class:expanded={expandedId === a.id} onclick={() => toggleExpand(a)}>
            <td class="col--match_date">{formatShortDate(a.match_date)}</td>
            <td class="col--league_name mobile-hide">{a.league_name || '—'}</td>
            <td class="col--teams"><span class="teams">{a.home_team_name} <span class="vs">vs</span> {a.away_team_name}</span></td>
            <td class="col--score score-{a.status}">{scoreText(a)}</td>
            <td class="col--ht mobile-hide">{htText(a)}</td>
            <td class="col--signal_type mobile-hide">
              <span class="badge {signalBadgeClass(a.signal_type)}">{a.signal_type || '—'}</span>
            </td>
            <td class="col--confidence mobile-hide">
              <span class="badge {confBadgeClass(a.confidence)}">{a.confidence || '—'}</span>
            </td>
            <td class="col--status">
              <span class="badge {r.cls}">{r.label}</span>
            </td>
          </tr>
          {#if expandedId === a.id}
            {@const match = matchCache[a.match_id]}
            <tr class="expand-row">
              <td colspan={COLS.length}>
                {#if match}
                  {@const bar = goalBar(match, 'home')}
                  <div class="expand-content">
                    <div class="expand-header">
                      <strong>{a.home_team_name}</strong>
                      <span class="expand-score">{scoreText(a)}</span>
                      <strong>{a.away_team_name}</strong>
                      <span class="expand-ht">(MT : {htText(a)})</span>
                    </div>
                    <div class="match-row__bar">
                      <div class="goal-bar">
                        <span class="goal-bar__marker" style="left:50%">HT</span>
                        <span class="goal-bar__marker" style="left:89%">80'</span>
                        <span class="goal-bar__marker" style="left:98%">FT</span>
                        {#each bar.goals as g}
                          <span class="goal-dot" class:goal-dot--conceded={!g.scored}
                            style="left:{g.pct}%"
                            data-tip="{g.scored ? a.home_team_name : a.away_team_name} - {g.raw}'"></span>
                        {/each}
                      </div>
                    </div>
                    {#if bar.goals.length === 0 && (a.result_home_goals || 0) + (a.result_away_goals || 0) > 0}
                      <div class="muted-note">Buts non détaillés (timing indisponible)</div>
                    {/if}
                  </div>
                {:else}
                  <div class="muted-note">Chargement...</div>
                {/if}
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
    <div bind:this={sentinel} class="sentinel"></div>
    {#if visibleCount < fullList.length}
      <div class="loading-more">Chargement... ({visibleCount} / {fullList.length})</div>
    {/if}
  </div>
{/if}

<style>
  .table-wrap {
    overflow-x: auto;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 10px;
  }
  .matches-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .matches-table th {
    background: rgba(255,255,255,0.02);
    padding: 9px 12px;
    text-align: left;
    font-weight: 600;
    font-size: 11px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }
  .matches-table th.sortable { cursor: pointer; user-select: none; }
  .matches-table th.sortable:hover { color: var(--color-text-primary); }
  .sort-indicator { margin-left: 4px; font-size: 10px; color: var(--color-accent-blue); }

  .matches-table td {
    padding: 9px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    vertical-align: middle;
  }
  .data-row { cursor: pointer; transition: background 0.12s; }
  .data-row:hover { background: rgba(255,255,255,0.03); }
  .data-row.expanded { background: rgba(55,138,221,0.08); }

  .col--match_date { white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--color-text-muted); }
  .col--league_name { color: var(--color-text-muted); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .col--teams .teams { font-weight: 500; }
  .col--teams .vs { color: var(--color-text-muted); font-weight: 400; font-size: 11px; margin: 0 2px; }
  .col--score { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .score-validated { color: var(--color-accent-green); }
  .score-lost { color: var(--color-danger); }
  .col--ht { color: var(--color-text-muted); font-size: 11px; white-space: nowrap; }

  .badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge--fhg { background: rgba(55,138,221,0.15); color: var(--color-accent-blue); }
  .badge--fhg-dom { background: rgba(55,138,221,0.15); color: var(--color-accent-blue); }
  .badge--fhg-ext { background: rgba(100,160,230,0.15); color: #7cb9f7; }
  .badge--fhg-ab  { background: rgba(29,158,117,0.2); color: var(--color-accent-green); }
  .badge--dc      { background: rgba(239,159,39,0.15); color: var(--color-signal-moyen); }
  .badge--lg2     { background: rgba(226,75,74,0.15); color: var(--color-danger); }
  .badge--fort-double { background: rgba(29,158,117,0.25); color: #fff; border: 1px solid var(--color-accent-green); }
  .badge--fort    { background: rgba(29,158,117,0.15); color: var(--color-accent-green); }
  .badge--moyen   { background: rgba(239,159,39,0.12); color: var(--color-signal-moyen); }
  .res--validated { background: rgba(29,158,117,0.15); color: var(--color-accent-green); }
  .res--lost      { background: rgba(226,75,74,0.15); color: var(--color-danger); }
  .res--live      { background: rgba(239,159,39,0.15); color: var(--color-signal-moyen); }
  .res--pending   { background: rgba(255,255,255,0.06); color: var(--color-text-muted); }

  .expand-row td { background: rgba(0,0,0,0.25); padding: 14px 18px; border-bottom: 2px solid var(--color-accent-blue); }
  .expand-content { display: flex; flex-direction: column; gap: 10px; }
  .expand-header { display: flex; align-items: center; gap: 10px; font-size: 13px; }
  .expand-score { font-size: 16px; font-weight: 700; color: var(--color-text-primary); }
  .expand-ht { color: var(--color-text-muted); font-size: 11px; }
  .muted-note { color: var(--color-text-muted); font-size: 11px; }

  .sentinel { height: 1px; }
  .loading-more { padding: 10px; text-align: center; color: var(--color-text-muted); font-size: 11px; }

  @media (max-width: 768px) {
    .mobile-hide { display: none; }
    .matches-table td, .matches-table th { padding: 6px 8px; font-size: 11px; }
  }
</style>
