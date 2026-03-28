<script>
  import { config, saveConfig, trades, updateTrade, deleteTrade, calcStatsTradesGlobal } from '$lib/stores/appStore.js';

  const profilLabels = {
    debutant:      { name: 'Debutant',       desc: '5-10e, cote ~1.50' },
    intermediaire: { name: 'Intermediaire',   desc: '15-20e' },
    expert:        { name: 'Expert',          desc: '25-35e, cote 2.30+' },
  };

  function setConfig(key, value) {
    saveConfig({ [key]: value });
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast('Configuration sauvegardee', 'success');
    }
  }

  function setToggle(key, checked) {
    saveConfig({ [key]: checked });
    if (key === 'filtreH2HActif' && !checked && typeof window !== 'undefined' && window.showToast) {
      window.showToast('Filtre H2H desactive — contre-recommande !', 'warning');
      return;
    }
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast('Configuration sauvegardee', 'success');
    }
  }

  function setProfil(profil) {
    saveConfig({ profil });
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast(`Profil "${profil}" selectionne`, 'info');
    }
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

  $: cfg = $config;
  $: tradesJoues = $trades.filter(t => t.resultat !== 'non_joue');
  $: stats = calcStatsTradesGlobal();
  $: recentTrades = $trades.slice().reverse().slice(0, 20);
</script>

<div class="page-title">Alertes & Configuration</div>
<div class="page-subtitle">Parametrez les seuils de la strategie FHG</div>

<!-- BLOC FHG -->
<div class="settings-block">
  <div class="settings-block__title">⚡ Criteres FHG principaux</div>

  <div class="slider-row mb-16">
    <div class="slider-header">
      <span class="slider-label">Seuil FHG 31-45min saison N</span>
      <span class="slider-value">{cfg.seuilFHG}%</span>
    </div>
    <input type="range" class="form-input"
      min="60" max="90" value={cfg.seuilFHG}
      on:change={e => setConfig('seuilFHG', parseInt(e.target.value))}
      on:input={e => config.update(c => ({...c, seuilFHG: parseInt(e.target.value)}))} />
  </div>

  <div class="slider-row mb-16">
    <div class="slider-header">
      <span class="slider-label">Seuil forme 5 derniers matchs</span>
      <span class="slider-value">{cfg.seuil5Matchs}/5</span>
    </div>
    <input type="range" class="form-input"
      min="2" max="5" value={cfg.seuil5Matchs}
      on:change={e => setConfig('seuil5Matchs', parseInt(e.target.value))}
      on:input={e => config.update(c => ({...c, seuil5Matchs: parseInt(e.target.value)}))} />
  </div>

  <div class="toggle-row">
    <div class="toggle-info">
      <div class="toggle-info__label">Ignorer debut de saison</div>
      <div class="toggle-info__sub">Malus -10 pts si moins de {cfg.seuilMatchsMin} matchs joues</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" checked={cfg.ignoreDebutSaison}
        on:change={e => setToggle('ignoreDebutSaison', e.target.checked)} />
      <span class="toggle-slider"></span>
    </label>
  </div>

  <div class="slider-row mb-16 mt-12">
    <div class="slider-header">
      <span class="slider-label">Seuil matchs joues min (debut saison)</span>
      <span class="slider-value">{cfg.seuilMatchsMin} matchs</span>
    </div>
    <input type="range" class="form-input"
      min="5" max="15" value={cfg.seuilMatchsMin}
      on:change={e => setConfig('seuilMatchsMin', parseInt(e.target.value))}
      on:input={e => config.update(c => ({...c, seuilMatchsMin: parseInt(e.target.value)}))} />
  </div>

  <div class="toggle-row">
    <div class="toggle-info">
      <div class="toggle-info__label">Ponderation saison N-1</div>
      <div class="toggle-info__sub">Integre les stats de la saison precedente (25%)</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" checked={cfg.ponderationN1}
        on:change={e => setToggle('ponderationN1', e.target.checked)} />
      <span class="toggle-slider"></span>
    </label>
  </div>
</div>

<!-- BLOC 1MT -->
<div class="settings-block">
  <div class="settings-block__title">★ Bonus 1MT 50%+</div>

  <div class="toggle-row">
    <div class="toggle-info">
      <div class="toggle-info__label">Afficher le badge 1MT 50%+</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" checked={cfg.afficher1MT}
        on:change={e => setToggle('afficher1MT', e.target.checked)} />
      <span class="toggle-slider"></span>
    </label>
  </div>

  <div class="toggle-row">
    <div class="toggle-info">
      <div class="toggle-info__label">Alerter en priorite si badge present</div>
      <div class="toggle-info__sub">Remonte les matchs avec badge 1MT en tete de liste</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" checked={cfg.alerter1MT}
        on:change={e => setToggle('alerter1MT', e.target.checked)} />
      <span class="toggle-slider"></span>
    </label>
  </div>

  <div class="slider-row mb-0 mt-12">
    <div class="slider-header">
      <span class="slider-label">Seuil du badge 1MT</span>
      <span class="slider-value">{cfg.seuil1MT}%</span>
    </div>
    <input type="range" class="form-input"
      min="50" max="70" value={cfg.seuil1MT}
      on:change={e => setConfig('seuil1MT', parseInt(e.target.value))}
      on:input={e => config.update(c => ({...c, seuil1MT: parseInt(e.target.value)}))} />
  </div>
