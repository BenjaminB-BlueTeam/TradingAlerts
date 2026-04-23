<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/api/supabase.js';
  import { getDateStr, formatDateDMY, formatDate, formatTime, isInPlay, defeatColor, fhgColor } from '$lib/utils/formatters.js';

  let alerts = $state([]);
  let loading = $state(true);
  let error = $state('');
  let selectedDay = $state(null);
  let expandedId = $state(null);
  let h2hCache = $state({});

  const days = [
    { label: 'Pass\u00e9s', offset: -3 },
    { label: "Aujourd'hui", offset: 0 },
    { label: 'Demain', offset: 1 },
    { label: 'Apr\u00e8s-demain', offset: 2 },
  ];

  async function loadAlerts() {
    loading = true;
    error = '';
    const { data, error: dbError } = await supabase
      .from('alerts')
      .select('*')
      .gte('match_date', getDateStr(-3))
      .lte('match_date', getDateStr(2))
      .eq('signal_type', 'DC')
      .order('match_date', { ascending: false })
      .order('kickoff_unix', { ascending: true });
    if (dbError) {
      console.error('loadAlerts DC error:', dbError);
      error = 'Impossible de charger les alertes DC.';
      alerts = [];
    } else {
      alerts = data || [];
    }
    loading = false;
  }

  let filteredAlerts = $derived(alerts.filter(a => {
    if (selectedDay !== null && a.match_date !== getDateStr(selectedDay)) return false;
    return true;
  }));

  async function loadH2H(homeId, awayId) {
    const key = `${homeId}_${awayId}`;
    if (h2hCache[key]) return h2hCache[key];
    const { data } = await supabase
      .from('h2h_matches')
      .select('*')
      .eq('home_team_id', homeId)
      .eq('away_team_id', awayId)
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
    return h2hCache[`${homeId}_${awayId}`] || [];
  }

  function formatDateFull(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
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

  let generating = $state(false);
  let genMessage = $state('');
  let deleting = $state(false);
  let deleteMessage = $state('');

  async function handleDeleteVisible() {
    const ids = filteredAlerts.map(a => a.id);
    if (ids.length === 0) return;
    if (!confirm(`Supprimer ${ids.length} alerte${ids.length > 1 ? 's' : ''} visible${ids.length > 1 ? 's' : ''} ?`)) return;
    deleting = true;
    deleteMessage = '';
    try {
      const res = await fetch('/.netlify/functions/delete-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (data.error) {
        deleteMessage = `Erreur : ${data.error}`;
      } else {
        deleteMessage = `${data.deleted} alerte${data.deleted > 1 ? 's' : ''} supprimée${data.deleted > 1 ? 's' : ''}`;
        await loadAlerts();
      }
    } catch (e) {
      deleteMessage = `Erreur : ${e.message}`;
    }
    deleting = false;
  }

  async function handleGenerate() {
    generating = true;
    genMessage = '';
    try {
      const res = await fetch('/.netlify/functions/generate-alerts?type=DC');
      const data = await res.json();
      if (data.error) {
        genMessage = `Erreur : ${data.error}`;
      } else if (data.alerts_created > 0) {
        genMessage = `${data.alerts_created} alerte${data.alerts_created > 1 ? 's' : ''} DC créée${data.alerts_created > 1 ? 's' : ''}`;
        await loadAlerts();
      } else {
        genMessage = `Aucune alerte DC — ${data.analyzed} matchs analysés, aucun ne correspond`;
      }
    } catch (e) {
      genMessage = `Erreur : ${e.message}`;
    }
    generating = false;
  }

  onMount(() => { loadAlerts(); });
</script>

<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
  <div>
    <h1 class="page-title">🎯 Sélection DC</h1>
    <p class="page-subtitle">
      {alerts.length} signal{alerts.length > 1 ? 's' : ''} Double Chance — 3 derniers jours + à venir
    </p>
  </div>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
    <button class="btn btn--secondary btn--sm" onclick={handleGenerate} disabled={generating}>
      {generating ? '⏳...' : '🔄 Actualiser'}
    </button>
    {#if filteredAlerts.length > 0}
      <button class="btn btn--danger btn--sm" onclick={handleDeleteVisible} disabled={deleting}>
        {deleting ? '⏳...' : `Supprimer les ${filteredAlerts.length} visible${filteredAlerts.length > 1 ? 's' : ''}`}
      </button>
    {/if}
  </div>
</div>
{#if genMessage}
  <div style="font-size:12px;padding:6px 12px;margin-bottom:8px;border-radius:6px;background:rgba(255,255,255,0.04);color:var(--color-text-muted);">{genMessage}</div>
{/if}
{#if deleteMessage}
  <div style="font-size:12px;padding:6px 12px;margin-bottom:8px;border-radius:6px;background:rgba(226,75,74,0.08);color:var(--color-danger);">{deleteMessage}</div>
{/if}

<div class="dc-filters">
  <button class="dc-filter-btn" class:active={selectedDay === null} aria-pressed={selectedDay === null} onclick={() => selectedDay = null}>
    Tous ({alerts.length})
  </button>
  {#each days as day}
    {@const count = alerts.filter(a => a.match_date === getDateStr(day.offset)).length}
    <button class="dc-filter-btn" class:active={selectedDay === day.offset} aria-pressed={selectedDay === day.offset}
      onclick={() => selectedDay = (selectedDay === day.offset ? null : day.offset)}>
      {day.label} ({count})
    </button>
  {/each}
</div>

{#if error}
  <p class="error-msg">{error}</p>
{/if}

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
    <button class="btn btn--primary" style="margin-top:12px;" onclick={handleGenerate} disabled={generating}>
      {generating ? '⏳ Analyse en cours...' : '🎯 Lancer l\'analyse DC maintenant'}
    </button>
    {#if genMessage}
      <div style="font-size:12px;margin-top:8px;color:var(--color-text-muted);">{genMessage}</div>
    {/if}
  </div>
{:else}
  <div class="dc-list">
    {#each filteredAlerts as a (a.id)}
      <div class="dc-card"
        class:dc-card--expanded={expandedId === a.id}
        class:dc-card--validated={a.status === 'validated'}
        class:dc-card--lost={a.status === 'lost'}
        class:dc-card--live={a.status === 'pending' && isInPlay(a)}
      >
        <div class="dc-card__header" onclick={() => toggleExpand(a)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(a); } }} role="button" tabindex="0" aria-expanded={expandedId === a.id}>
          <div class="dc-card__time">
            <div class="dc-card__day">{formatDateDMY(a.match_date)}</div>
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
              <span class="dc-pill__label">% victoire</span>
              <span class="dc-pill__value" style:color={fhgColor(100 - a.dc_defeat_pct)}>{100 - a.dc_defeat_pct}%</span>
            </div>
            <div class="dc-pill">
              <span class="dc-pill__label">H2H</span>
              <span class="dc-pill__value">{a.h2h_count}</span>
            </div>
          </div>
          <div class="dc-card__badges">
            <span class="dc-badge {confidenceClass(a.confidence)}">{a.confidence}<span class="sr-only"> — confiance {a.confidence === 'fort' ? 'forte' : 'moyenne'}</span></span>
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
              H2H même config — <strong>{favName}</strong> gagne ou fait nul dans {100 - a.dc_defeat_pct}% des cas ({a.h2h_count} matchs total)
              {#if h2h.length === 0}<span style="color:var(--color-danger);margin-left:4px;">— aucun H2H dans cette config</span>{/if}
            </div>
            {#if h2h.length > 0}
              <table class="h2h-table">
                <tbody>
                  {#each h2h as m}
                    {@const res = h2hResult(m, a.dc_best_side, favId)}
                    <tr>
                      <td class="h2h-date">{formatDateFull(m.match_date)}</td>
                      <td class="h2h-team h2h-team--home" class:h2h-fav={m.home_team_id === favId}>{m.home_team_name}</td>
                      <td class="h2h-score">{m.home_goals ?? '?'} - {m.away_goals ?? '?'}</td>
                      <td class="h2h-team h2h-team--away" class:h2h-fav={m.away_team_id === favId}>{m.away_team_name}</td>
                      <td class="h2h-badge-cell"><span class="h2h-badge h2h-badge--{res}">{res}</span></td>
                    </tr>
                  {/each}
                </tbody>
              </table>
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

  .h2h-table { width: 100%; max-width: 600px; margin: 0 auto; border-collapse: collapse; }
  .h2h-table td { padding: 5px 6px; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: middle; }
  .h2h-date { color: var(--color-text-muted); font-size: 11px; white-space: nowrap; width: 65px; }
  .h2h-team { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .h2h-team--home { text-align: right; padding-right: 8px; }
  .h2h-team--away { text-align: left; padding-left: 8px; }
  .h2h-fav { font-weight: 800; color: var(--color-text-primary); }
  .h2h-score { text-align: center; font-weight: 700; white-space: nowrap; width: 40px; }
  .h2h-badge-cell { width: 24px; text-align: center; }
  .h2h-badge { display: inline-block; width: 18px; height: 18px; line-height: 18px; font-size: 10px; font-weight: 800; text-align: center; border-radius: 3px; }
  .h2h-badge--W { background: var(--color-accent-green); color: #fff; }
  .h2h-badge--D { background: var(--color-signal-moyen); color: #fff; }
  .h2h-badge--L { background: var(--color-danger); color: #fff; }

  @media (max-width: 768px) {
    .dc-card__header { flex-wrap: wrap; }
    .dc-card__stats { width: 100%; }
    .dc-expand { overflow-x: auto; }
    .h2h-table { min-width: 340px; }
  }
</style>
