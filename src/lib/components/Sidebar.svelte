<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { apiConnected, alertesActives, pauseSession, savePrefs, apiRequestsRemaining } from '$lib/stores/appStore.js';
  import { cacheClear } from '$lib/api/cache.js';

  let sidebarOpen = $state(false);
  let refreshing = $state(false);

  async function handleRefresh() {
    refreshing = true;
    cacheClear();
    window.location.reload();
  }

  const navItems = [
    { href: '/',              icon: '📊', label: 'Dashboard'          },
    { href: '/alerts',        icon: '⚡', label: 'Sélection FHG'      },
    { href: '/selection-dc',  icon: '🎯', label: 'Sélection DC'       },
    { href: '/historique',    icon: '📈', label: 'Historique'         },
    { href: '/matches',       icon: '⚽', label: 'Matchs à venir'     },
    { href: '/explore',       icon: '🌍', label: 'Classements ligues' },
    { href: '/settings',      icon: '⚙️', label: 'Paramètres'        },
  ];

  const adminItems = [
    { href: '/leagues',  icon: '🏆', label: 'Ligues actives' },
    { href: '/config',   icon: '🔧', label: 'Configuration'  },
    { href: '/debug',    icon: '🐛', label: 'Debug'          },
  ];

  let adminOpen = $state(false);

  function navigate(href) {
    goto(href);
    savePrefs({ currentPage: href === '/' ? 'dashboard' : href.slice(1) });
    sidebarOpen = false;
  }

  function togglePause() {
    pauseSession.update(p => !p);
  }

  function isActive(href) {
    if (href === '/') return $page.url.pathname === '/';
    return $page.url.pathname.startsWith(href);
  }

  let apiDotClass = $derived($apiConnected ? 'connected' : 'error');
  let apiLabel = $derived($apiConnected ? 'API connectée' : 'API déconnectée');
  let alertsBadgeCount = $derived($alertesActives?.length || 0);
  let adminHasActive = $derived(adminItems.some(i => isActive(i.href)));
  // Auto-ouvrir la section admin si on est sur une page admin
  $effect(() => { if (adminHasActive) adminOpen = true; });
</script>

<!-- OVERLAY MOBILE -->
{#if sidebarOpen}
  <div class="sidebar-overlay active" on:click={() => sidebarOpen = false} on:keydown={(e) => { if (e.key === 'Escape') sidebarOpen = false; }} role="presentation"></div>
{/if}

<!-- TOPBAR MOBILE -->
<div class="topbar">
  <button class="burger-btn" on:click={() => sidebarOpen = !sidebarOpen} aria-label="Menu">☰</button>
  <span class="topbar__title">FHG Tracker</span>
  <div class="topbar__right">
    <div class="api-dot {apiDotClass}"></div>
  </div>
</div>

<!-- SIDEBAR -->
<nav class="sidebar" class:open={sidebarOpen}>
  <div class="sidebar__header">
    <div class="sidebar__logo">
      <span class="sidebar__logo-icon">⚽</span>
      <span class="sidebar__logo-text">FHG Tracker</span>
    </div>
    <button class="sidebar__close-btn" on:click={() => sidebarOpen = false} aria-label="Fermer">✕</button>
  </div>

  <div class="sidebar__nav">
    {#if $apiRequestsRemaining !== null}
      <div class="sidebar__api-counter" class:sidebar__api-counter--low={$apiRequestsRemaining < 200}>
        <span class="sidebar__api-counter-value">{$apiRequestsRemaining}</span>
        <span class="sidebar__api-counter-label">/ 1800 req/h</span>
      </div>
    {/if}

    <button class="sidebar__refresh-btn" on:click={handleRefresh} disabled={refreshing} title="Vider le cache et recharger">
      {refreshing ? '⏳' : '🔄'} Refresh
    </button>

    {#each navItems as item}
      <a
        href={item.href}
        class="sidebar__nav-item"
        class:active={isActive(item.href)}
        on:click|preventDefault={() => navigate(item.href)}
      >
        <span class="sidebar__nav-icon">{item.icon}</span>
        <span class="sidebar__nav-label">{item.label}</span>
        {#if (item.href === '/alerts' || item.href === '/selection-dc') && alertsBadgeCount > 0}
          <span class="sidebar__badge">{alertsBadgeCount}</span>
        {/if}
      </a>
    {/each}

    <!-- Section Admin -->
    <div
      class="sidebar__section-toggle"
      class:open={adminOpen}
      on:click={() => adminOpen = !adminOpen}
      on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); adminOpen = !adminOpen; } }}
      role="button"
      tabindex="0"
      aria-expanded={adminOpen}
    >
      <span class="sidebar__section-icon">🛠</span>
      <span class="sidebar__section-label">Admin</span>
      <span class="sidebar__section-arrow">{adminOpen ? '▾' : '▸'}</span>
    </div>

    {#if adminOpen}
      <div class="sidebar__section-items">
        {#each adminItems as item}
          <a
            href={item.href}
            class="sidebar__nav-item sidebar__nav-item--sub"
            class:active={isActive(item.href)}
            on:click|preventDefault={() => navigate(item.href)}
          >
            <span class="sidebar__nav-icon">{item.icon}</span>
            <span class="sidebar__nav-label">{item.label}</span>
          </a>
        {/each}
      </div>
    {/if}
  </div>

  <div class="sidebar__footer">
    <div class="sidebar__api-status">
      <div class="api-dot {apiDotClass}"></div>
      <span>{apiLabel}</span>
    </div>
    <button
      class="btn btn--secondary btn--pause btn--full"
      on:click={togglePause}
      style={$pauseSession ? 'opacity:0.7' : ''}
    >
      {$pauseSession ? '▶ REPRENDRE SESSION' : '⏸ PAUSE SESSION'}
    </button>
  </div>
</nav>

<style>
  .sidebar__api-counter {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    margin: 4px 12px 2px;
    padding: 4px 0;
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .sidebar__api-counter-value {
    font-weight: 700;
    color: var(--color-accent-green);
    font-size: 13px;
  }
  .sidebar__api-counter--low .sidebar__api-counter-value {
    color: var(--color-danger);
  }
  .sidebar__api-counter-label {
    font-size: 10px;
  }
  .sidebar__refresh-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: calc(100% - 24px);
    margin: 4px 12px 8px;
    padding: 7px 0;
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .sidebar__refresh-btn:hover {
    background: rgba(55, 138, 221, 0.12);
    color: var(--color-accent-blue);
    border-color: var(--color-accent-blue);
  }
  .sidebar__refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .sidebar__section-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    margin-top: 8px;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: color 0.15s;
    user-select: none;
  }
  .sidebar__section-toggle:hover,
  .sidebar__section-toggle.open {
    color: var(--color-text-primary);
  }
  .sidebar__section-icon {
    font-size: 14px;
  }
  .sidebar__section-label {
    flex: 1;
  }
  .sidebar__section-arrow {
    font-size: 12px;
  }
  .sidebar__section-items {
    display: flex;
    flex-direction: column;
  }
  .sidebar__nav-item--sub {
    padding-left: 40px !important;
    font-size: 13px;
  }
</style>