</div>

<!-- BLOC H2H -->
<div class="settings-block">
  <div class="settings-block__title">⚔ H2H Clean Sheet</div>

  <div class="toggle-row">
    <div class="toggle-info">
      <div class="toggle-info__label">Filtre H2H actif</div>
      <div class="toggle-info__sub" style:color={cfg.filtreH2HActif ? 'var(--color-text-muted)' : 'var(--color-danger)'}>
        {cfg.filtreH2HActif
          ? 'Les matchs a 0 but en 1MT sur H2H sont automatiquement exclus'
          : '⚠ FILTRE DESACTIVE — Contre-recommande'
        }
      </div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" checked={cfg.filtreH2HActif}
        on:change={e => setToggle('filtreH2HActif', e.target.checked)} />
      <span class="toggle-slider"></span>
    </label>
  </div>

  {#if !cfg.filtreH2HActif}
    <div class="danger-box mt-8">
      🚫 Desactiver ce filtre va a l'encontre de la regle fondamentale de la methode.
      La recurrence prime sur tout. Un FHG de 90% ne justifie pas de prendre un match
      ou l'equipe n'a jamais marque en 1MT contre cet adversaire. Zero exception.
    </div>
  {/if}

  <div class="slider-row mb-16 mt-12">
    <div class="slider-header">
      <span class="slider-label">Nb minimum H2H pour appliquer exclusion</span>
      <span class="slider-value">{cfg.minH2H}</span>
    </div>
    <input type="range" class="form-input"
      min="1" max="5" value={cfg.minH2H}
      on:change={e => setConfig('minH2H', parseInt(e.target.value))}
      on:input={e => config.update(c => ({...c, minH2H: parseInt(e.target.value)}))} />
  </div>

  <div class="slider-row mb-0">
    <div class="slider-header">
      <span class="slider-label">Penalite H2H orange (1 but en 1MT)</span>
      <span class="slider-value">-{cfg.penaliteH2H} pts</span>
    </div>
    <input type="range" class="form-input"
      min="5" max="15" value={cfg.penaliteH2H}
      on:change={e => setConfig('penaliteH2H', parseInt(e.target.value))}
      on:input={e => config.update(c => ({...c, penaliteH2H: parseInt(e.target.value)}))} />
  </div>
</div>

<!-- BLOC DC -->
<div class="settings-block">
  <div class="settings-block__title">🔄 Double Chance (DC)</div>

  <div class="toggle-row">
    <div class="toggle-info">
      <div class="toggle-info__label">Analyse DC automatique</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" checked={cfg.analyseDC}
        on:change={e => setToggle('analyseDC', e.target.checked)} />
      <span class="toggle-slider"></span>
    </label>
  </div>

  <div class="slider-row mb-16 mt-12">
    <div class="slider-header">
      <span class="slider-label">Seuil % retour au score si encaisse</span>
      <span class="slider-value">{cfg.seuilRetourDC}%</span>
    </div>
    <input type="range" class="form-input"
      min="45" max="75" value={cfg.seuilRetourDC}
      on:change={e => setConfig('seuilRetourDC', parseInt(e.target.value))}
      on:input={e => config.update(c => ({...c, seuilRetourDC: parseInt(e.target.value)}))} />
  </div>

  <div class="info-box" style="font-size:12px;">
    🔒 DC identifiee uniquement apres analyse FHG — Regle absolue (non modifiable)
  </div>
</div>

<!-- BLOC TIMING -->
<div class="settings-block">
  <div class="settings-block__title">⏱ Timing</div>

  <div class="form-group">
    <label class="form-label">Profil joueur</label>
    <div class="profile-selector">
      {#each ['debutant', 'intermediaire', 'expert'] as p}
        <button class="profile-btn" class:active={cfg.profil === p}
          on:click={() => setProfil(p)}>
          <span class="profile-btn__name">{profilLabels[p].name}</span>
          <span class="profile-btn__desc">{profilLabels[p].desc}</span>
        </button>
      {/each}
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px;">
    <div class="slider-row">
      <div class="slider-header">
        <span class="slider-label">Ne pas alerter avant la</span>
        <span class="slider-value">{cfg.minuteMin}e min</span>
      </div>
      <input type="range" class="form-input"
        min="1" max="40" value={cfg.minuteMin}
        on:change={e => setConfig('minuteMin', parseInt(e.target.value))}
        on:input={e => config.update(c => ({...c, minuteMin: parseInt(e.target.value)}))} />
    </div>
    <div class="slider-row">
      <div class="slider-header">
        <span class="slider-label">Ne pas alerter apres la</span>
        <span class="slider-value">{cfg.minuteMax}e min</span>
      </div>
      <input type="range" class="form-input"
        min="50" max="90" value={cfg.minuteMax}
        on:change={e => setConfig('minuteMax', parseInt(e.target.value))}
        on:input={e => config.update(c => ({...c, minuteMax: parseInt(e.target.value)}))} />
    </div>
  </div>
</div>

<!-- BLOC SESSION -->
<div class="settings-block">
  <div class="settings-block__title">🎮 Session</div>

  <div class="slider-row mb-16">
    <div class="slider-header">
      <span class="slider-label">Max alertes par session</span>
      <span class="slider-value">{cfg.maxAlertes}</span>
    </div>
    <input type="range" class="form-input"
      min="1" max="15" value={cfg.maxAlertes}
      on:change={e => setConfig('maxAlertes', parseInt(e.target.value))}
      on:input={e => config.update(c => ({...c, maxAlertes: parseInt(e.target.value)}))} />
  </div>

  <div class="toggle-row">
    <div class="toggle-info">
      <div class="toggle-info__label">Stop apres N victoires consecutives</div>
      <div class="toggle-info__sub">Pause automatique apres une serie gagnante</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" checked={cfg.stopVictoires}
        on:change={e => setToggle('stopVictoires', e.target.checked)} />
      <span class="toggle-slider"></span>
    </label>
  </div>

  <div class="slider-row mt-12">
    <div class="slider-header">
      <span class="slider-label">Nb de victoires avant pause</span>
      <span class="slider-value">{cfg.nbVictoires}</span>
    </div>
    <input type="range" class="form-input"
      min="2" max="10" value={cfg.nbVictoires}
      on:change={e => setConfig('nbVictoires', parseInt(e.target.value))}
      on:input={e => config.update(c => ({...c, nbVictoires: parseInt(e.target.value)}))} />
  </div>
</div>

<!-- HISTORIQUE ALERTES -->
<div class="settings-block">
  <div class="settings-block__title">📋 Historique des alertes</div>

  {#if tradesJoues.length >= 20 && stats}
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
      <div class="stat-card">
        <div class="stat-card__label">Avec badge 1MT 50%+</div>
        <div class="stat-card__value" class:green={stats.taux1MT >= 60} class:orange={stats.taux1MT < 60}>
          {stats.taux1MT ?? '—'}%
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Sans badge 1MT</div>
        <div class="stat-card__value">{stats.tauxSans1MT ?? '—'}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">H2H vert</div>
        <div class="stat-card__value green">{stats.tauxH2HVert ?? '—'}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">H2H orange</div>
        <div class="stat-card__value orange">{stats.tauxH2HOrange ?? '—'}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">H2H insuffisant</div>
        <div class="stat-card__value">{stats.tauxH2HGris ?? '—'}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Taux global</div>
        <div class="stat-card__value" class:green={stats.tauxGlobal >= 50} class:orange={stats.tauxGlobal < 50}>
          {stats.tauxGlobal}%
        </div>
      </div>
    </div>
  {:else}
    <div class="info-box mb-16" style="font-size:12px;">
      ℹ Les stats croisees apparaitront apres 20+ trades enregistres
      (actuellement {tradesJoues.length} trade{tradesJoues.length > 1 ? 's' : ''}).
    </div>
  {/if}

  {#if $trades.length === 0}
    <div class="empty-state" style="padding:24px;">
      <div class="empty-state__icon">📋</div>
      <div class="empty-state__title">Aucun trade enregistre</div>
      <div class="empty-state__desc">Utilisez la fiche rapide sur une carte match pour noter vos trades.</div>
    </div>
  {:else}
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Match</th>
            <th>Signal</th>
            <th>1MT</th>
            <th>H2H</th>
            <th>Resultat</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {#each recentTrades as t (t.id)}
            <tr>
              <td>{t.date || '—'}</td>
              <td style="font-size:12px;">{t.match || '—'}</td>
              <td>{t.fhgPct ? t.fhgPct + '%' : '—'}</td>
              <td>
                {#if t.badge1MT}
                  <span class="badge badge--1mt">★</span>
                {:else}
                  —
                {/if}
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
    {#if $trades.length > 20}
      <p style="font-size:12px;color:var(--color-text-muted);margin-top:8px;">
        Affichage des 20 derniers trades. Voir l'historique complet dans Parametres.
      </p>
    {/if}
  {/if}
</div>
