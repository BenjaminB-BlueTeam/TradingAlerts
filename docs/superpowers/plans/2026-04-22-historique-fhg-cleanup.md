# Historique Alertes + FHG 31-45min + Nettoyage /dc — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une page Historique des alertes avec stats, affiner l'algo FHG sur la fenêtre 31-45 min, et supprimer la route /dc legacy.

**Architecture:** Page `/historique` lit toutes les alertes Supabase et calcule les stats côté client. L'algo FHG dans `generate-alerts.js` passe des champs agrégés `home_goals_ht`/`away_goals_ht` à un parsing de `goal_events` filtré sur min 31–45. La route `/dc` est supprimée (plus dans la nav depuis commit a1bbc1f).

**Tech Stack:** SvelteKit 2, Svelte 5, Supabase JS client, CSS variables existantes (`--color-*`)

---

## Task 1 : Nettoyage — supprimer la route `/dc`

**Files:**
- Delete: `src/routes/dc/+page.svelte`

- [ ] **Step 1: Supprimer le fichier**

```bash
rm src/routes/dc/+page.svelte
rmdir src/routes/dc 2>/dev/null || true
```

- [ ] **Step 2: Vérifier qu'aucune référence ne reste**

```bash
grep -r "/dc" src/lib src/routes --include="*.svelte" --include="*.js"
```

