# Matchs à venir — Refonte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le dropdown de plage par une navigation jour-par-jour style Flashscore (J-1 à J+29), ajouter un cache TTL 72h par date, et afficher un panneau équipe (tous les matchs de la saison) quand une équipe est sélectionnée.

**Architecture:** Un seul fichier Svelte modifié (`+page.svelte`). Deux helpers purs ajoutés dans `formatters.js` (testables). Cache via `cacheGet`/`cacheSet` existants avec TTL 72h. Panneau équipe alimenté par `h2h_matches` Supabase via `loadTeamMatches` déjà en place.

**Tech Stack:** Svelte 5 runes (`$state`, `$derived`, `$effect`), SvelteKit 2, cache.js (localStorage TTL), Supabase h2h_matches, FootyStats API `todays-matches`

---

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/lib/utils/formatters.js` | Ajouter `addDays(dateStr, n)` et `dateLabelNav(dateStr)` |
| `src/lib/utils/formatters.test.js` | Ajouter tests pour les deux helpers |
| `src/routes/matches/+page.svelte` | Refonte : nav Flashscore + cache 72h + panneau équipe |

---

## Task 1 : Helpers de navigation de date

**Files:**
- Modify: `src/lib/utils/formatters.js`
- Modify: `src/lib/utils/formatters.test.js`

- [ ] **Step 1.1 : Écrire les tests qui échouent**

Ajouter à la fin de `src/lib/utils/formatters.test.js` :

```js
import { addDays, dateLabelNav } from './formatters.js';

describe('addDays', () => {
  it('adds 1 day to a date string', () => {
    expect(addDays('2026-05-07', 1)).toBe('2026-05-08');
  });

  it('subtracts 1 day when n is -1', () => {
    expect(addDays('2026-05-07', -1)).toBe('2026-05-06');
  });

  it('handles month rollover', () => {
    expect(addDays('2026-05-31', 1)).toBe('2026-06-01');
  });

  it('returns YYYY-MM-DD format', () => {
    expect(addDays('2026-05-07', 5)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('dateLabelNav', () => {
  it('returns "Aujourd\'hui" for today', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(dateLabelNav(today)).toBe("Aujourd'hui");
  });

  it('returns "Hier" for yesterday', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().split('T')[0];
    expect(dateLabelNav(yesterday)).toBe('Hier');
  });

  it('returns "Demain" for tomorrow', () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const tomorrow = d.toISOString().split('T')[0];
    expect(dateLabelNav(tomorrow)).toBe('Demain');
  });

  it('returns short weekday + date for other days', () => {
    // '2026-01-01' is a Thursday → starts with "Jeu."
    const result = dateLabelNav('2026-01-01');
    expect(result).toMatch(/^[A-ZÀ-Ÿa-zà-ÿ]{3}\./);
  });
});
```

- [ ] **Step 1.2 : Vérifier que les tests échouent**

```bash
npm test -- --reporter=verbose formatters
```

Attendu : `addDays is not a function` / `dateLabelNav is not a function`

- [ ] **Step 1.3 : Implémenter les deux helpers dans `formatters.js`**

Ajouter à la fin de `src/lib/utils/formatters.js` :

```js
/**
 * Adds n days to a YYYY-MM-DD date string.
 * @param {string} dateStr
 * @param {number} n
 * @returns {string} YYYY-MM-DD
 */
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00'); // noon pour éviter DST
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

/**
 * Returns a short navigation label for a date string.
 * "Hier", "Aujourd'hui", "Demain", or "Jeu. 08/05"
 * @param {string} dateStr YYYY-MM-DD
 * @returns {string}
 */
export function dateLabelNav(dateStr) {
  const today = getDateStr(0);
  const yesterday = getDateStr(-1);
  const tomorrow = getDateStr(1);
  if (dateStr === today) return "Aujourd'hui";
  if (dateStr === yesterday) return 'Hier';
  if (dateStr === tomorrow) return 'Demain';
  const d = new Date(dateStr + 'T12:00:00');
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'short' });
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1, 3)}. ${day}/${month}`;
}
```

- [ ] **Step 1.4 : Vérifier que les tests passent**

```bash
npm test -- --reporter=verbose formatters
```

Attendu : tous les tests `addDays` et `dateLabelNav` PASS.

