<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/api/supabase.js';

  let alerts = [];
  let loading = true;
  let selectedDay = -1; // -1 = tous
  let selectedType = 'all'; // all | FHG | DC | FHG+DC

  const days = [
    { label: "Aujourd'hui", offset: 0 },
    { label: 'Demain', offset: 1 },
    { label: 'Après-demain', offset: 2 },
  ];

  function getDateStr(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
  }

  async function loadAlerts() {
    loading = true;
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .gte('match_date', getDateStr(0))
      .lte('match_date', getDateStr(2))
      .order('match_date', { ascending: true })
      .order('kickoff_unix', { ascending: true });

    if (error) {
      console.error('loadAlerts:', error);
      alerts = [];
    } else {
      alerts = data || [];
    }
    loading = false;
  }

  $: filteredAlerts = alerts.filter(a => {
    if (selectedDay !== -1) {
      const dateStr = getDateStr(selectedDay);
      if (a.match_date !== dateStr) return false;
    }
    if (selectedType !== 'all' && a.signal_type !== selectedType) return false;
    return true;
  });

  $: fhgAlerts = filteredAlerts.filter(a => a.signal_type === 'FHG' || a.signal_type === 'FHG+DC');
  $: dcAlerts = filteredAlerts.filter(a => a.signal_type === 'DC' || a.signal_type === 'FHG+DC');

  function formatTime(unix) {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function defeatColor(pct) {
    if (pct <= 20) return 'var(--color-accent-green)';
    if (pct <= 30) return 'var(--color-signal-moyen)';
    return 'var(--color-danger)';
  }

  function fhgColor(pct) {
    if (pct >= 80) return 'var(--color-accent-green)';
    if (pct >= 70) return 'var(--color-signal-moyen)';
    return 'var(--color-text-muted)';
  }

  function confidenceClass(c) {
    return c === 'fort' ? 'alert-badge--fort' : 'alert-badge--moyen';
  }

  onMount(() => { loadAlerts(); });
</script>

<div class="page-title">🔔 Alertes</div>
<div class="page-subtitle">
  {alerts.length} alerte{alerts.length > 1 ? 's' : ''} sur les 3 prochains jours
</div>

<!-- Filtres -->
<div class="alerts-filters">
  <button class="alerts-filter-btn" class:active={selectedDay === -1} on:click={() => selectedDay = -1}>
    Tous ({alerts.length})
  </button>
  {#each days as day, i}
    {@const count = alerts.filter(a => a.match_date === getDateStr(i)).length}
    <button class="alerts-filter-btn" class:active={selectedDay === i} on:click={() => selectedDay = i}>
      {day.label} ({count})
    </button>
  {/each}
</div>

{#if loading}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">⏳</div>
    <div class="empty-state__title">Chargement des alertes...</div>
  </div>
{:else if filteredAlerts.length === 0}
  <div class="empty-state" style="padding:40px;">
    <div class="empty-state__icon">🔔</div>
    <div class="empty-state__title">Aucune alerte</div>
    <div style="font-size:12px;color:var(--color-text-muted);margin-top:8px;">
      Les alertes sont generees automatiquement toutes les 12h
    </div>
  </div>
{:else}

  <!-- SECTION FHG -->
  {#if fhgAlerts.length > 0}
    <div class="alerts-section">
      <div class="alerts-section__header">
        <span class="alerts-section__icon">⚽</span>
        <span class="alerts-section__title">FHG — But en 1re mi-temps</span>
        <span class="alerts-section__count">{fhgAlerts.length}</span>
      </div>
      <div class="alerts-list">
        {#each fhgAlerts as a (a.id)}
          <div class="alert-card">
            <div class="alert-card__time">
              <div class="alert-card__day">{a.match_date}</div>
              <div class="alert-card__hour">{formatTime(a.kickoff_unix)}</div>
            </div>
            <div class="alert-card__match">
              <div class="alert-card__teams">{a.home_team_name} vs {a.away_team_name}</div>
              <div class="alert-card__league">{a.league_name || '—'}</div>
            </div>
            <div class="alert-card__stats">
              {#if a.fhg_pct}
                <div class="alert-pill">
                  <span class="alert-pill__label">Score FHG</span>
                  <span class="alert-pill__value" style:color={fhgColor(a.fhg_pct)}>{a.fhg_pct}%</span>
                </div>
              {/if}
              {#if a.fhg_factors}
                <div class="alert-pill">
                  <span class="alert-pill__label">Rec. 1MT</span>
                  <span class="alert-pill__value">{a.fhg_factors.recurrence1MT}%</span>
                </div>
                <div class="alert-pill">
                  <span class="alert-pill__label">2+ buts</span>
                  <span class="alert-pill__value">{a.fhg_factors.double1MT}%</span>
                </div>
              {/if}
            </div>
            <div class="alert-card__badges">
              <span class="alert-badge alert-badge--fhg">FHG</span>
              {#if a.signal_type === 'FHG+DC'}<span class="alert-badge alert-badge--dc">DC</span>{/if}
              <span class="alert-badge {confidenceClass(a.fhg_confidence)}">{a.fhg_confidence}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- SECTION DC -->
  {#if dcAlerts.length > 0}
    <div class="alerts-section">
      <div class="alerts-section__header">
        <span class="alerts-section__icon">🎯</span>
        <span class="alerts-section__title">Double Chance</span>
        <span class="alerts-section__count">{dcAlerts.length}</span>
      </div>
      <div class="alerts-list">
        {#each dcAlerts as a (a.id)}
          <div class="alert-card">
            <div class="alert-card__time">
              <div class="alert-card__day">{a.match_date}</div>
              <div class="alert-card__hour">{formatTime(a.kickoff_unix)}</div>
            </div>
            <div class="alert-card__match">
              <div class="alert-card__teams">{a.home_team_name} vs {a.away_team_name}</div>
              <div class="alert-card__league">{a.league_name || '—'}</div>
            </div>
            <div class="alert-card__stats">
              {#if a.dc_defeat_pct !== null}
                <div class="alert-pill">
                  <span class="alert-pill__label">Def. H2H</span>
                  <span class="alert-pill__value" style:color={defeatColor(a.dc_defeat_pct)}>{a.dc_defeat_pct}%</span>
                </div>
              {/if}
              <div class="alert-pill">
                <span class="alert-pill__label">H2H</span>
                <span class="alert-pill__value">{a.h2h_count}</span>
              </div>
              <div class="alert-pill">
                <span class="alert-pill__label">Cote</span>
                <span class="alert-pill__value">{a.dc_best_side === 'home' ? 'DOM' : 'EXT'}</span>
              </div>
            </div>
            <div class="alert-card__badges">
              {#if a.signal_type === 'FHG+DC'}<span class="alert-badge alert-badge--fhg">FHG</span>{/if}
              <span class="alert-badge alert-badge--dc">DC</span>
              <span class="alert-badge {confidenceClass(a.dc_confidence)}">{a.dc_confidence}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
{/if}

<style>
  .alerts-filters { display: flex; gap: 4px; margin-bottom: 20px; }
  .alerts-filter-btn { background: rgba(255,255,255,0.05); border: 1px solid var(--color-border); border-radius: 6px; padding: 5px 12px; font-size: 12px; color: var(--color-text-muted); cursor: pointer; transition: all 0.15s; }
  .alerts-filter-btn.active { background: var(--color-accent-blue); border-color: var(--color-accent-blue); color: white; }

  .alerts-section { margin-bottom: 28px; }
  .alerts-section__header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--color-border); }
  .alerts-section__icon { font-size: 18px; }
  .alerts-section__title { font-size: 15px; font-weight: 600; }
  .alerts-section__count { background: rgba(255,255,255,0.08); color: var(--color-text-muted); font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; margin-left: auto; }

  .alerts-list { display: flex; flex-direction: column; gap: 6px; }
  .alert-card { display: flex; align-items: center; gap: 14px; background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 8px; padding: 10px 14px; transition: border-color 0.15s; }
  .alert-card:hover { border-color: var(--color-accent-blue); }

  .alert-card__time { min-width: 70px; text-align: center; }
  .alert-card__day { font-size: 10px; color: var(--color-text-muted); }
  .alert-card__hour { font-size: 14px; font-weight: 600; }
  .alert-card__match { flex: 1; min-width: 0; }
  .alert-card__teams { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .alert-card__league { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }

  .alert-card__stats { display: flex; gap: 6px; flex-shrink: 0; }
  .alert-pill { display: flex; flex-direction: column; align-items: center; background: rgba(255,255,255,0.04); border-radius: 6px; padding: 3px 8px; min-width: 48px; }
  .alert-pill__label { font-size: 9px; font-weight: 600; text-transform: uppercase; color: var(--color-text-muted); }
  .alert-pill__value { font-size: 13px; font-weight: 700; }

  .alert-card__badges { display: flex; gap: 4px; flex-shrink: 0; }
  .alert-badge { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; }
  .alert-badge--fhg { background: rgba(29, 158, 117, 0.15); color: var(--color-accent-green); }
  .alert-badge--dc { background: rgba(55, 138, 221, 0.15); color: var(--color-accent-blue); }
  .alert-badge--fort { background: rgba(29, 158, 117, 0.15); color: var(--color-accent-green); }
  .alert-badge--moyen { background: rgba(239, 159, 39, 0.15); color: var(--color-signal-moyen); }

  @media (max-width: 640px) {
    .alert-card { flex-wrap: wrap; }
    .alert-card__stats { width: 100%; justify-content: center; }
  }
</style>