Attendu : aucun résultat (la sidebar n'a plus `/dc` depuis le commit a1bbc1f).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: suppression route /dc legacy"
```

---

## Task 2 : Page Historique — créer `src/routes/historique/+page.svelte`

**Files:**
- Create: `src/routes/historique/+page.svelte`

- [ ] **Step 1: Créer la page**

Créer `src/routes/historique/+page.svelte` avec le contenu suivant :

```svelte
<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/api/supabase.js';

  let alerts = [];
  let loading = true;
  let activeFilter = 'tous';

  const filters = [
    { key: 'tous',      label: 'Tous'      },
    { key: 'fhg',       label: 'FHG'       },
    { key: 'dc',        label: 'DC'        },
    { key: 'validated', label: 'Validé'    },
    { key: 'lost',      label: 'Perdu'     },
    { key: 'encours',   label: 'En cours'  },
  ];

  async function loadAlerts() {
    loading = true;
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .order('kickoff_unix', { ascending: false });
    alerts = error ? [] : (data || []);
    loading = false;
  }

  function isInPlay(a) {
    if (!a.kickoff_unix) return false;
    const now = Math.floor(Date.now() / 1000);
    return a.kickoff_unix <= now && (now - a.kickoff_unix) < 7200;
  }

  // Stats — uniquement sur alertes terminées (validated + lost)
  $: terminated = alerts.filter(a => a.status === 'validated' || a.status === 'lost');

  $: globalPct = terminated.length
    ? Math.round((terminated.filter(a => a.status === 'validated').length / terminated.length) * 100)
    : null;

  $: fhgTerminated = terminated.filter(a => a.signal_type === 'FHG' || a.signal_type === 'FHG+DC');
  $: fhgPct = fhgTerminated.length
    ? Math.round((fhgTerminated.filter(a => a.status === 'validated').length / fhgTerminated.length) * 100)
    : null;

  $: dcTerminated = terminated.filter(a => a.signal_type === 'DC' || a.signal_type === 'FHG+DC');
  $: dcPct = dcTerminated.length
    ? Math.round((dcTerminated.filter(a => a.status === 'validated').length / dcTerminated.length) * 100)
    : null;

  $: fortTerminated = terminated.filter(a => a.confidence === 'fort');
  $: fortPct = fortTerminated.length
    ? Math.round((fortTerminated.filter(a => a.status === 'validated').length / fortTerminated.length) * 100)
    : null;

  $: moyenTerminated = terminated.filter(a => a.confidence === 'moyen');
  $: moyenPct = moyenTerminated.length
    ? Math.round((moyenTerminated.filter(a => a.status === 'validated').length / moyenTerminated.length) * 100)
    : null;

  // Tableau par ligue (trié par taux décroissant)
  $: leagueRows = (() => {
    const map = {};
    for (const a of terminated) {
      const key = a.league_name || '—';
      if (!map[key]) map[key] = { validated: 0, lost: 0 };
      if (a.status === 'validated') map[key].validated++;
      else map[key].lost++;
    }
    return Object.entries(map)
      .map(([name, { validated, lost }]) => ({
        name,
        validated,
        lost,
        pct: Math.round((validated / (validated + lost)) * 100),
      }))
      .sort((a, b) => b.pct - a.pct);
  })();

  // Filtre liste
  $: filteredAlerts = alerts.filter(a => {
    if (activeFilter === 'fhg')       return a.signal_type === 'FHG' || a.signal_type === 'FHG+DC';
    if (activeFilter === 'dc')        return a.signal_type === 'DC'  || a.signal_type === 'FHG+DC';
    if (activeFilter === 'validated') return a.status === 'validated';
    if (activeFilter === 'lost')      return a.status === 'lost';
    if (activeFilter === 'encours')   return a.status === 'pending' && isInPlay(a);
    return true;
  });

  function countFor(key) {
    if (key === 'tous')      return alerts.length;
    if (key === 'fhg')       return alerts.filter(a => a.signal_type === 'FHG' || a.signal_type === 'FHG+DC').length;
    if (key === 'dc')        return alerts.filter(a => a.signal_type === 'DC'  || a.signal_type === 'FHG+DC').length;
    if (key === 'validated') return alerts.filter(a => a.status === 'validated').length;
    if (key === 'lost')      return alerts.filter(a => a.status === 'lost').length;
    if (key === 'encours')   return alerts.filter(a => a.status === 'pending' && isInPlay(a)).length;
    return 0;
  }

  function formatDate(unix) {
    if (!unix) return '—';
    return new Date(unix * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  function resultLabel(a) {
    if (a.status === 'validated') return { label: '✓ Validé',  cls: 'res--validated' };
    if (a.status === 'lost')      return { label: '✗ Perdu',   cls: 'res--lost'      };
    if (isInPlay(a))              return { label: 'EN COURS',  cls: 'res--live'      };
    return                               { label: 'En attente', cls: 'res--pending'  };
  }

  function pctColor(pct) {
    if (pct === null) return 'var(--color-text-muted)';
    if (pct >= 65) return 'var(--color-accent-green)';
    if (pct >= 50) return 'var(--color-signal-moyen)';
    return 'var(--color-danger)';
  }

  onMount(() => { loadAlerts(); });
</script>

<div class="page-title">📈 Historique des Alertes</div>
<div class="page-subtitle">{alerts.length} alerte{alerts.length > 1 ? 's' : ''} au total — {terminated.length} terminée{terminated.length > 1 ? 's' : ''}</div>

<!-- FILTRES -->
<div class="hist-filters">
  {#each filters as f}
    <button class="hist-filter-btn" class:active={activeFilter === f.key} on:click={() => activeFilter = f.key}>
      {f.label} ({countFor(f.key)})
    </button>
  {/each}
</div>

{#if loading}
  <div class="empty-state"><div class="empty-state__icon">⏳</div><div class="empty-state__title">Chargement...</div></div>
{:else if alerts.length === 0}
  <div class="empty-state"><div class="empty-state__icon">📈</div><div class="empty-state__title">Aucune alerte</div></div>
{:else}

  <!-- STATS (uniquement si alertes terminées) -->
  {#if terminated.length > 0}
    <!-- KPI cards -->
    <div class="kpi-row">
      <div class="kpi-card kpi-card--global">
        <div class="kpi-label">Global</div>
        <div class="kpi-value" style:color={pctColor(globalPct)}>{globalPct ?? '—'}%</div>
        <div class="kpi-sub">{terminated.filter(a => a.status === 'validated').length} / {terminated.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">FHG</div>
        <div class="kpi-value" style:color={pctColor(fhgPct)}>{fhgPct ?? '—'}%</div>
        <div class="kpi-sub">{fhgTerminated.filter(a => a.status === 'validated').length} / {fhgTerminated.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">DC</div>
        <div class="kpi-value" style:color={pctColor(dcPct)}>{dcPct ?? '—'}%</div>
        <div class="kpi-sub">{dcTerminated.filter(a => a.status === 'validated').length} / {dcTerminated.length}</div>
      </div>
    </div>

    <!-- Barres de progression fort / moyen -->
    <div class="conf-row">
      <div class="conf-card">
        <div class="conf-label">Confiance fort</div>
        <div class="conf-bar-wrap">
          <div class="conf-bar">
            <div class="conf-bar__fill" style:width="{fortPct ?? 0}%" style:background={pctColor(fortPct)}></div>
          </div>
          <span class="conf-pct" style:color={pctColor(fortPct)}>{fortPct ?? '—'}%</span>
        </div>
        <div class="conf-sub">{fortTerminated.filter(a => a.status === 'validated').length} / {fortTerminated.length}</div>
      </div>
      <div class="conf-card">
        <div class="conf-label">Confiance moyen</div>
        <div class="conf-bar-wrap">
          <div class="conf-bar">
            <div class="conf-bar__fill" style:width="{moyenPct ?? 0}%" style:background={pctColor(moyenPct)}></div>
          </div>
          <span class="conf-pct" style:color={pctColor(moyenPct)}>{moyenPct ?? '—'}%</span>
        </div>
        <div class="conf-sub">{moyenTerminated.filter(a => a.status === 'validated').length} / {moyenTerminated.length}</div>
      </div>
    </div>

    <!-- Tableau par ligue -->
    {#if leagueRows.length > 0}
      <div class="league-table">
        <div class="league-table__header">Performance par ligue</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Ligue</th>
              <th style="text-align:center;color:var(--color-accent-green);">✓</th>
              <th style="text-align:center;color:var(--color-danger);">✗</th>
              <th style="text-align:right;">Taux</th>
            </tr>
          </thead>
          <tbody>
            {#each leagueRows as row}
              <tr>
                <td>{row.name}</td>
                <td style="text-align:center;font-weight:700;color:var(--color-accent-green);">{row.validated}</td>
                <td style="text-align:center;color:var(--color-danger);">{row.lost}</td>
                <td style="text-align:right;font-weight:700;" style:color={pctColor(row.pct)}>{row.pct}%</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}

  <!-- LISTE -->
  <div class="table-wrapper" style="margin-top:16px;">
    {#if filteredAlerts.length === 0}
      <div class="empty-state" style="padding:24px;">
        <div class="empty-state__icon">🔍</div>
        <div class="empty-state__title">Aucune alerte pour ce filtre</div>
      </div>
    {:else}
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Ligue</th>
            <th>Match</th>
            <th>Type</th>
            <th>Résultat</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredAlerts as a (a.id)}
            {@const res = resultLabel(a)}
            <tr>
              <td style="white-space:nowrap;">{formatDate(a.kickoff_unix)}</td>
              <td style="font-size:12px;color:var(--color-text-muted);">{a.league_name || '—'}</td>
              <td style="font-weight:600;">{a.home_team_name} - {a.away_team_name}</td>
              <td>
                <span class="type-badge type-badge--{a.signal_type.toLowerCase().replace('+','')}">
                  {a.signal_type}
                </span>
              </td>
              <td><span class="res-label {res.cls}">{res.label}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
{/if}

<style>
  .hist-filters { display: flex; gap: 4px; margin-bottom: 20px; flex-wrap: wrap; }
  .hist-filter-btn { background: rgba(255,255,255,0.05); border: 1px solid var(--color-border); border-radius: 6px; padding: 5px 12px; font-size: 12px; color: var(--color-text-muted); cursor: pointer; transition: all 0.15s; }
  .hist-filter-btn.active { background: var(--color-accent-blue); border-color: var(--color-accent-blue); color: white; }

  .kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }
  .kpi-card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 8px; padding: 14px; text-align: center; }
  .kpi-card--global { border-color: var(--color-accent-green); }
  .kpi-label { font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .kpi-value { font-size: 30px; font-weight: 700; }
  .kpi-sub { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }

  .conf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
  .conf-card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 8px; padding: 10px 14px; }
  .conf-label { font-size: 10px; color: var(--color-text-muted); text-transform: uppercase; margin-bottom: 6px; }
  .conf-bar-wrap { display: flex; align-items: center; gap: 10px; }
  .conf-bar { flex: 1; background: rgba(255,255,255,0.06); border-radius: 4px; height: 8px; overflow: hidden; }
  .conf-bar__fill { height: 100%; border-radius: 4px; transition: width 0.4s; }
  .conf-pct { font-size: 14px; font-weight: 700; min-width: 36px; text-align: right; }
  .conf-sub { font-size: 10px; color: var(--color-text-muted); margin-top: 4px; }

  .league-table { margin-bottom: 8px; }
  .league-table__header { font-size: 11px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 0 4px; }

  .type-badge { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; }
  .type-badge--fhg    { background: rgba(55,138,221,0.15); color: var(--color-accent-blue); }
  .type-badge--dc     { background: rgba(239,159,39,0.15);  color: var(--color-signal-moyen); }
  .type-badge--fhgdc  { background: rgba(29,158,117,0.15);  color: var(--color-accent-green); }

  .res-label { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
  .res--validated { background: rgba(29,158,117,0.15); color: var(--color-accent-green); }
  .res--lost      { background: rgba(226,75,74,0.15);  color: var(--color-danger); }
  .res--live      { background: rgba(239,159,39,0.2);  color: var(--color-signal-moyen); animation: pulse 2s infinite; }
  .res--pending   { background: rgba(255,255,255,0.05); color: var(--color-text-muted); }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

  @media (max-width: 768px) {
    .kpi-row { grid-template-columns: repeat(3, 1fr); }
    .conf-row { grid-template-columns: 1fr; }
  }
</style>
```

- [ ] **Step 2: Vérifier visuellement**

Lancer `npm run dev` et ouvrir http://localhost:5173/historique. Vérifier :
- La page charge sans erreur console
- Les stats apparaissent si des alertes terminées existent
- Les filtres fonctionnent
- La liste affiche les colonnes dans le bon ordre

---

## Task 3 : Ajouter `/historique` dans la Sidebar

**Files:**
- Modify: `src/lib/components/Sidebar.svelte`

- [ ] **Step 1: Ajouter l'item dans navItems**

Dans `src/lib/components/Sidebar.svelte`, modifier le tableau `navItems` (ligne ~16) :

```js
const navItems = [
  { href: '/',              icon: '📊', label: 'Dashboard'          },
  { href: '/alerts',        icon: '⚡', label: 'Sélection FHG'      },
  { href: '/selection-dc',  icon: '🎯', label: 'Sélection DC'       },
  { href: '/historique',    icon: '📈', label: 'Historique'         },
  { href: '/matches',       icon: '⚽', label: 'Matchs à venir'     },
  { href: '/explore',       icon: '🌍', label: 'Classements ligues' },
  { href: '/settings',      icon: '⚙️', label: 'Paramètres'        },
];
```

- [ ] **Step 2: Vérifier visuellement**

Vérifier que "📈 Historique" apparaît dans la sidebar entre "Sélection DC" et "Matchs à venir", et que le lien navigue vers `/historique`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/historique/+page.svelte src/lib/components/Sidebar.svelte
git commit -m "feat: page Historique des alertes avec stats et filtres"
```

---

## Task 4 : Affiner FHG — fenêtre 31-45 min dans `generate-alerts.js`

**Files:**
- Modify: `netlify/functions/generate-alerts.js` — fonction `analyzeFHGFromMatches()`

**Contexte :** `goal_events` est un JSON array stocké en Supabase avec le format `[{min: 23, home: true}, {min: 38, home: false}]`. `home: true` = but de l'équipe qui joue à domicile dans ce match. Le champ est trié par minute croissante.

- [ ] **Step 1: Remplacer la logique de comptage dans `analyzeFHGFromMatches()`**

Dans `netlify/functions/generate-alerts.js`, remplacer le bloc suivant (lignes ~84-102) :

**Avant :**
```js
const teamGoalsHT = matches.map(m =>
  context === 'home' ? (m.home_goals_ht || 0) : (m.away_goals_ht || 0)
);
const oppGoalsHT = matches.map(m =>
  context === 'home' ? (m.away_goals_ht || 0) : (m.home_goals_ht || 0)
);

const pctGoal1MT = Math.round((teamGoalsHT.filter(g => g > 0).length / matches.length) * 100);
const pct2Plus1MT = Math.round((teamGoalsHT.filter(g => g >= 2).length / matches.length) * 100);

// Réaction quand adversaire marque en 1MT
let pctReaction1MT = null;
const oppScored = matches.filter((_, i) => oppGoalsHT[i] > 0);
if (oppScored.length >= 2) {
  const reactions = oppScored.filter((m, idx) => {
    const origIdx = matches.indexOf(m);
    return teamGoalsHT[origIdx] > 0;
  }).length;
  pctReaction1MT = Math.round((reactions / oppScored.length) * 100);
}

// Clean sheet H2H
let cleanSheetBlock = false;
if (h2h.length >= 3) {
  const h2hGoals = h2h.filter(m => {
    const isHome = m.home_team_id === teamId;
    return (isHome ? (m.home_goals_ht || 0) : (m.away_goals_ht || 0)) > 0;
  }).length;
  if (h2hGoals === 0) cleanSheetBlock = true;
}
```

**Après :**
```js
const teamIsHome = context === 'home';

// Compter les buts dans la fenêtre 31-45 min via goal_events
const teamGoals3145 = matches.map(m => {
  const events = Array.isArray(m.goal_events) ? m.goal_events : [];
  return events.filter(e => e.min >= 31 && e.min <= 45 && e.home === teamIsHome).length;
});
const oppGoals3145 = matches.map(m => {
  const events = Array.isArray(m.goal_events) ? m.goal_events : [];
  return events.filter(e => e.min >= 31 && e.min <= 45 && e.home !== teamIsHome).length;
});

const pctGoal1MT = Math.round((teamGoals3145.filter(g => g > 0).length / matches.length) * 100);
const pct2Plus1MT = Math.round((teamGoals3145.filter(g => g >= 2).length / matches.length) * 100);

// Réaction quand adversaire marque en 31-45 min
let pctReaction1MT = null;
const oppScored = matches.filter((_, i) => oppGoals3145[i] > 0);
if (oppScored.length >= 2) {
  const reactions = oppScored.filter((m, idx) => {
    const origIdx = matches.indexOf(m);
    return teamGoals3145[origIdx] > 0;
  }).length;
  pctReaction1MT = Math.round((reactions / oppScored.length) * 100);
}

// Clean sheet H2H — jamais marqué en 31-45 min contre cet adversaire
let cleanSheetBlock = false;
if (h2h.length >= 3) {
  const h2hGoals = h2h.filter(m => {
    const events = Array.isArray(m.goal_events) ? m.goal_events : [];
    const teamIsHomeInH2H = m.home_team_id === teamId;
    return events.some(e => e.min >= 31 && e.min <= 45 && e.home === teamIsHomeInH2H);
  }).length;
  if (h2hGoals === 0) cleanSheetBlock = true;
}
```

- [ ] **Step 2: Vérifier manuellement**

Ouvrir la page Debug (`/debug`) et déclencher manuellement la fonction `generate-alerts` si possible. Sinon, vérifier que le fichier `netlify/functions/generate-alerts.js` passe le build :

```bash
npm run build
```

Attendu : build réussi sans erreur.

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/generate-alerts.js
git commit -m "feat: FHG analyse fenêtre 31-45 min via goal_events"
```

---

## Task 5 : Push et vérification finale

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Vérifier le déploiement Netlify**

Sur https://tradingfootalerts.netlify.app/ :
- La page `/historique` est accessible
- La sidebar affiche "📈 Historique"
- La route `/dc` renvoie une 404 (supprimée)

- [ ] **Step 3: Mettre à jour CLAUDE.md**

Dans la section "Ce qui est implémenté", ajouter :
- `**Page Historique** (/historique) — stats globales (Global/FHG/DC/fort/moyen), tableau par ligue, liste filtrée de toutes les alertes`

Dans la section "Architecture des fichiers", ajouter :
- `historique/+page.svelte ← Historique alertes + stats performance`

Dans la roadmap, cocher :
- `[x] **Affiner FHG fenêtre 31-45 min**`

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — historique alertes + FHG 31-45min"
git push
```
