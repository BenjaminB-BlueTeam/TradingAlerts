<script>
  import { onMount } from 'svelte';
  import { supabase, excludeAlert, unexcludeAlert } from '$lib/api/supabase.js';
  import { getDateStr, formatTime, isInPlay, fhgColor, defeatColor } from '$lib/utils/formatters.js';
  import ExcludeAlertModal from '$lib/components/ExcludeAlertModal.svelte';

  let alerts = $state([]);
  let loading = $state(true);
  let error = $state('');

  // Exclusion modale
  let excludeModalOpen = $state(false);
  let excludeModalAlert = $state(null);
  let excludeError = $state('');

  function openExcludeModal(alert) {
    excludeModalAlert = alert;
    excludeModalOpen = true;
  }

  async function handleExcluded(e) {
    const { tags, note } = e.detail;
    try {
      await excludeAlert(excludeModalAlert.match_id, tags, note);
      await loadAlerts();
    } catch (err) {
      excludeError = 'Erreur lors de l\'exclusion : ' + (err.message || err);
    }
  }

  async function handleUnexclude(alert) {
    try {
      await unexcludeAlert(alert.match_id);
      await loadAlerts();
    } catch (err) {
      excludeError = 'Erreur lors de la réintégration : ' + (err.message || err);
    }
  }

  // Stats calculees
  let todayStr = $derived(getDateStr(0));
  let todayAlerts = $derived(alerts.filter(a => a.match_date === todayStr));
  let fhgAlerts = $derived(todayAlerts.filter(a => ['FHG_A','FHG_B','FHG_A+B'].includes(a.signal_type) && !a.user_excluded));
  let dcAlerts = $derived(todayAlerts.filter(a => a.signal_type === 'DC' && !a.user_excluded));
  let validatedToday = $derived(todayAlerts.filter(a => a.status === 'validated'));
  let lostToday = $derived(todayAlerts.filter(a => a.status === 'lost'));
  let pendingToday = $derived(todayAlerts.filter(a => a.status === 'pending'));
  let liveToday = $derived(pendingToday.filter(a => isInPlay(a)));
  let fortToday = $derived(todayAlerts.filter(a => a.confidence === 'fort'));
  let moyenToday = $derived(todayAlerts.filter(a => a.confidence === 'moyen'));

  // Alertes a venir (demain + apres-demain)
  let upcomingAlerts = $derived(alerts.filter(a => a.match_date > todayStr));

  // Date
  let now = new Date();
  let dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  function confidenceClass(c) {
    return c === 'fort' ? 'alert-badge--fort' : 'alert-badge--moyen';
  }

  async function loadAlerts() {
    loading = true;
    error = '';
    const { data, error: dbError } = await supabase
      .from('alerts')
      .select('*')
      .gte('match_date', getDateStr(0))
      .lte('match_date', getDateStr(2))
      .order('match_date', { ascending: true })
      .order('kickoff_unix', { ascending: true });
    if (dbError) {
      console.error('Dashboard loadAlerts error:', dbError);
      error = 'Impossible de charger les alertes.';
      alerts = [];
    } else {
      alerts = data || [];
    }
    loading = false;
  }

  onMount(() => { loadAlerts(); });
</script>

<!-- DASHBOARD HEADER -->
<div class="dashboard-header">
  <div class="dashboard-header__left">
    <h1 class="page-title" style="margin-bottom:0;">Dashboard</h1>
    <div class="dashboard-header__date">{dateLabel}</div>
  </div>
</div>

<!-- METRIC GRID -->
<div class="metric-grid">
  <div class="metric-card">
    <div class="metric-card__label">Alertes FHG</div>
    <div class="metric-card__value green">{fhgAlerts.length}</div>
    <div class="metric-card__sub">dont {fortToday.length} fort{fortToday.length > 1 ? 's' : ''}</div>
  </div>
  <div class="metric-card">
    <div class="metric-card__label">Alertes DC</div>
    <div class="metric-card__value blue">{dcAlerts.length}</div>
    <div class="metric-card__sub">aujourd'hui</div>
  </div>
  <div class="metric-card">
    <div class="metric-card__label">Valides</div>
    <div class="metric-card__value green">{validatedToday.length}</div>
    <div class="metric-card__sub">aujourd'hui</div>
  </div>
  <div class="metric-card">
    <div class="metric-card__label">En attente</div>
    <div class="metric-card__value" class:orange={pendingToday.length > 0}>{pendingToday.length}</div>
    <div class="metric-card__sub">{liveToday.length} en cours</div>
  </div>
