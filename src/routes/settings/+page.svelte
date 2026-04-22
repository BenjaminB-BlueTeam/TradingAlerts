<script>
  import { onMount, tick } from 'svelte';
  import {
    apiConnected, trades, clearAllData
  } from '$lib/stores/appStore.js';
  import { updateTrade, deleteTrade } from '$lib/stores/tradeStore.js';
  import { calcStatsTradesGlobal } from '$lib/stores/tradeStats.js';
  import { testApiConnection } from '$lib/api/footystats.js';
  import { cacheClear } from '$lib/api/cache.js';
  import { createWinRateChart, createBankrollChart } from '$lib/components/charts.js';

  let apiTestResult = $state(null);
  let apiTesting = $state(false);
  let journalFilterResult = $state('');
  let journalFilterLigue = $state('');
  let winrateCanvas = $state(null);
  let bankrollCanvas = $state(null);
  let bankrollInput = $state('');
  let misePctInput = $state('2.5');
  let coteCibleInput = $state('2.3');
  let showProjection = $state(false);
  let projections = $state([]);
  let projGains = $state([]);
  let projLabels = $state([]);

  let stats = $derived(calcStatsTradesGlobal());
  let uniqueLigues = $derived([...new Set($trades.map(t => t.ligue).filter(Boolean))]);
  let filteredTrades = $derived($trades.filter(t => {
    if (journalFilterResult && t.resultat !== journalFilterResult) return false;
    if (journalFilterLigue && t.ligue !== journalFilterLigue) return false;
    return true;
  }).slice().reverse());

  async function handleTestApi() {
    apiTesting = true;
    apiTestResult = null;
    const result = await testApiConnection();
    apiTestResult = result;
    apiTesting = false;
  }

  function handleTradeResult(id, value) {
    updateTrade(id, { resultat: value });
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast('Resultat mis a jour', 'success');
    }
  }

  function handleDeleteTrade(id) {
    if (confirm('Supprimer ce trade ?')) {
      deleteTrade(id);
      if (typeof window !== 'undefined' && window.showToast) {
        window.showToast('Trade supprime', 'info');
      }
    }
  }

  function exportCSV() {
    if ($trades.length === 0) {
      if (typeof window !== 'undefined' && window.showToast) {
        window.showToast('Aucun trade a exporter', 'warning');
      }
      return;
    }

    const headers = ['Date','Match','Ligue','FHG%','Strategie','Badge1MT','H2H','Cote','Resultat','Analyse'];
    const rows = $trades.map(t => [
      t.date || '', t.match || '', t.ligue || '', t.fhgPct || '',
      t.strategie || '', t.badge1MT ? 'OUI' : 'NON', t.h2h || '',
      t.cote || '', t.resultat || '', (t.analyse || '').replace(/"/g, '""'),
    ]);

    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fhg-trades-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast('Export CSV telecharge ✓', 'success');
    }
  }

  function calculerBankroll() {
    const bankroll = parseFloat(bankrollInput) || 0;
    const misePct = parseFloat(misePctInput) || 2.5;
    const coteCible = parseFloat(coteCibleInput) || 2.3;

    if (bankroll <= 0) {
      if (typeof window !== 'undefined' && window.showToast) {
        window.showToast('Entrez une bankroll valide', 'warning');
      }
      return;
    }

    localStorage.setItem('fhg_bankroll', bankroll);
    localStorage.setItem('fhg_mise_pct', misePct);
    localStorage.setItem('fhg_cote_cible', coteCible);

    const miseU = bankroll * misePct / 100;

    const scenarios = [
      { label: '30 paris/mois, cote 2.30, 50% reussite', cote: 2.30, taux: 0.50, nb: 30 },
      { label: '30 paris/mois, cote 2.50, 65% reussite', cote: 2.50, taux: 0.65, nb: 30 },
      { label: `Mise fixe ${Math.round(miseU)}€, cote ${coteCible}, 65%`, cote: coteCible, taux: 0.65, nb: 30 },
    ];

    projections = scenarios.map(s => {
      const gain = miseU * s.cote * s.taux * s.nb - miseU * s.nb;
      const roi = ((gain / (miseU * s.nb)) * 100).toFixed(1);
      return { ...s, gain, roi };
    });

    projLabels = Array.from({ length: 31 }, (_, i) => `J${i}`);
    projGains = projLabels.map((_, i) => {
      return bankroll + (miseU * coteCible * 0.65 - miseU) * i;
    });

    showProjection = true;

    tick().then(() => {
      if (bankrollCanvas) {
        createBankrollChart(bankrollCanvas, projGains, projLabels);
      }
    });
  }

  function handleClearCache() {
    cacheClear();
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast('Cache API vide', 'success');
    }
  }

  function handleClearAll() {
    if (confirm('Reinitialiser TOUTES les donnees ? Cette action est irreversible.')) {
      clearAllData();
    }
  }

  onMount(() => {
    bankrollInput = localStorage.getItem('fhg_bankroll') || '';
    misePctInput = localStorage.getItem('fhg_mise_pct') || '2.5';
    coteCibleInput = localStorage.getItem('fhg_cote_cible') || '2.3';

    if (stats && stats.total >= 5) {
      tick().then(() => {
        if (winrateCanvas) {
          createWinRateChart(winrateCanvas, stats.gagnes, stats.total);
        }
      });
    }
  });
