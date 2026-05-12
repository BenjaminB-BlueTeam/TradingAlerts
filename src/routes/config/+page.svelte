<script>
  import { config, saveConfig } from '$lib/stores/appStore.js';

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

  let cfg = $derived($config);
</script>

<h1 class="page-title">Alertes & Configuration</h1>
<p class="page-subtitle">Parametrez les seuils de la strategie LG1</p>

<!-- BLOC LG1 -->
<div class="settings-block">
  <div class="settings-block__title">⚡ Criteres LG1 principaux</div>

  <div class="slider-row mb-16">
    <div class="slider-header">
      <span class="slider-label">Seuil LG1 31-45min saison N</span>
      <span class="slider-value">{cfg.seuilLG1}%</span>
    </div>
    <input type="range" class="form-input"
      min="60" max="90" value={cfg.seuilLG1}
      onchange={e => setConfig('seuilLG1', parseInt(e.target.value))}
      oninput={e => config.update(c => ({...c, seuilLG1: parseInt(e.target.value)}))} />
  </div>

  <div class="slider-row mb-16">
    <div class="slider-header">
      <span class="slider-label">Seuil forme 5 derniers matchs</span>
      <span class="slider-value">{cfg.seuil5Matchs}/5</span>
    </div>
    <input type="range" class="form-input"
      min="2" max="5" value={cfg.seuil5Matchs}
      onchange={e => setConfig('seuil5Matchs', parseInt(e.target.value))}
      oninput={e => config.update(c => ({...c, seuil5Matchs: parseInt(e.target.value)}))} />
  </div>

  <div class="toggle-row">
    <div class="toggle-info">
      <div class="toggle-info__label">Ignorer debut de saison</div>
      <div class="toggle-info__sub">Malus -10 pts si moins de {cfg.seuilMatchsMin} matchs joues</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" checked={cfg.ignoreDebutSaison}
        onchange={e => setToggle('ignoreDebutSaison', e.target.checked)} />
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
      onchange={e => setConfig('seuilMatchsMin', parseInt(e.target.value))}
      oninput={e => config.update(c => ({...c, seuilMatchsMin: parseInt(e.target.value)}))} />
  </div>

  <div class="toggle-row">
    <div class="toggle-info">
      <div class="toggle-info__label">Ponderation saison N-1</div>
      <div class="toggle-info__sub">Integre les stats de la saison precedente (25%)</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" checked={cfg.ponderationN1}
        onchange={e => setToggle('ponderationN1', e.target.checked)} />
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
        onchange={e => setToggle('afficher1MT', e.target.checked)} />
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
        onchange={e => setToggle('alerter1MT', e.target.checked)} />
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
      onchange={e => setConfig('seuil1MT', parseInt(e.target.value))}
      oninput={e => config.update(c => ({...c, seuil1MT: parseInt(e.target.value)}))} />
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
        onchange={e => setToggle('filtreH2HActif', e.target.checked)} />
      <span class="toggle-slider"></span>
    </label>
  </div>

  {#if !cfg.filtreH2HActif}
    <div class="danger-box mt-8">
      🚫 Desactiver ce filtre va a l'encontre de la regle fondamentale de la methode.
      La recurrence prime sur tout. Un LG1 de 90% ne justifie pas de prendre un match
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
      onchange={e => setConfig('minH2H', parseInt(e.target.value))}
      oninput={e => config.update(c => ({...c, minH2H: parseInt(e.target.value)}))} />
  </div>

  <div class="slider-row mb-0">
    <div class="slider-header">
      <span class="slider-label">Penalite H2H orange (1 but en 1MT)</span>
      <span class="slider-value">-{cfg.penaliteH2H} pts</span>
    </div>
    <input type="range" class="form-input"
      min="5" max="15" value={cfg.penaliteH2H}
      onchange={e => setConfig('penaliteH2H', parseInt(e.target.value))}
      oninput={e => config.update(c => ({...c, penaliteH2H: parseInt(e.target.value)}))} />
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
          onclick={() => setProfil(p)}>
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
        onchange={e => setConfig('minuteMin', parseInt(e.target.value))}
        oninput={e => config.update(c => ({...c, minuteMin: parseInt(e.target.value)}))} />
    </div>
    <div class="slider-row">
      <div class="slider-header">
        <span class="slider-label">Ne pas alerter apres la</span>
        <span class="slider-value">{cfg.minuteMax}e min</span>
      </div>
      <input type="range" class="form-input"
        min="50" max="90" value={cfg.minuteMax}
        onchange={e => setConfig('minuteMax', parseInt(e.target.value))}
        oninput={e => config.update(c => ({...c, minuteMax: parseInt(e.target.value)}))} />
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
      onchange={e => setConfig('maxAlertes', parseInt(e.target.value))}
      oninput={e => config.update(c => ({...c, maxAlertes: parseInt(e.target.value)}))} />
  </div>

  <div class="toggle-row">
    <div class="toggle-info">
      <div class="toggle-info__label">Stop apres N victoires consecutives</div>
      <div class="toggle-info__sub">Pause automatique apres une serie gagnante</div>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" checked={cfg.stopVictoires}
        onchange={e => setToggle('stopVictoires', e.target.checked)} />
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
      onchange={e => setConfig('nbVictoires', parseInt(e.target.value))}
      oninput={e => config.update(c => ({...c, nbVictoires: parseInt(e.target.value)}))} />
  </div>
</div>