- [ ] **Step 1.5 : Commit**

```bash
git add src/lib/utils/formatters.js src/lib/utils/formatters.test.js
git commit -m "feat(formatters): addDays + dateLabelNav pour navigation Flashscore"
```

---

## Task 2 : Navigation Flashscore + cache TTL 72h

**Files:**
- Modify: `src/routes/matches/+page.svelte`

Remplace le dropdown `<select>` de plage par une barre `← date →` et intègre le cache 72h.

- [ ] **Step 2.1 : Mettre à jour les imports en haut du `<script>`**

Remplacer la ligne d'import de formatters :

```js
import { getDateStr, formatDate, formatTime, fhgColor, addDays, dateLabelNav } from '$lib/utils/formatters.js';
import { cacheGet, cacheSet } from '$lib/api/cache.js';
```

- [ ] **Step 2.2 : Remplacer `filtrePlage` par `currentDate`**

Supprimer :
```js
let filtrePlage = $state(0);
```

Ajouter :
```js
let currentDate = $state(getDateStr(0));

const DATE_MIN = getDateStr(-1);  // hier
const DATE_MAX = getDateStr(29);  // +30 jours

const TTL_MATCHES = 72 * 60 * 60 * 1000; // 72h en ms

function canGoBack() { return currentDate > DATE_MIN; }
function canGoForward() { return currentDate < DATE_MAX; }
function goBack() { if (canGoBack()) currentDate = addDays(currentDate, -1); }
function goForward() { if (canGoForward()) currentDate = addDays(currentDate, 1); }
function goToday() { currentDate = getDateStr(0); }
```

- [ ] **Step 2.3 : Mettre à jour `loadMatches` pour utiliser `currentDate` et le cache 72h**

Remplacer la fonction `loadMatches(plage)` entière par :

```js
async function loadMatches(dateStr) {
  loading = true;
  error = '';

  const cacheKey = `todays-matches-${dateStr}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    allMatches = cached;
    loading = false;
    // charger FHG stats en background (déjà en cache si visité)
    const teamPairs = cached.filter(m => m.homeID && m.awayID);
    for (let i = 0; i < teamPairs.length; i += 10) {
      await Promise.all(teamPairs.slice(i, i + 10).map(m => loadFhgStats(m.homeID, m.awayID)));
    }
    return;
  }

  try {
    const matches = await getTodaysMatches(dateStr);
    const results = Array.isArray(matches) ? matches : [];

    const seen = new Set();
    const unique = [];
    for (const m of results) {
      if (m.id && !seen.has(m.id)) { seen.add(m.id); unique.push(m); }
    }

    cacheSet(cacheKey, unique, TTL_MATCHES);
    allMatches = unique;

    const teamPairs = unique.filter(m => m.homeID && m.awayID);
    for (let i = 0; i < teamPairs.length; i += 10) {
      await Promise.all(teamPairs.slice(i, i + 10).map(m => loadFhgStats(m.homeID, m.awayID)));
    }
  } catch (e) {
    console.error('loadMatches error:', e);
    error = 'Impossible de charger les matchs.';
  }

  loading = false;
}
```

- [ ] **Step 2.4 : Mettre à jour le `$effect` pour écouter `currentDate`**

Remplacer :
```js
$effect(() => { loadMatches(filtrePlage); });
```

Par :
```js
$effect(() => { loadMatches(currentDate); });
```

- [ ] **Step 2.5 : Remplacer le `<select>` plage dans le HTML par la barre Flashscore**

Supprimer dans le template :
```html
<select class="filter-select" bind:value={filtrePlage}>
  <option value={0}>Aujourd'hui</option>
  <option value={1}>Demain</option>
  <option value={2}>Après-demain</option>
  <option value={-1}>3 jours</option>
</select>
```

Ajouter à sa place :
```html
<div class="date-nav">
  <button
    class="date-nav__arrow"
    onclick={goBack}
    disabled={!canGoBack()}
    aria-label="Jour précédent"
  >‹</button>
  <button
    class="date-nav__label"
    onclick={goToday}
    title="Revenir à aujourd'hui"
  >{dateLabelNav(currentDate)}</button>
  <button
    class="date-nav__arrow"
    onclick={goForward}
    disabled={!canGoForward()}
    aria-label="Jour suivant"
  >›</button>
