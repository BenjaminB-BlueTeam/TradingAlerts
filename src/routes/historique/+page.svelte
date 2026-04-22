<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/api/supabase.js';
  import { isInPlay } from '$lib/utils/formatters.js';
  import { trades } from '$lib/stores/appStore.js';

  let alerts = $state([]);
  let loading = $state(true);
  let error = $state('');
  let activeFilter = $state('tous');
  let daysRange = $state(90);
  let hasMore = $state(true);

  const filters = [
    { key: 'tous',      label: 'Tous'      },
    { key: 'fhg',       label: 'FHG'       },
    { key: 'dc',        label: 'DC'        },
    { key: 'validated', label: 'Valid\u00e9'    },
    { key: 'lost',      label: 'Perdu'     },
    { key: 'encours',   label: 'En cours'  },
  ];

  function getCutoffDate(days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return cutoff.toISOString().split('T')[0];
  }

  async function loadAlerts() {
    loading = true;
    error = '';
    const cutoffISO = getCutoffDate(daysRange);
    const { data, error: dbError } = await supabase
      .from('alerts')
      .select('*')
      .gte('match_date', cutoffISO)
      .order('kickoff_unix', { ascending: false });
    if (dbError) {
      console.error('loadAlerts historique error:', dbError);
      error = 'Impossible de charger l\'historique des alertes.';
      alerts = [];
    } else {
      alerts = data || [];
      // Check if there might be older data
      hasMore = (data || []).length > 0;
    }
    loading = false;
  }

  async function loadMore() {
    daysRange += 90;
    await loadAlerts();
  }

  // Stats — uniquement sur alertes terminées
  let terminated = $derived(alerts.filter(a => a.status === 'validated' || a.status === 'lost'));

  let globalPct = $derived(terminated.length
    ? Math.round((terminated.filter(a => a.status === 'validated').length / terminated.length) * 100)
    : null);

  let fhgTerminated = $derived(terminated.filter(a => a.signal_type === 'FHG' || a.signal_type === 'FHG+DC'));
  let fhgPct = $derived(fhgTerminated.length
    ? Math.round((fhgTerminated.filter(a => a.status === 'validated').length / fhgTerminated.length) * 100)
    : null);

  let dcTerminated = $derived(terminated.filter(a => a.signal_type === 'DC' || a.signal_type === 'FHG+DC'));
  let dcPct = $derived(dcTerminated.length
    ? Math.round((dcTerminated.filter(a => a.status === 'validated').length / dcTerminated.length) * 100)
    : null);

  let fortTerminated = $derived(terminated.filter(a => a.confidence === 'fort'));
  let fortPct = $derived(fortTerminated.length
    ? Math.round((fortTerminated.filter(a => a.status === 'validated').length / fortTerminated.length) * 100)
    : null);

  let moyenTerminated = $derived(terminated.filter(a => a.confidence === 'moyen'));
  let moyenPct = $derived(moyenTerminated.length
    ? Math.round((moyenTerminated.filter(a => a.status === 'validated').length / moyenTerminated.length) * 100)
    : null);

  // Tableau par ligue trié par taux décroissant
  let leagueRows = $derived((() => {
    const map = {};
    for (const a of terminated) {
      const key = a.league_name || '—';
      if (!map[key]) map[key] = { validated: 0, lost: 0 };
      if (a.status === 'validated') map[key].validated++;
      else map[key].lost++;
    }
    return Object.entries(map)
      .map(([name, { validated, lost }]) => ({
        name,
        validated,
        lost,
        pct: Math.round((validated / (validated + lost)) * 100),
      }))
      .sort((a, b) => b.pct - a.pct);
  })());

  // Liaison trades ↔ alerts
  let tradeMatchIds = $derived(new Set(($trades || []).filter(t => t.match_id).map(t => t.match_id)));
  let tradedAlerts = $derived(terminated.filter(a => tradeMatchIds.has(a.match_id)));
  let tradedPct = $derived(tradedAlerts.length
    ? Math.round((tradedAlerts.filter(a => a.status === 'validated').length / tradedAlerts.length) * 100)
    : null);
  let tradedDiff = $derived(tradedPct !== null && globalPct !== null ? tradedPct - globalPct : null);

  // Liste filtrée
  let filteredAlerts = $derived(alerts.filter(a => {
    if (activeFilter === 'fhg')       return a.signal_type === 'FHG' || a.signal_type === 'FHG+DC';
    if (activeFilter === 'dc')        return a.signal_type === 'DC'  || a.signal_type === 'FHG+DC';
    if (activeFilter === 'validated') return a.status === 'validated';
    if (activeFilter === 'lost')      return a.status === 'lost';
    if (activeFilter === 'encours')   return a.status === 'pending' && isInPlay(a);
    return true;
  }));

  function countFor(key) {
    if (key === 'tous')      return alerts.length;
    if (key === 'fhg')       return alerts.filter(a => a.signal_type === 'FHG' || a.signal_type === 'FHG+DC').length;
    if (key === 'dc')        return alerts.filter(a => a.signal_type === 'DC'  || a.signal_type === 'FHG+DC').length;
    if (key === 'validated') return alerts.filter(a => a.status === 'validated').length;
    if (key === 'lost')      return alerts.filter(a => a.status === 'lost').length;
    if (key === 'encours')   return alerts.filter(a => a.status === 'pending' && isInPlay(a)).length;
    return 0;
  }

  function formatDate(unix) {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  function resultLabel(a) {
    if (a.status === 'validated') return { label: '✓ Validé',   cls: 'res--validated' };
    if (a.status === 'lost')      return { label: '✗ Perdu',    cls: 'res--lost'      };
    if (isInPlay(a))              return { label: 'EN COURS',   cls: 'res--live'      };
    return                               { label: 'En attente', cls: 'res--pending'   };
  }

  function pctColor(pct) {
    if (pct === null) return 'var(--color-text-muted)';
    if (pct >= 65) return 'var(--color-accent-green)';
    if (pct >= 50) return 'var(--color-signal-moyen)';
    return 'var(--color-danger)';
  }

  onMount(() => { loadAlerts(); });
</script>

<h1 class="page-title">📈 Historique des Alertes</h1>
<p class="page-subtitle">
  {alerts.length} alerte{alerts.length > 1 ? 's' : ''} au total — {terminated.length} terminée{terminated.length > 1 ? 's' : ''}
</p>

<!-- FILTRES -->
<div class="hist-filters">
  {#each filters as f}
    <button class="hist-filter-btn" class:active={activeFilter === f.key} aria-pressed={activeFilter === f.key} onclick={() => activeFilter = f.key}>
      {f.label} ({countFor(f.key)})
    </button>
  {/each}
</div>

{#if error}
  <p class="error-msg">{error}</p>
{/if}

{#if loading}
  <div class="empty-state">
    <div class="empty-state__icon">⏳</div>
    <div class="empty-state__title">Chargement...</div>
  </div>
{:else if alerts.length === 0}
  <div class="empty-state">
    <div class="empty-state__icon">📈</div>
    <div class="empty-state__title">Aucune alerte</div>
    <div style="font-size:12px;color:var(--color-text-muted);margin-top:8px;">Les alertes sont générées automatiquement toutes les 12h</div>
  </div>
{:else}

  <!-- STATS (uniquement si alertes terminées) -->
  {#if terminated.length > 0}
    <div class="kpi-row">
      <div class="kpi-card kpi-card--global">
        <div class="kpi-label">Global</div>
        <div class="kpi-value" style:color={pctColor(globalPct)}>{globalPct ?? '—'}%</div>
        <div class="kpi-sub">{terminated.filter(a => a.status === 'validated').length} / {terminated.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">FHG</div>
        <div class="kpi-value" style:color={pctColor(fhgPct)}>{fhgPct ?? '—'}%</div>
        <div class="kpi-sub">{fhgTerminated.filter(a => a.status === 'validated').length} / {fhgTerminated.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">DC</div>
        <div class="kpi-value" style:color={pctColor(dcPct)}>{dcPct ?? '—'}%</div>
        <div class="kpi-sub">{dcTerminated.filter(a => a.status === 'validated').length} / {dcTerminated.length}</div>
      </div>
    </div>

    <div class="conf-row">
      <div class="conf-card">
        <div class="conf-label">Confiance fort</div>
        <div class="conf-bar-wrap">
          <div class="conf-bar">
            <div class="conf-bar__fill" style:width="{fortPct ?? 0}%" style:background={pctColor(fortPct)}></div>
          </div>
          <span class="conf-pct" style:color={pctColor(fortPct)}>{fortPct ?? '—'}%</span>
        </div>
        <div class="conf-sub">{fortTerminated.filter(a => a.status === 'validated').length} / {fortTerminated.length}</div>
      </div>
      <div class="conf-card">
        <div class="conf-label">Confiance moyen</div>
        <div class="conf-bar-wrap">
          <div class="conf-bar">
            <div class="conf-bar__fill" style:width="{moyenPct ?? 0}%" style:background={pctColor(moyenPct)}></div>
          </div>
          <span class="conf-pct" style:color={pctColor(moyenPct)}>{moyenPct ?? '—'}%</span>
        </div>
        <div class="conf-sub">{moyenTerminated.filter(a => a.status === 'validated').length} / {moyenTerminated.length}</div>
      </div>
    </div>

    {#if tradedAlerts.length > 0}
      <div class="traded-row">
        <div class="conf-card" style="border-color: var(--color-accent-blue);">
          <div class="conf-label">Mes trades vs Global</div>
          <div style="display:flex;gap:16px;align-items:baseline;margin-top:6px;">
            <div>
              <span style="font-size:11px;color:var(--color-text-muted);">Global :</span>
              <span style="font-size:18px;font-weight:700;" style:color={pctColor(globalPct)}>{globalPct}%</span>
            </div>
            <div>
              <span style="font-size:11px;color:var(--color-text-muted);">Mes trades :</span>
              <span style="font-size:18px;font-weight:700;" style:color={pctColor(tradedPct)}>{tradedPct}%</span>
            </div>
            <div>
              <span style="font-size:11px;color:var(--color-text-muted);">Ecart :</span>
              <span style="font-size:18px;font-weight:700;" style:color={tradedDiff >= 0 ? 'var(--color-accent-green)' : 'var(--color-danger)'}>{tradedDiff >= 0 ? '+' : ''}{tradedDiff}%</span>
            </div>
          </div>
          <div class="conf-sub">{tradedAlerts.filter(a => a.status === 'validated').length} / {tradedAlerts.length} alertes jouées</div>
        </div>
      </div>
    {/if}

    {#if leagueRows.length > 0}
      <div class="league-table">
        <div class="league-table__header">Performance par ligue</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Ligue</th>
              <th style="text-align:center;color:var(--color-accent-green);">✓</th>
              <th style="text-align:center;color:var(--color-danger);">✗</th>
              <th style="text-align:right;">Taux</th>
            </tr>
          </thead>
          <tbody>
            {#each leagueRows as row}
              <tr>
                <td>{row.name}</td>
                <td style="text-align:center;font-weight:700;color:var(--color-accent-green);">{row.validated}</td>
                <td style="text-align:center;color:var(--color-danger);">{row.lost}</td>
                <td style="text-align:right;font-weight:700;" style:color={pctColor(row.pct)}>{row.pct}%</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}

  <!-- LISTE -->
  <div class="table-wrapper" style="margin-top:16px;">
    {#if filteredAlerts.length === 0}
      <div class="empty-state" style="padding:24px;">
        <div class="empty-state__icon">🔍</div>
        <div class="empty-state__title">Aucune alerte pour ce filtre</div>
      </div>
    {:else}
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Ligue</th>
            <th>Match</th>
            <th>Type</th>
            <th>Résultat</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredAlerts as a (a.id)}
            {@const res = resultLabel(a)}
            <tr>
              <td style="white-space:nowrap;">{formatDate(a.kickoff_unix)}</td>
              <td style="font-size:12px;color:var(--color-text-muted);">{a.league_name || '—'}</td>
              <td style="font-weight:600;">{a.home_team_name} - {a.away_team_name}</td>
              <td>
                <span class="type-badge type-badge--{a.signal_type.toLowerCase().replace('+', '')}">
                  {a.signal_type}
                </span>
              </td>
              <td><span class="res-label {res.cls}">{res.label}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  {#if hasMore}
    <div class="load-more-wrap">
      <button class="btn btn--secondary" onclick={loadMore}>
        Charger plus (au-dela de {daysRange} jours)
      </button>
    </div>
  {/if}
{/if}

<style>
  .load-more-wrap { display: flex; justify-content: center; margin-top: 16px; }
  .hist-filters { display: flex; gap: 4px; margin-bottom: 20px; flex-wrap: wrap; }
  .hist-filter-btn { background: rgba(255,255,255,0.05); border: 1px solid var(--color-border); border-radius: 6px; padding: 5px 12px; font-size: 12px; color: var(--color-text-muted); cursor: pointer; transition: all 0.15s; }
  .hist-filter-btn.active { background: var(--color-accent-blue); border-color: var(--color-accent-blue); color: white; }

  .kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }
  .kpi-card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 8px; padding: 14px; text-align: center; }
  .kpi-card--global { border-color: var(--color-accent-green); }
  .kpi-label { font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .kpi-value { font-size: 30px; font-weight: 700; }
  .kpi-sub { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }

  .conf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
  .conf-card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 8px; padding: 10px 14px; }
  .conf-label { font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; margin-bottom: 6px; }
  .conf-bar-wrap { display: flex; align-items: center; gap: 10px; }
  .conf-bar { flex: 1; background: rgba(255,255,255,0.06); border-radius: 4px; height: 8px; overflow: hidden; }
  .conf-bar__fill { height: 100%; border-radius: 4px; transition: width 0.4s; }
  .conf-pct { font-size: 14px; font-weight: 700; min-width: 36px; text-align: right; }
  .conf-sub { font-size: 10px; color: var(--color-text-muted); margin-top: 4px; }

  .league-table { margin-bottom: 8px; }
  .league-table__header { font-size: 11px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 0 4px; }

  .type-badge { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; }
  .type-badge--fhg   { background: rgba(55,138,221,0.15); color: var(--color-accent-blue); }
  .type-badge--dc    { background: rgba(239,159,39,0.15);  color: var(--color-signal-moyen); }
  .type-badge--fhgdc { background: rgba(29,158,117,0.15);  color: var(--color-accent-green); }

  .res-label { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
  .res--validated { background: rgba(29,158,117,0.15); color: var(--color-accent-green); }
  .res--lost      { background: rgba(226,75,74,0.15);  color: var(--color-danger); }
  .res--live      { background: rgba(239,159,39,0.2);  color: var(--color-signal-moyen); animation: pulse 2s infinite; }
  .res--pending   { background: rgba(255,255,255,0.05); color: var(--color-text-muted); }

  .traded-row { margin-bottom: 8px; }

  @media (max-width: 768px) {
    .conf-row { grid-template-columns: 1fr; }
  }
</style>