</div>

{#if loading}
  <div class="page-loading">
    <div class="spinner"></div>
    <p style="color:var(--color-text-muted);">Chargement des alertes...</p>
  </div>
{:else if error}
  <p class="error-msg">{error}</p>
{:else}

  <!-- ALERTES DU JOUR -->
  {#if todayAlerts.length > 0}
    <div class="section-title">Aujourd'hui — {todayAlerts.length} alerte{todayAlerts.length > 1 ? 's' : ''}</div>
    <div class="dash-alerts-list">
      {#each todayAlerts as a (a.id)}
        <div class="dash-alert-card"
          class:dash-alert-card--validated={a.status === 'validated'}
          class:dash-alert-card--lost={a.status === 'lost'}
          class:dash-alert-card--live={a.status === 'pending' && isInPlay(a)}
        >
          <div class="dash-alert-card__time">
            <div class="dash-alert-card__hour">{formatTime(a.kickoff_unix)}</div>
          </div>
          <div class="dash-alert-card__match">
            <div class="dash-alert-card__teams">{a.home_team_name} - {a.away_team_name}</div>
            <div class="dash-alert-card__league">{a.league_name || '—'}</div>
          </div>
          <div class="dash-alert-card__pills">
            {#if a.fhg_pct}
              <span class="dash-pill" style:color={fhgColor(a.fhg_pct)}>FHG {a.fhg_pct}%</span>
            {/if}
            {#if a.dc_defeat_pct !== null && a.dc_defeat_pct !== undefined}
              <span class="dash-pill" style:color={defeatColor(a.dc_defeat_pct)}>DC {a.dc_defeat_pct}%</span>
            {/if}
          </div>
          <div class="dash-alert-card__badges">
            <span class="alert-badge {confidenceClass(a.confidence)}">{a.confidence}</span>
            {#if a.status === 'validated'}
              <span class="alert-badge alert-badge--validated">Valide</span>
            {:else if a.status === 'lost'}
              <span class="alert-badge alert-badge--lost">Perdu</span>
            {:else if isInPlay(a)}
              <span class="alert-badge alert-badge--live">EN COURS</span>
            {/if}
            {#if a.user_excluded}
              <span class="alert-badge alert-badge--exclu">EXCLUE</span>
              <button class="btn-exclude btn-exclude--reinstate" onclick={() => handleUnexclude(a)}>Réintégrer</button>
            {:else if a.status === 'pending'}
              <button class="btn-exclude" onclick={() => openExcludeModal(a)} title="Exclure cette alerte">✕</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty-state">
      <div class="empty-state__icon">📊</div>
      <div class="empty-state__title">Aucune alerte aujourd'hui</div>
      <div class="empty-state__desc">Les alertes sont generees automatiquement toutes les 12h</div>
    </div>
  {/if}

  <!-- ALERTES A VENIR -->
  {#if upcomingAlerts.length > 0}
    <div class="section-title" style="margin-top:24px;">A venir — {upcomingAlerts.length} alerte{upcomingAlerts.length > 1 ? 's' : ''}</div>
    <div class="dash-alerts-list">
      {#each upcomingAlerts as a (a.id)}
        <div class="dash-alert-card">
          <div class="dash-alert-card__time">
            <div class="dash-alert-card__day">{a.match_date}</div>
            <div class="dash-alert-card__hour">{formatTime(a.kickoff_unix)}</div>
          </div>
          <div class="dash-alert-card__match">
            <div class="dash-alert-card__teams">{a.home_team_name} - {a.away_team_name}</div>
            <div class="dash-alert-card__league">{a.league_name || '—'}</div>
          </div>
          <div class="dash-alert-card__pills">
            {#if a.fhg_pct}
              <span class="dash-pill" style:color={fhgColor(a.fhg_pct)}>FHG {a.fhg_pct}%</span>
            {/if}
            {#if a.dc_defeat_pct !== null && a.dc_defeat_pct !== undefined}
              <span class="dash-pill" style:color={defeatColor(a.dc_defeat_pct)}>DC {a.dc_defeat_pct}%</span>
            {/if}
          </div>
          <div class="dash-alert-card__badges">
            <span class="alert-badge {confidenceClass(a.confidence)}">{a.confidence}</span>
            {#if a.user_excluded}
              <span class="alert-badge alert-badge--exclu">EXCLUE</span>
              <button class="btn-exclude btn-exclude--reinstate" onclick={() => handleUnexclude(a)}>Réintégrer</button>
            {:else}
              <button class="btn-exclude" onclick={() => openExcludeModal(a)} title="Exclure">✕</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

{/if}

<ExcludeAlertModal
  alert={excludeModalAlert}
  bind:open={excludeModalOpen}
  on:excluded={handleExcluded}
/>

{#if excludeError}
  <p style="color:#e53e3e;font-size:12px;margin-top:8px;">{excludeError}</p>
{/if}

<style>
  .dashboard-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .dashboard-header__date { font-size: 13px; color: var(--color-text-muted); margin-top: 2px; text-transform: capitalize; }

  .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .metric-card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius-lg, 10px); padding: 16px; text-align: center; }
  .metric-card__label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 4px; }
  .metric-card__value { font-size: 28px; font-weight: 700; }
  .metric-card__value.green { color: var(--color-accent-green); }
  .metric-card__value.blue { color: var(--color-accent-blue); }
  .metric-card__value.orange { color: var(--color-signal-moyen); }
  .metric-card__sub { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }

  .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-primary); margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid var(--color-border); }

  .dash-alerts-list { display: flex; flex-direction: column; gap: 6px; }

  .dash-alert-card { display: flex; align-items: center; gap: 12px; background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 8px; padding: 10px 14px; transition: border-color 0.2s; }
  .dash-alert-card:hover { border-color: var(--color-accent-blue); }
  .dash-alert-card--validated { border-color: var(--color-accent-green) !important; background: rgba(29,158,117,0.04); }
  .dash-alert-card--lost { border-color: var(--color-danger) !important; background: rgba(226,75,74,0.04); }
  .dash-alert-card--live { border-color: var(--color-signal-moyen) !important; background: rgba(239,159,39,0.04); }

  .dash-alert-card__time { min-width: 50px; text-align: center; flex-shrink: 0; }
  .dash-alert-card__day { font-size: 10px; color: var(--color-text-muted); }
  .dash-alert-card__hour { font-size: 14px; font-weight: 600; }
  .dash-alert-card__match { flex: 1; min-width: 0; }
  .dash-alert-card__teams { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dash-alert-card__league { font-size: 11px; color: var(--color-text-muted); margin-top: 1px; }

  .dash-alert-card__pills { display: flex; gap: 6px; flex-shrink: 0; }
  .dash-pill { font-size: 12px; font-weight: 700; background: rgba(255,255,255,0.04); border-radius: 5px; padding: 2px 8px; }

  .dash-alert-card__badges { display: flex; gap: 4px; flex-shrink: 0; align-items: center; }

  .btn-exclude {
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    line-height: 1;
    transition: all 0.15s;
  }
  .btn-exclude:hover { border-color: #e53e3e; color: #e53e3e; }
  .btn-exclude--reinstate { border-color: var(--color-accent-blue); color: var(--color-accent-blue); font-size: 11px; }
  .btn-exclude--reinstate:hover { background: var(--color-accent-blue); color: #fff; }

  .alert-badge--exclu { background: rgba(100,100,100,0.15); color: #888; border: 1px solid #555; }

  @media (max-width: 768px) {
    .metric-grid { grid-template-columns: repeat(2, 1fr); }
    .dash-alert-card { flex-wrap: wrap; }
    .dash-alert-card__pills { width: 100%; }
  }
</style>
