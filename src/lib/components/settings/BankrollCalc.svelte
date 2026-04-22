<script>
  import { onMount, tick } from 'svelte';
  import { createBankrollChart } from '$lib/components/charts.js';

  let bankrollCanvas = $state(null);
  let bankrollInput = $state('');
  let misePctInput = $state('2.5');
  let coteCibleInput = $state('2.3');
  let showProjection = $state(false);
  let projections = $state([]);
  let projGains = $state([]);
  let projLabels = $state([]);

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

  onMount(() => {
    bankrollInput = localStorage.getItem('fhg_bankroll') || '';
    misePctInput = localStorage.getItem('fhg_mise_pct') || '2.5';
    coteCibleInput = localStorage.getItem('fhg_cote_cible') || '2.3';
  });
</script>

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
  <button class="btn btn--primary mb-16" onclick={calculerBankroll}>
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
