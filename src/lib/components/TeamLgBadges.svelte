<script>
  import { supabase } from '$lib/api/supabase.js';

  /**
   * Cache module-level : evite de refetch la meme equipe plusieurs fois sur la meme page.
   * Key = "seasonId:teamId"
   * @type {Map<string, {lg1_after30_pct: number|null, lg2_pct: number|null, matches_count: number|null}>}
   */
  const cache = new Map();

  let {
    teamId,
    seasonId,
    size = 'sm',
    inline = false,
    preload = null,
  } = $props();

  /** @type {{lg1_after30_pct: number|null, lg2_pct: number|null, matches_count: number|null} | null} */
  let data = $state(null);
  let fetching = $state(false);

  /**
   * Retourne la classe CSS de couleur en fonction du pourcentage.
   * >= 55 -> vert, 40-54 -> orange, < 40 -> rouge attenue, null -> gris
   */
  function colorClass(pct) {
    if (pct == null) return 'lg-badge--none';
    if (pct >= 55) return 'lg-badge--green';
    if (pct >= 40) return 'lg-badge--orange';
    return 'lg-badge--red';
  }

  function fmtPct(pct) {
    if (pct == null) return '—';
    return `${pct}%`;
  }

  function tooltip(label, pct, n) {
    const base = n != null ? `${n} match${n > 1 ? 's' : ''}` : '';
    if (label === 'LG1') return base ? `${base} — but en 31-45'` : "but en 31-45'";
    return base ? `${base} — but >= 80'` : "but >= 80'";
  }

  $effect(() => {
    // Dependances reactives declarees explicitement
    const tid = teamId;
    const sid = seasonId;
    const pre = preload;

    if (pre != null) {
      data = pre;
      return;
    }

    if (!tid || !sid) {
      data = null;
      return;
    }

    const key = `${sid}:${tid}`;
    if (cache.has(key)) {
      data = cache.get(key);
      return;
    }

    fetching = true;
    supabase
      .from('team_lg1_cache')
      .select('lg1_after30_pct, lg2_pct, matches_count')
      .eq('team_id', tid)
      .eq('season_id', sid)
      .maybeSingle()
      .then(({ data: row, error }) => {
        if (error) {
          console.warn('TeamLgBadges fetch error:', error.message);
          data = null;
        } else if (row) {
          cache.set(key, row);
          data = row;
        } else {
          // Pas de ligne : on met une sentinelle pour ne pas refetcher
          const empty = { lg1_after30_pct: null, lg2_pct: null, matches_count: null };
          cache.set(key, empty);
          data = empty;
        }
        fetching = false;
      });
  });
</script>

<div
  class="lg-badges"
  class:lg-badges--inline={inline}
  class:lg-badges--sm={size === 'sm'}
  class:lg-badges--md={size === 'md'}
>
  {#if fetching && data == null}
    <!-- placeholder discret pendant le chargement -->
    <span class="lg-badge lg-badge--none">LG1 …</span>
    <span class="lg-badge lg-badge--none">LG2 …</span>
  {:else}
    <span
      class="lg-badge {colorClass(data?.lg1_after30_pct)}"
      title={tooltip('LG1', data?.lg1_after30_pct, data?.matches_count)}
    >
      <span class="lg-badge__label">LG1</span>
      <span class="lg-badge__value">{fmtPct(data?.lg1_after30_pct)}</span>
    </span>
    <span
      class="lg-badge {colorClass(data?.lg2_pct != null ? Math.round(data.lg2_pct) : null)}"
      title={tooltip('LG2', data?.lg2_pct, data?.matches_count)}
    >
      <span class="lg-badge__label">LG2</span>
      <span class="lg-badge__value">{fmtPct(data?.lg2_pct != null ? Math.round(data.lg2_pct) : null)}</span>
    </span>
  {/if}
</div>

<style>
  .lg-badges {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .lg-badges--inline {
    flex-direction: row;
    gap: 4px;
    flex-wrap: wrap;
  }

  /* Taille sm (defaut) */
  .lg-badges--sm .lg-badge {
    font-size: 10px;
    padding: 1px 5px;
  }

  /* Taille md */
  .lg-badges--md .lg-badge {
    font-size: 12px;
    padding: 2px 7px;
  }

  .lg-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    border-radius: 4px;
    font-weight: 600;
    white-space: nowrap;
    border: 1px solid transparent;
    line-height: 1.4;
  }

  .lg-badge__label {
    opacity: 0.75;
    font-weight: 500;
  }

  .lg-badge__value {
    font-weight: 700;
  }

  /* Vert : >= 55% */
  .lg-badge--green {
    background: rgba(29, 158, 117, 0.15);
    color: var(--color-accent-green);
    border-color: rgba(29, 158, 117, 0.28);
  }

  /* Orange : 40-54% */
  .lg-badge--orange {
    background: rgba(239, 159, 39, 0.12);
    color: var(--color-warning-orange);
    border-color: rgba(239, 159, 39, 0.28);
  }

  /* Rouge attenue : < 40% */
  .lg-badge--red {
    background: rgba(226, 75, 74, 0.10);
    color: var(--color-danger);
    border-color: rgba(226, 75, 74, 0.22);
  }

  /* Gris : null / pas de donnee */
  .lg-badge--none {
    background: rgba(160, 163, 177, 0.10);
    color: var(--color-text-muted);
    border-color: rgba(160, 163, 177, 0.18);
  }
</style>
