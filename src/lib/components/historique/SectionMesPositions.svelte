<script>
  import { onMount } from 'svelte';
  import { Chart } from 'chart.js';
  import { onDestroy } from 'svelte';
  import { selectedKeys } from '$lib/stores/selectionStore.js';
  import { keyOf } from '$lib/utils/selectionFilters.js';
  import { fetchAlertTrades, insertAlertTrade, deleteAlertTrade } from '$lib/api/supabase.js';
  import { strategyOf } from '$lib/utils/historyFilters.js';

  let { alerts = [], strategy = 'FHG' } = $props();

  // ---------- Etat ----------
  let trades = $state([]);
  let loadingTrades = $state(true);
  let formMap = $state(new Map());
  let savingMap = $state(new Set());
  let openForms = $state(new Set()); // clés dont le form inline est ouvert
  let open = $state(false);

  // ---------- Filtrage ----------
  let myAlerts = $derived(
    alerts.filter(a =>
      !a.user_excluded &&
      a.confidence === 'fort' &&
      strategyOf(a) === strategy &&
      $selectedKeys.has(keyOf(a.match_id, a.signal_type))
    ).sort((a, b) => (b.kickoff_unix || 0) - (a.kickoff_unix || 0))
  );

  // ---------- Chargement ----------
  onMount(async () => {
    trades = await fetchAlertTrades();
    loadingTrades = false;
  });

  // ---------- Helpers trades ----------
  function tradesForAlert(matchId, signalType) {
    return trades.filter(t => t.match_id === matchId && t.signal_type === signalType);
  }

  function alertPnl(matchId, signalType, status) {
    const ts = tradesForAlert(matchId, signalType).filter(t => t.mise != null);
    if (!ts.length) return null;
    if (status === 'validated') return ts.reduce((s, t) => s + t.mise * (t.cote - 1), 0);
    if (status === 'lost') return ts.reduce((s, t) => s - t.mise, 0);
    return null;
  }

  let totalPnl = $derived(
    myAlerts.reduce((sum, a) => {
      const p = alertPnl(a.match_id, a.signal_type, a.status);
      return p !== null ? sum + p : sum;
    }, 0)
  );
  let hasPnl = $derived(myAlerts.some(a => alertPnl(a.match_id, a.signal_type, a.status) !== null));

  // ---------- KPI taux personnel ----------
  let myTerminated = $derived(
    myAlerts.filter(a => ['validated', 'lost'].includes(a.status))
  );
  let myTaux = $derived(
    myTerminated.length >= 3
      ? myTerminated.filter(a => a.status === 'validated').length / myTerminated.length
      : null
  );

  // ---------- ROI chart ----------
  const COTES = Array.from({ length: 19 }, (_, i) => +(1.20 + i * 0.10).toFixed(2));
  const COTE_LABELS = COTES.map(c => c.toFixed(2));
  const STRATEGY_COLOR = { FHG: '#1D9E75', LG2: '#E24B4A' };
  const color = STRATEGY_COLOR[strategy] || '#1D9E75';

  let targetCote = $state(2.00);
  let canvas;
  let chart = null;

  function roiData(t) {
    if (t === null) return COTES.map(() => null);
    return COTES.map(c => +((t * (c - 1) - (1 - t)) * 100).toFixed(2));
  }

  function draw() {
    if (!canvas) return;
    if (chart) { chart.destroy(); chart = null; }

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: COTE_LABELS,
        datasets: [
          {
            label: `${strategy} Mes selections`,
            data: roiData(myTaux),
            borderColor: color,
            backgroundColor: color + '14',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.3,
            fill: false,
          },
          {
            label: 'Equilibre',
            data: COTES.map(() => 0),
            borderColor: 'rgba(255,255,255,0.3)',
            borderWidth: 1,
            borderDash: [4, 4],
            pointRadius: 0,
            tension: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#A0A3B1',
              font: { size: 11 },
              filter: item => item.text !== 'Equilibre',
            },
          },
          tooltip: {
            backgroundColor: '#1A1D27',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleColor: '#F0F0F0',
            bodyColor: '#A0A3B1',
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) + '%' : '—'}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#888780', font: { size: 11 } },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              color: '#888780',
              font: { size: 11 },
              callback: v => v.toFixed(0) + '%',
            },
          },
        },
      },
    });
  }

  $effect(() => {
    myAlerts;
    myTaux;
    if (open && canvas && myTaux !== null) draw();
  });

  onDestroy(() => { if (chart) chart.destroy(); });

  // ---------- Actions ----------
  async function addTrade(alert) {
    const key = keyOf(alert.match_id, alert.signal_type);
    const form = formMap.get(key) || {};
    if (!form.cote || +form.cote <= 1) return;
    savingMap = new Set([...savingMap, key]);
    const inserted = await insertAlertTrade({
      match_id: alert.match_id,
      signal_type: alert.signal_type,
      cote: form.cote,
      mise: form.mise || null,
    });
    if (inserted) {
      trades = [...trades, inserted];
      formMap.set(key, { cote: '', mise: '' });
      formMap = new Map(formMap);
    }
    savingMap.delete(key);
    savingMap = new Set(savingMap);
  }

  async function removeTrade(tradeId) {
    await deleteAlertTrade(tradeId);
    trades = trades.filter(t => t.id !== tradeId);
  }

  function toggleForm(key) {
    const next = new Set(openForms);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    openForms = next;
  }

  function getForm(key) {
    if (!formMap.has(key)) formMap.set(key, { cote: '', mise: '' });
    return formMap.get(key);
  }

  function setFormField(key, field, value) {
    const current = formMap.get(key) || { cote: '', mise: '' };
    formMap.set(key, { ...current, [field]: value });
    formMap = new Map(formMap);
  }

  // ---------- Formatters ----------
  function pctColor(pct) {
    if (pct === null) return 'var(--color-text-muted)';
    if (pct >= 65) return 'var(--color-accent-green)';
    if (pct >= 50) return 'var(--color-signal-moyen)';
    return 'var(--color-text-muted)';
  }

  function formatDate(matchDate) {
    if (!matchDate) return '—';
    const d = new Date(matchDate);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  function formatPnl(val) {
    if (val === null) return '—';
    const sign = val >= 0 ? '+' : '';
    return `${sign}${val.toFixed(2)}€`;
  }
  function pnlColor(val) {
    if (val === null) return 'var(--color-text-muted)';
    if (val > 0) return 'var(--color-accent-green)';
    if (val < 0) return 'var(--color-danger)';
    return 'var(--color-text-muted)';
  }

  function roiColor(val) {
    if (val === null) return 'var(--color-text-muted)';
    return val >= 0 ? 'var(--color-accent-green)' : 'var(--color-danger)';
  }

  function formatRoi(val) {
    if (val === null) return '—';
    return (val >= 0 ? '+' : '') + val.toFixed(1) + '%';
  }

  let roiSlider = $derived(
    myTaux !== null
      ? +((myTaux * (targetCote - 1) - (1 - myTaux)) * 100).toFixed(1)
      : null
  );
</script>

<div class="section-block">
  <button
    type="button"
    class="section-header"
    onclick={() => {
      open = !open;
      if (open && myTaux !== null) setTimeout(() => draw(), 10);
    }}
    aria-expanded={open}
  >
    <span class="section-title">Mes positions {strategy}</span>
    <span class="section-meta">{myAlerts.length} alerte{myAlerts.length !== 1 ? 's' : ''} selectionnee{myAlerts.length !== 1 ? 's' : ''}</span>
    <span class="chevron" class:chevron--open={open}>&#8250;</span>
  </button>

  {#if open}
    <div class="section-body">

      {#if myAlerts.length === 0}
        <p class="empty-state-msg">
          Aucune alerte {strategy} fort selectionnee.
          Selectionne des alertes depuis
          <a href={strategy === 'FHG' ? '/alerts' : '/alerts-lg2'} class="link-inline">{strategy === 'FHG' ? '/alerts' : '/alerts-lg2'}</a>.
        </p>
      {:else}

        <!-- KPI ROW -->
        <div class="kpi-row">
          <div class="kpi-badge">
            <span class="kpi-badge__label">Selectionnees</span>
            <span class="kpi-badge__value" style:color="var(--color-text-primary)">{myAlerts.length}</span>
            <span class="kpi-badge__sub">matchs</span>
          </div>

          <div class="kpi-badge">
            <span class="kpi-badge__label">Taux personnel</span>
            {#if myTaux !== null}
              <span class="kpi-badge__value" style:color={pctColor(Math.round(myTaux * 100))}>{Math.round(myTaux * 100)}%</span>
              <span class="kpi-badge__sub">{myTerminated.filter(a => a.status === 'validated').length}/{myTerminated.length} terminees</span>
            {:else}
              <span class="kpi-badge__value" style:color="var(--color-text-muted)">—</span>
              <span class="kpi-badge__sub">min 3 terminees</span>
            {/if}
          </div>

          <div class="kpi-badge">
            <span class="kpi-badge__label">P&L total</span>
            {#if hasPnl}
              <span class="kpi-badge__value" style:color={pnlColor(totalPnl)}>{formatPnl(totalPnl)}</span>
              <span class="kpi-badge__sub">mises renseignees</span>
            {:else}
              <span class="kpi-badge__value" style:color="var(--color-text-muted)">—</span>
              <span class="kpi-badge__sub">aucune mise saisie</span>
            {/if}
          </div>
        </div>

        <!-- ROI CHART MES SELECTIONS -->
        {#if myTaux !== null}
          <div class="chart-wrap">
            <canvas bind:this={canvas}></canvas>
          </div>

          <div class="slider-block">
            <label class="slider-label" for="slider-pos-{strategy}">
              Cote simulee : <strong>{(+targetCote).toFixed(2)}</strong>
            </label>
            <input
              id="slider-pos-{strategy}"
              type="range"
              min="1.20"
              max="3.00"
              step="0.05"
              bind:value={targetCote}
              class="slider"
            />
            <div class="slider-result">
              Cote {(+targetCote).toFixed(2)} &rarr; ROI :
              <strong style:color={roiColor(roiSlider)}>{formatRoi(roiSlider)}</strong>
              <span class="slider-sub">(sur {myTerminated.length} alertes)</span>
            </div>
          </div>
        {:else}
          <p class="empty-msg">Pas assez de donnees pour le graphique (min 3 alertes terminees dans vos selections)</p>
        {/if}

        <!-- TABLE DES ALERTES -->
        {#if loadingTrades}
          <p class="empty-msg">Chargement des positions...</p>
        {:else}
          <div class="alerts-table-wrap">
            <table class="alerts-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Match</th>
                  <th>Ligue</th>
                  <th>Resultat</th>
                  <th>Mes mises</th>
                  <th>P&L</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {#each myAlerts as alert (alert.match_id + alert.signal_type)}
                  {@const alertKey = keyOf(alert.match_id, alert.signal_type)}
                  {@const alertTrades = tradesForAlert(alert.match_id, alert.signal_type)}
                  {@const pnl = alertPnl(alert.match_id, alert.signal_type, alert.status)}
                  {@const formOpen = openForms.has(alertKey)}
                  {@const form = getForm(alertKey)}

                  <tr class="alert-row">
                    <td class="td-date">{formatDate(alert.match_date)}</td>
                    <td class="td-match">
                      <span class="match-name">{alert.home_team_name || '?'} vs {alert.away_team_name || '?'}</span>
                    </td>
                    <td class="td-league">{alert.league_name || '—'}</td>
                    <td class="td-status">
                      {#if alert.status === 'validated'}
                        <span class="badge badge--validated">Valide</span>
                      {:else if alert.status === 'lost'}
                        <span class="badge badge--lost">Perdu</span>
                      {:else}
                        <span class="badge badge--pending">En cours</span>
                      {/if}
                    </td>
                    <td class="td-trades">
                      {#if alertTrades.length === 0}
                        <span class="td-empty">—</span>
                      {:else}
                        <div class="chips">
                          {#each alertTrades as t (t.id)}
                            <span class="chip">
                              {(+t.cote).toFixed(2)}&times;{t.mise != null ? ` ${t.mise}€` : ''}
                              <button
                                type="button"
                                class="chip-remove"
                                onclick={() => removeTrade(t.id)}
                                aria-label="Supprimer"
                              >×</button>
                            </span>
                          {/each}
                        </div>
                      {/if}
                    </td>
                    <td class="td-pnl">
                      {#if pnl !== null}
                        <span style:color={pnlColor(pnl)}>{formatPnl(pnl)}</span>
                      {:else}
                        <span class="td-empty">—</span>
                      {/if}
                    </td>
                    <td class="td-action">
                      <button
                        type="button"
                        class="btn-add"
                        class:btn-add--open={formOpen}
                        onclick={() => toggleForm(alertKey)}
                        aria-label="Ajouter une position"
                      >+</button>
                    </td>
                  </tr>

                  {#if formOpen}
                    <tr class="form-row">
                      <td colspan="7">
                        <div class="inline-form">
                          <input
                            type="number"
                            min="1.01"
                            step="0.01"
                            placeholder="Cote ex: 2.10"
                            class="form-input"
                            value={form.cote}
                            oninput={e => setFormField(alertKey, 'cote', e.currentTarget.value)}
                          />
                          <input
                            type="number"
                            min="0.01"
                            step="0.50"
                            placeholder="Mise € (optionnel)"
                            class="form-input"
                            value={form.mise}
                            oninput={e => setFormField(alertKey, 'mise', e.currentTarget.value)}
                          />
                          <button
                            type="button"
                            class="btn btn--primary btn--sm"
                            disabled={savingMap.has(alertKey) || !form.cote || +form.cote <= 1}
                            onclick={() => addTrade(alert)}
                          >
                            {savingMap.has(alertKey) ? '...' : 'Ajouter'}
                          </button>
                          <button
                            type="button"
                            class="btn btn--ghost btn--sm"
                            onclick={() => toggleForm(alertKey)}
                          >×</button>
                        </div>
                      </td>
                    </tr>
                  {/if}
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      {/if}

    </div>
  {/if}
</div>

<style>
  .section-block {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    margin-top: 12px;
    overflow: hidden;
  }

  .section-header {
    width: 100%;
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 10px 14px;
    cursor: pointer;
    background: none;
    border: none;
    text-align: left;
  }
  .section-header:hover {
    background: rgba(255,255,255,0.02);
  }

  .section-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text-primary);
  }
  .section-meta {
    font-size: 11px;
    color: var(--color-text-muted);
    flex: 1;
  }

  .chevron {
    color: var(--color-text-muted);
    font-size: 18px;
    line-height: 1;
    transform: rotate(90deg);
    transition: transform var(--transition-fast);
    display: inline-block;
    align-self: center;
  }
  .chevron--open {
    transform: rotate(-90deg);
  }

  .section-body {
    padding: 12px 14px 16px;
    border-top: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .empty-state-msg {
    font-size: 13px;
    color: var(--color-text-muted);
    padding: 12px 0;
  }
  .link-inline {
    color: var(--color-accent-blue);
    text-decoration: none;
  }
  .link-inline:hover {
    text-decoration: underline;
  }

  .kpi-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .kpi-badge {
    flex: 1;
    min-width: 120px;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .kpi-badge__label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted);
  }
  .kpi-badge__value {
    font-size: 22px;
    font-weight: 700;
    line-height: 1.2;
  }
  .kpi-badge__sub {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .chart-wrap {
    position: relative;
    height: 200px;
  }

  .slider-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .slider-label {
    font-size: 12px;
    color: var(--color-text-secondary);
  }
  .slider {
    width: 100%;
    accent-color: var(--color-accent-blue);
    cursor: pointer;
  }
  .slider-result {
    font-size: 12px;
    color: var(--color-text-secondary);
  }
  .slider-sub {
    color: var(--color-text-muted);
    margin-left: 4px;
  }

  .empty-msg {
    font-size: 12px;
    color: var(--color-text-muted);
    padding: 8px 0;
  }

  /* Table alertes */
  .alerts-table-wrap {
    overflow-x: auto;
  }

  .alerts-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .alerts-table thead th {
    text-align: left;
    padding: 5px 8px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }
  .alert-row td {
    padding: 7px 8px;
    vertical-align: middle;
    color: var(--color-text-primary);
    border-bottom: 1px solid var(--color-border);
  }
  .form-row td {
    padding: 0;
    border-bottom: 1px solid var(--color-border);
    background: rgba(255,255,255,0.02);
  }

  .td-date {
    white-space: nowrap;
    color: var(--color-text-muted);
    font-size: 11px;
  }
  .td-match {
    min-width: 160px;
  }
  .match-name {
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
    display: block;
  }
  .td-league {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-muted);
    font-size: 11px;
  }
  .td-status {
    white-space: nowrap;
  }
  .td-trades {
    min-width: 120px;
  }
  .td-pnl {
    white-space: nowrap;
    text-align: right;
    font-weight: 600;
    font-size: 12px;
  }
  .td-action {
    width: 32px;
    text-align: center;
  }
  .td-empty {
    color: var(--color-text-muted);
  }

  /* Badges statut */
  .badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .badge--validated {
    background: rgba(29,158,117,0.15);
    color: var(--color-accent-green);
  }
  .badge--lost {
    background: rgba(226,75,74,0.15);
    color: var(--color-danger);
  }
  .badge--pending {
    background: rgba(255,255,255,0.06);
    color: var(--color-text-muted);
  }

  /* Chips trades */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: rgba(255,255,255,0.06);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }
  .chip-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 13px;
    line-height: 1;
    padding: 0 1px;
  }
  .chip-remove:hover {
    color: var(--color-danger);
  }

  /* Bouton + */
  .btn-add {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1px solid var(--color-border);
    background: rgba(255,255,255,0.05);
    color: var(--color-text-muted);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .btn-add:hover,
  .btn-add--open {
    background: rgba(255,255,255,0.1);
    color: var(--color-text-primary);
    border-color: var(--color-text-muted);
  }

  /* Form inline */
  .inline-form {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 12px;
    flex-wrap: wrap;
  }
  .form-input {
    width: 130px;
    background: var(--color-bg-input, rgba(255,255,255,0.06));
    border: 1px solid var(--color-border);
    border-radius: 5px;
    padding: 5px 8px;
    font-size: 12px;
    color: var(--color-text-primary);
    outline: none;
  }
  .form-input:focus {
    border-color: var(--color-accent-blue);
  }

  @media (max-width: 640px) {
    .kpi-row { gap: 8px; }
    .kpi-badge { min-width: 100px; }
    .kpi-badge__value { font-size: 18px; }
    .td-league { display: none; }
    .match-name { max-width: 120px; }
    .form-input { width: 100px; }
  }
</style>
