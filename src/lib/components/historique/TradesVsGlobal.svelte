<script>
  import { trades } from '$lib/stores/appStore.js';

  let { terminated = [] } = $props();

  function pctColor(pct) {
    if (pct === null) return 'var(--color-text-muted)';
    if (pct >= 65) return 'var(--color-accent-green)';
    if (pct >= 50) return 'var(--color-signal-moyen)';
    return 'var(--color-danger)';
  }

  let tradeMatchIds = $derived(new Set(($trades || []).filter(t => t.match_id).map(t => t.match_id)));
  let tradedAlerts = $derived(terminated.filter(a => tradeMatchIds.has(a.match_id)));

  let globalPct = $derived(terminated.length
    ? Math.round((terminated.filter(a => a.status === 'validated').length / terminated.length) * 100)
    : null);
  let tradedPct = $derived(tradedAlerts.length
    ? Math.round((tradedAlerts.filter(a => a.status === 'validated').length / tradedAlerts.length) * 100)
    : null);
  let diff = $derived(tradedPct !== null && globalPct !== null ? tradedPct - globalPct : null);
</script>

{#if tradedAlerts.length > 0}
  <details class="trades-block">
    <summary>
      <span class="summary-title">📊 Mes trades vs Global</span>
      <span class="summary-meta">{tradedAlerts.length} alerte{tradedAlerts.length > 1 ? 's' : ''} jouée{tradedAlerts.length > 1 ? 's' : ''}</span>
    </summary>
    <div class="trades-body">
      <div class="kpi">
        <span class="kpi-label">Global</span>
        <span class="kpi-value" style:color={pctColor(globalPct)}>{globalPct ?? '—'}%</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">Mes trades</span>
        <span class="kpi-value" style:color={pctColor(tradedPct)}>{tradedPct ?? '—'}%</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">Écart</span>
        <span class="kpi-value" style:color={diff >= 0 ? 'var(--color-accent-green)' : 'var(--color-danger)'}>
          {diff >= 0 ? '+' : ''}{diff ?? '—'}%
        </span>
      </div>
      <div class="kpi-sub">
        {tradedAlerts.filter(a => a.status === 'validated').length} / {tradedAlerts.length}
      </div>
    </div>
  </details>
{/if}

<style>
  .trades-block {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 10px 14px;
    margin-top: 12px;
  }
  .trades-block summary {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    list-style: none;
    font-size: 13px;
  }
  .trades-block summary::-webkit-details-marker { display: none; }
  .summary-title { font-weight: 700; color: var(--color-text-primary); }
  .summary-meta { color: var(--color-text-muted); font-size: 11px; margin-left: auto; }
  .trades-body {
    display: flex;
    gap: 20px;
    align-items: baseline;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--color-border);
    flex-wrap: wrap;
  }
  .kpi { display: flex; flex-direction: column; gap: 2px; }
  .kpi-label { font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; }
  .kpi-value { font-size: 20px; font-weight: 700; }
  .kpi-sub { color: var(--color-text-muted); font-size: 12px; margin-left: auto; }
</style>
