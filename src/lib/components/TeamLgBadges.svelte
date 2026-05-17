<script>
  import { supabase } from '$lib/api/supabase.js';

  /**
   * Cache module-level : evite de refetch la meme equipe plusieurs fois sur la meme page.
   * Key = "seasonId:teamId" si seasonId fourni, sinon "team:teamId"
   * @type {Map<string, {lg1_after30_pct: number|null, lg2_pct: number|null, matches_count: number|null}>}
   */
  const cache = new Map();

  let {
    teamId,
    seasonId = null,
    context = null,   // 'home' | 'away' | null (null = overall)
    size = 'sm',
    inline = false,
    preload = null,
  } = $props();

  /** @type {object | null} */
  let row = $state(null);
  let fetching = $state(false);

  // Selection des % a afficher selon le contexte
  let lg1Pct = $derived.by(() => {
    if (!row) return null;
    if (context === 'home') return row.lg1_home_pct ?? null;
    if (context === 'away') return row.lg1_away_pct ?? null;
    return row.lg1_after30_pct ?? null;
  });
  let lg2Pct = $derived.by(() => {
    if (!row) return null;
    if (context === 'home') return row.lg2_home_pct ?? null;
    if (context === 'away') return row.lg2_away_pct ?? null;
    return row.lg2_pct ?? null;
  });
  let matchesN = $derived.by(() => {
    if (!row) return null;
    if (context === 'home') return row.matches_home ?? null;
    if (context === 'away') return row.matches_away ?? null;
    return row.matches_count ?? null;
  });

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
    const ctx = context === 'home' ? ' domicile' : context === 'away' ? ' exterieur' : '';
    const base = n != null ? `${n} match${n > 1 ? 's' : ''}${ctx} cette saison` : `cette saison${ctx}`;
    if (label === 'LG1') return `% matchs avec au moins un but en 31-45' (stoppage 1MT compris) — ${base}`;
    return `% matchs avec au moins un but >= 80' (stoppage 2MT compris) — ${base}`;
  }

  const SELECT_COLS = 'lg1_after30_pct, lg2_pct, matches_count, lg1_home_pct, lg1_away_pct, lg2_home_pct, lg2_away_pct, matches_home, matches_away, updated_at';

  $effect(() => {
    // Dependances reactives declarees explicitement
    const tid = teamId;
    const sid = seasonId;
    const pre = preload;

    if (pre != null) {
      row = pre;
      return;
    }

    if (!tid) {
      row = null;
      return;
    }

    const key = sid ? `${sid}:${tid}` : `team:${tid}`;
    if (cache.has(key)) {
      row = cache.get(key);
      return;
    }

    fetching = true;
    // Si seasonId fourni : fetch exact ; sinon : derniere saison connue pour cette equipe
    let q = supabase
      .from('team_lg1_cache')
      .select(SELECT_COLS)
      .eq('team_id', tid);
    if (sid) {
      q = q.eq('season_id', sid).maybeSingle();
    } else {
      q = q.order('updated_at', { ascending: false }).limit(1).maybeSingle();
    }
    q.then(({ data: r, error }) => {
      if (error) {
        console.warn('TeamLgBadges fetch error:', error.message);
        row = null;
      } else if (r) {
        cache.set(key, r);
        row = r;
      } else {
        // Pas de ligne : on met une sentinelle pour ne pas refetcher
        cache.set(key, null);
        row = null;
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
  {#if fetching && row == null}
    <!-- placeholder discret pendant le chargement -->
    <span class="lg-badge lg-badge--none">LG1 …</span>
    <span class="lg-badge lg-badge--none">LG2 …</span>
  {:else}
    <span
      class="lg-badge {colorClass(lg1Pct)}"
      title={tooltip('LG1', lg1Pct, matchesN)}
    >
      <span class="lg-badge__label">LG1</span>
      <span class="lg-badge__value">{fmtPct(lg1Pct != null ? Math.round(lg1Pct) : null)}</span>
    </span>
    <span
      class="lg-badge {colorClass(lg2Pct != null ? Math.round(lg2Pct) : null)}"
      title={tooltip('LG2', lg2Pct, matchesN)}
    >
      <span class="lg-badge__label">LG2</span>
      <span class="lg-badge__value">{fmtPct(lg2Pct != null ? Math.round(lg2Pct) : null)}</span>
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