</div>
```

- [ ] **Step 2.6 : Ajouter les styles CSS pour `.date-nav`**

Dans le bloc `<style>` du composant, ajouter :

```css
.date-nav {
  display: flex;
  align-items: center;
  gap: 0;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  overflow: hidden;
  flex-shrink: 0;
}

.date-nav__arrow {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  padding: 6px 12px;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.date-nav__arrow:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-primary);
}
.date-nav__arrow:disabled {
  opacity: 0.3;
  cursor: default;
}

.date-nav__label {
  background: none;
  border: none;
  border-left: 1px solid var(--color-border);
  border-right: 1px solid var(--color-border);
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 16px;
  min-width: 120px;
  text-align: center;
  transition: background var(--transition-fast);
}
.date-nav__label:hover {
  background: rgba(255, 255, 255, 0.04);
}
```

- [ ] **Step 2.7 : Vérifier visuellement**

Lancer `npm run dev`, ouvrir `/matches`. Vérifier :
- Barre `‹ Aujourd'hui ›` visible
- Clic `›` → passe au lendemain, charges les matchs
- Clic sur le label → revient à aujourd'hui
- `‹` désactivé sur J-1 (hier), `›` désactivé sur J+29
- F5 sur une date non-aujourd'hui → recharge depuis le cache

- [ ] **Step 2.8 : Commit**

```bash
git add src/routes/matches/+page.svelte
git commit -m "feat(matches): navigation Flashscore ← date → + cache TTL 72h"
```

---

## Task 3 : Panneau équipe (historique saison en cours)

**Files:**
- Modify: `src/routes/matches/+page.svelte`

Ajoute le panneau affiché sous la barre de filtres quand une équipe est sélectionnée.

- [ ] **Step 3.1 : Ajouter l'état du contexte dom/ext**

Dans le `<script>`, après la déclaration de `selectedTeam` :

```js
let teamContext = $state('home'); // 'home' | 'away'

let teamMatches = $derived.by(() => {
  if (!selectedTeam) return [];
  return getTeamMatches(selectedTeam.id, teamContext);
});
```

- [ ] **Step 3.2 : Charger les matchs équipe quand la sélection change**

Ajouter un `$effect` après les autres effects :

```js
$effect(() => {
  if (!selectedTeam) return;
  loadTeamMatches(selectedTeam.id, 'home');
  loadTeamMatches(selectedTeam.id, 'away');
});
```

> Note : `loadTeamMatches(teamId, context)` est déjà défini dans la page — charge depuis Supabase `h2h_matches` et met en cache dans `teamMatchesCache`.

- [ ] **Step 3.3 : Helper pour affichage d'un match dans le panneau**

Dans le `<script>` :

```js
function teamMatchOpponent(match, teamId) {
  const isHome = match.homeID === teamId || match.home_id === teamId;
  return {
    isHome,
    opponent: isHome ? match.away_name : match.home_name,
    score: match.homeGoalCount !== undefined
      ? (isHome ? `${match.homeGoalCount}-${match.awayGoalCount}` : `${match.awayGoalCount}-${match.homeGoalCount}`)
      : '—',
  };
}

function hasGoal3145(match, isHome) {
  const events = Array.isArray(match.goal_events) ? match.goal_events : [];
  return events.some(e => e.min >= 31 && e.min <= 45 && e.home === isHome);
}
```

- [ ] **Step 3.4 : Ajouter le HTML du panneau dans le template**

Insérer entre la `.filters-bar` et la section `<!-- LISTE -->` :

```html
{#if selectedTeam}
  <div class="team-panel">
    <div class="team-panel__header">
      <span class="team-panel__name">{selectedTeam.name}</span>
      <div class="team-panel__ctx-btns">
        <button
          class="ctx-btn"
          class:ctx-btn--active={teamContext === 'home'}
          onclick={() => teamContext = 'home'}
        >Domicile</button>
        <button
          class="ctx-btn"
          class:ctx-btn--active={teamContext === 'away'}
          onclick={() => teamContext = 'away'}
        >Extérieur</button>
      </div>
      <span class="team-panel__count">{teamMatches.length} match{teamMatches.length !== 1 ? 's' : ''}</span>
    </div>

    {#if teamMatches.length === 0}
      <div class="team-panel__empty">Aucun match en base pour ce contexte</div>
    {:else}
      <div class="team-panel__list">
        {#each teamMatches as m (m.id ?? m.match_id)}
          {@const info = teamMatchOpponent(m, selectedTeam.id)}
          {@const goal = hasGoal3145(m, info.isHome)}
          {@const dateStr = m.date_unix
            ? new Date(m.date_unix * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
            : (m.match_date ?? '—')}
          <div class="team-panel__row" class:team-panel__row--goal={goal}>
            <span class="team-panel__date">{dateStr}</span>
            <span class="team-panel__opponent">{info.opponent || '—'}</span>
            <span class="team-panel__score">{info.score}</span>
            <span class="team-panel__goal-dot" title={goal ? 'But 31-45 ●' : 'Pas de but 31-45'}>
              {goal ? '●' : '—'}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
```

