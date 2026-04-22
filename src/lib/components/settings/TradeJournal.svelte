<script>
  import { trades } from '$lib/stores/appStore.js';
  import { updateTrade, deleteTrade } from '$lib/stores/tradeStore.js';

  let journalFilterResult = $state('');
  let journalFilterLigue = $state('');

  let uniqueLigues = $derived([...new Set($trades.map(t => t.ligue).filter(Boolean))]);
  let filteredTrades = $derived($trades.filter(t => {
    if (journalFilterResult && t.resultat !== journalFilterResult) return false;
    if (journalFilterLigue && t.ligue !== journalFilterLigue) return false;
    return true;
  }).slice().reverse());

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
</script>

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
      <button class="btn btn--secondary btn--sm" onclick={exportCSV}>📥 Export CSV</button>
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
                  onchange={e => handleTradeResult(t.id, e.target.value)}>
                  <option value="non_joue">Non joue</option>
                  <option value="gagne">Gagne ✓</option>
                  <option value="perdu">Perdu ✗</option>
                </select>
              </td>
              <td>
                <button class="btn btn--ghost btn--sm" onclick={() => handleDeleteTrade(t.id)}>🗑</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
