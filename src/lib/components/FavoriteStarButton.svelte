<script>
  import { favoriteTeamIds, addFavorite, removeFavorite, isFavorite } from '$lib/stores/favoritesStore.js';

  let { teamId, teamName = null, size = 'sm' } = $props();

  let isPending = $state(false);

  let isFav = $derived(isFavorite($favoriteTeamIds, teamId));

  let tooltip = $derived(isFav ? 'Retirer des favoris' : 'Ajouter aux favoris');

  async function handleClick(e) {
    e.stopPropagation();
    if (isPending) return;
    isPending = true;
    try {
      if (isFav) {
        await removeFavorite(teamId);
      } else {
        await addFavorite(teamId, teamName);
      }
    } catch (err) {
      console.error('FavoriteStarButton:', err);
    } finally {
      isPending = false;
    }
  }
</script>

<button
  class="fav-star"
  class:fav-star--active={isFav}
  class:fav-star--sm={size === 'sm'}
  onclick={handleClick}
  title={tooltip}
  aria-pressed={isFav}
>
  {#if isPending}
    ⏳
  {:else if isFav}
    ★
  {:else}
    ☆
  {/if}
</button>

<style>
  .fav-star {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 18px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    transition: color var(--transition-fast), opacity var(--transition-fast);
    flex-shrink: 0;
  }
  .fav-star--sm {
    font-size: 16px;
  }
  .fav-star:hover {
    color: var(--color-favorite-gold);
    opacity: 0.8;
  }
  .fav-star--active {
    color: var(--color-favorite-gold);
  }
  .fav-star--active:hover {
    opacity: 0.7;
  }
</style>