</script>

<!-- CONNEXION API -->
<div class="settings-block">
  <div class="settings-block__title">🔌 Connexion API FootyStats</div>

  <div style="margin-bottom:16px;">
    {#if !$apiConnected}
      <div class="danger-box">⚠ Mode demonstration — API non configuree</div>
    {:else}
      <div class="info-box" style="border-color:var(--color-accent-green);color:var(--color-accent-green);">
        ✓ API connectee et operationnelle
      </div>
    {/if}
  </div>

  <div class="info-box" style="font-size:12px;margin-bottom:12px;">
    🔒 La cle API est stockee de facon securisee cote serveur (variable d'env Netlify).<br/>
    Elle n'est jamais exposee dans le navigateur.<br/><br/>
    <strong>Pour configurer ou changer la cle :</strong><br/>
    1. Netlify → votre site → <strong>Site configuration → Environment variables</strong><br/>
    2. Ajouter <code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;">FOOTYSTATS_API_KEY</code> avec votre cle<br/>
    3. Redeployer le site (Deploy → Trigger deploy)
  </div>

  <button class="btn btn--secondary" on:click={handleTestApi} disabled={apiTesting}>
    {apiTesting ? '⏳ Test en cours...' : '🔗 Tester la connexion'}
  </button>

  {#if apiTestResult}
    <div class="api-test-result" class:success={apiTestResult.success} class:error={!apiTestResult.success}
      style="margin-top:8px;">
      {apiTestResult.success ? '✓ ' + apiTestResult.message : '✗ ' + apiTestResult.error}
    </div>
  {/if}
</div>

<!-- JOURNAL DES TRADES -->
<div class="settings-block">
  <div class="settings-block__title">📋 Journal des trades</div>

  {#if $trades.length === 0}
    <div class="empty-state" style="padding:24px;">
      <div class="empty-state__icon">📋</div>
      <div class="empty-state__title">Aucun trade enregistre</div>
    </div>
  {:else}
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">
      <select class="form-input" style="width:140px;padding:6px 10px;"
        bind:value={journalFilterResult}>
        <option value="">Tous les resultats</option>
        <option value="gagne">Gagnes</option>
        <option value="perdu">Perdus</option>
        <option value="non_joue">Non joues</option>
      </select>
      <select class="form-input" style="width:160px;padding:6px 10px;"
        bind:value={journalFilterLigue}>
        <option value="">Toutes les ligues</option>
        {#each uniqueLigues as l}
          <option value={l}>{l}</option>
        {/each}
      </select>
      <button class="btn btn--secondary btn--sm" on:click={exportCSV}>📥 Export CSV</button>
      <span style="font-size:12px;color:var(--color-text-muted);">
        {$trades.length} trade{$trades.length > 1 ? 's' : ''}
      </span>
    </div>
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th><th>Match</th><th>Ligue</th><th>FHG%</th>
            <th>Strategie</th><th>1MT</th><th>H2H</th><th>Cote</th>
            <th>Resultat</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredTrades as t (t.id)}
            <tr>
              <td>{t.date || '—'}</td>
              <td style="font-size:12px;max-width:160px;">{t.match || '—'}</td>
              <td style="font-size:11px;">{t.ligue || '—'}</td>
              <td>{t.fhgPct || '—'}</td>
              <td>{t.strategie === 'fhg_dc' ? 'FHG+DC' : 'FHG'}</td>
              <td>
                {#if t.badge1MT}
                  <span class="badge badge--1mt">★</span>
                {:else}—{/if}
              </td>
              <td>
                {#if t.h2h === 'favorable'}
                  <span class="badge badge--h2h-vert">✓</span>
                {:else if t.h2h === 'defavorable'}
                  <span class="badge badge--h2h-orange">⚠</span>
                {:else}
                  <span class="badge badge--h2h-gris">?</span>
                {/if}
              </td>
              <td>{t.cote || '—'}</td>
              <td>
                <select class="form-input" style="padding:3px 6px;font-size:11px;width:100px;"
                  value={t.resultat || 'non_joue'}
                  on:change={e => handleTradeResult(t.id, e.target.value)}>
                  <option value="non_joue">Non joue</option>
                  <option value="gagne">Gagne ✓</option>
                  <option value="perdu">Perdu ✗</option>
                </select>
              </td>
              <td>
                <button class="btn btn--ghost btn--sm" on:click={() => handleDeleteTrade(t.id)}>🗑</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- STATS PERSONNELLES -->
<div class="settings-block">
  <div class="settings-block__title">📈 Stats personnelles</div>
  {#if stats}
    <div class="stats-grid mb-24">
      <div class="stat-card">
        <div class="stat-card__label">Taux de reussite</div>
        <div class="stat-card__value" class:green={stats.tauxGlobal >= 55} class:orange={stats.tauxGlobal < 55}>
          {stats.tauxGlobal}%
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Trades joues</div>
        <div class="stat-card__value">{stats.total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Cote moyenne</div>
        <div class="stat-card__value">{stats.coteMoy || '—'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">ROI estime</div>
        <div class="stat-card__value" class:green={(stats.roi || 0) >= 0} class:orange={(stats.roi || 0) < 0}>
          {stats.roi !== null ? stats.roi + '%' : '—'}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Meilleure serie</div>
        <div class="stat-card__value green">{stats.maxWin}W</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Pire serie</div>
        <div class="stat-card__value orange">{stats.maxLoss}L</div>
      </div>
    </div>
    {#if stats.total >= 5}
      <div class="chart-wrapper" style="height:200px;">
        <canvas bind:this={winrateCanvas}></canvas>
      </div>
    {/if}
  {:else}
    <div class="info-box" style="font-size:12px;">
      ℹ Enregistrez des trades pour voir vos statistiques personnelles.
    </div>
  {/if}
</div>

<!-- CALCUL BANKROLL -->
<div class="settings-block">
  <div class="settings-block__title">💰 Calcul bankroll</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">
    <div class="form-group">
      <label class="form-label">Bankroll (€)</label>
      <input type="number" class="form-input" bind:value={bankrollInput}
        placeholder="ex: 1000" min="0" />
    </div>
    <div class="form-group">
      <label class="form-label">% mise par trade</label>
      <input type="number" class="form-input" bind:value={misePctInput}
        placeholder="ex: 2.5" min="0.5" max="10" step="0.5" />
    </div>
    <div class="form-group">
      <label class="form-label">Cote cible</label>
      <input type="number" class="form-input" bind:value={coteCibleInput}
        placeholder="ex: 2.30" min="1.1" step="0.1" />
    </div>
  </div>
  <button class="btn btn--primary mb-16" on:click={calculerBankroll}>
    📊 Calculer projection 30 jours
  </button>

  {#if showProjection}
    <div class="projection-grid mb-16">
      {#each projections as s}
        <div class="projection-card">
          <div class="projection-card__title">{s.label}</div>
          <div class="projection-card__result" style:color={s.gain >= 0 ? 'var(--color-accent-green)' : 'var(--color-danger)'}>
            {s.gain >= 0 ? '+' : ''}{s.gain.toFixed(0)}€
          </div>
          <div class="projection-card__detail">ROI : {s.roi}% · {s.nb} paris/mois</div>
        </div>
      {/each}
    </div>
    <div class="chart-wrapper" style="height:200px;">
      <canvas bind:this={bankrollCanvas}></canvas>
    </div>
  {/if}
</div>

<!-- DANGER ZONE -->
<div class="settings-block">
  <div class="settings-block__title" style="color:var(--color-danger);">🗑 Zone de danger</div>
  <div class="danger-box mb-16" style="font-size:12px;">
    ⚠ Ces actions sont irreversibles. Toutes vos donnees locales seront supprimees.
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;">
    <button class="btn btn--danger" on:click={handleClearCache}>🗑 Vider le cache API</button>
    <button class="btn btn--danger" on:click={handleClearAll}>⚠ Reinitialiser toutes les donnees</button>
  </div>
</div>
