<script>
  let { excludedAlerts = [], globalPct = null } = $props();

  const TAGS = [
    { id: 'streak_trop_court',    label: 'Streak trop court'    },
    { id: 'confirmation_limite',  label: 'Confirmation limite'  },
    { id: 'ligue_inhabituelle',   label: 'Ligue inhabituelle'   },
    { id: 'match_enjeu_fort',     label: 'Match à enjeu fort'   },
    { id: 'h2h_suspect',          label: 'H2H suspect'          },
    { id: 'forme_globale_faible', label: 'Forme globale faible' },
    { id: 'autre',                label: 'Autre'                },
  ];

  function wilsonLower(k, n) {
    if (!n) return null;
    const z = 1.96;
    const p = k / n;
    const denom = 1 + z * z / n;
    const center = p + z * z / (2 * n);
    const spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return Math.round(((center - spread) / denom) * 100);
  }

  function pctColor(pct) {
    if (pct === null) return 'var(--color-text-muted)';
    if (pct >= 65) return 'var(--color-accent-green)';
    if (pct >= 50) return 'var(--color-signal-moyen)';
    return 'var(--color-danger)';
  }

  let terminated = $derived(excludedAlerts.filter(a => a.status === 'validated' || a.status === 'lost'));
  let validated = $derived(terminated.filter(a => a.status === 'validated').length);
  let excludedPct = $derived(terminated.length ? Math.round(validated / terminated.length * 100) : null);
  let diff = $derived(excludedPct !== null && globalPct !== null ? excludedPct - globalPct : null);

  let tagStats = $derived(TAGS.map(tag => {
    const withTag = terminated.filter(a =>
      Array.isArray(a.user_exclusion_tags) && a.user_exclusion_tags.includes(tag.id)
    );
    const v = withTag.filter(a => a.status === 'validated').length;
    return {
      ...tag,
      validated: v,
      total: withTag.length,
      pct: withTag.length ? Math.round(v / withTag.length * 100) : null,
      wilson: wilsonLower(v, withTag.length),
    };
  }).filter(t => t.total > 0));
</script>

{#if terminated.length > 0}
  <div class="whatif-block">
    <div class="whatif-header">
      <span class="whatif-title">Analyse what-if — si on n'avait pas exclu</span>
      <span class="whatif-sub">{excludedAlerts.length} exclue{excludedAlerts.length > 1 ? 's' : ''} · {terminated.length} terminée{terminated.length > 1 ? 's' : ''}</span>
    </div>
    <div class="whatif-kpi-row">
      <div class="whatif-kpi">
        <div class="whatif-kpi__label">Auraient été validées</div>
        <div class="whatif-kpi__value" style:color={pctColor(excludedPct)}>{excludedPct ?? '—'}%</div>
        <div class="whatif-kpi__sub">{validated} / {terminated.length}</div>
      </div>
      {#if diff !== null}
        <div class="whatif-kpi">
          <div class="whatif-kpi__label">vs actives</div>
          <div class="whatif-kpi__value" style:color={diff >= 0 ? 'var(--color-danger)' : 'var(--color-accent-green)'}>
            {diff >= 0 ? '+' : ''}{diff}%
          </div>
          <div class="whatif-kpi__sub">{diff >= 0 ? 'Exclusions coûteuses' : 'Exclusions efficaces'}</div>
        </div>
      {/if}
    </div>

    {#if tagStats.length > 0}
      <div class="whatif-tags-header">Par raison d'exclusion (Wilson CI 95%)</div>
      <div class="whatif-tags">
        {#each tagStats as t}
          <div class="whatif-tag-row">
            <span class="whatif-tag-label">{t.label}</span>
            <span class="whatif-tag-stats">
              <span style:color={pctColor(t.pct)}>{t.pct}%</span>
              <span class="muted">({t.validated}/{t.total}) · CI≥{t.wilson}%</span>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .whatif-block {
    background: var(--color-bg-card);
    border: 1px solid var(--color-accent-blue);
    border-radius: 10px;
    padding: 14px 18px;
    margin-top: 12px;
  }
  .whatif-header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .whatif-title {
    font-weight: 700;
    font-size: 13px;
    color: var(--color-text-primary);
  }
  .whatif-sub { color: var(--color-text-muted); font-size: 11px; margin-left: auto; }
  .whatif-kpi-row {
    display: flex;
    gap: 20px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--color-border);
    flex-wrap: wrap;
  }
  .whatif-kpi { display: flex; flex-direction: column; gap: 2px; }
  .whatif-kpi__label { font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; }
  .whatif-kpi__value { font-size: 20px; font-weight: 700; }
  .whatif-kpi__sub { font-size: 11px; color: var(--color-text-muted); }

  .whatif-tags-header {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 14px 0 6px;
  }
  .whatif-tags {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .whatif-tag-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
    padding: 4px 0;
    border-bottom: 1px solid rgba(255,255,255,0.03);
  }
  .whatif-tag-label { flex: 1; }
  .whatif-tag-stats { display: flex; gap: 6px; font-weight: 600; }
  .muted { color: var(--color-text-muted); font-weight: 400; }
</style>