- [ ] **Step 3.5 : Ajouter les styles CSS du panneau équipe**

Dans le bloc `<style>` :

```css
/* ---- Team panel ---- */
.team-panel {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  margin-bottom: 12px;
  overflow: hidden;
}

.team-panel__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-border);
  flex-wrap: wrap;
}

.team-panel__name {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-primary);
  flex: 1;
}

.team-panel__ctx-btns {
  display: flex;
  gap: 4px;
}

.ctx-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  transition: all var(--transition-fast);
}
.ctx-btn--active {
  background: rgba(29, 158, 117, 0.15);
  border-color: rgba(29, 158, 117, 0.5);
  color: var(--color-accent-green);
}

.team-panel__count {
  font-size: 11px;
  color: var(--color-text-muted);
}

.team-panel__empty {
  padding: 16px 14px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.team-panel__list {
  max-height: 320px;
  overflow-y: auto;
}

.team-panel__row {
  display: grid;
  grid-template-columns: 48px 1fr 60px 24px;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 12px;
  transition: background var(--transition-fast);
}
.team-panel__row:last-child {
  border-bottom: none;
}
.team-panel__row:hover {
  background: rgba(255,255,255,0.03);
}
.team-panel__row--goal {
  background: rgba(29, 158, 117, 0.04);
}

.team-panel__date {
  color: var(--color-text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.team-panel__opponent {
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.team-panel__score {
  color: var(--color-text-secondary);
  font-weight: 600;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.team-panel__goal-dot {
  text-align: center;
  color: var(--color-accent-green);
  font-size: 10px;
}
```

- [ ] **Step 3.6 : Vérifier visuellement**

Ouvrir `/matches`, chercher une équipe (ex: "PSG"), la sélectionner. Vérifier :
- Panneau apparaît entre filtres et liste de matchs
- Toggle Dom / Ext change les matchs affichés
- Indicateur `●` sur les matchs avec but 31-45
- Scroll si beaucoup de matchs (max-height 320px)
- Panel disparaît si on efface l'équipe (bouton ✕)

- [ ] **Step 3.7 : Lancer les tests pour vérifier aucune régression**

```bash
npm test
```

Attendu : tous les tests PASS (le refactoring ne touche aucune fonction testée).

- [ ] **Step 3.8 : Commit final**

```bash
git add src/routes/matches/+page.svelte
git commit -m "feat(matches): panneau équipe — matchs saison dom/ext + indicateur 31-45"
```

- [ ] **Step 3.9 : Push**

```bash
git push
```

---

## Self-Review

- [x] Navigation Flashscore → Task 2 ✓
- [x] Cache TTL 72h → Task 2.3 (`TTL_MATCHES = 72 * 60 * 60 * 1000`) ✓
- [x] Plage J-1 à J+29 → `DATE_MIN = getDateStr(-1)`, `DATE_MAX = getDateStr(29)` ✓
- [x] Panneau équipe plein-largeur au-dessus de la liste → Task 3 ✓
- [x] Toggle Dom/Ext défaut Dom → `teamContext = $state('home')` ✓
- [x] Tous matchs saison → `loadTeamMatches` charge tout `h2h_matches` ✓
- [x] Indicateur but 31-45 → `hasGoal3145()` ✓
- [x] Comportement liste inchangé → filtre `selectedTeam` conservé ✓
- [x] Svelte 5 runes uniquement → `$state`, `$derived`, `$effect`, `onclick` ✓
- [x] Aucune nouvelle dépendance npm ✓
