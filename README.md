# FHG Tracker

Application de **trading sportif football** qui identifie les matchs avec fort potentiel de but en fin de 1re mi-temps (fenetre 31-45 min, FHG = First Half Goal) et les opportunites de but tardif (LG2 = Late Goal, >= 80 min).

**URL** : https://tradingfootalerts.netlify.app

## Stack technique

| Couche | Tech |
|--------|------|
| Frontend | SvelteKit 2 + Svelte 5 runes (SPA) |
| Build | Vite 6 |
| Deploiement | Netlify (adapter-netlify) + Netlify Scheduled Functions |
| Donnees matchs | API FootyStats via proxy Netlify securise |
| Base de donnees | Supabase (PostgreSQL, RLS actif) |
| Charts | Chart.js 4.4 (tree-shake) |
| Auth | Supabase Auth (email, solo) + guard SvelteKit |
| Tests | Vitest (331 tests unitaires) |

## Fonctionnalites

### Alertes autonomes
- Generation automatique toutes les 12h (`generate-alerts.js`) pour J, J+1, J+2
- Tags **FHG_A**, **FHG_B**, **FHG_A+B** avec confiance fort/moyen/fort_double
- Tags **LG2_A**, **LG2_B**, **LG2_A+B** (but >= 80 min)
- Verification auto des resultats toutes les heures (`check-results.js`)
- Validation FHG : buts dans la fenetre 31-45 min (goal_events)
- Validation LG2 : au moins un but >= 80 min
- Cleanup automatique des alertes pending > 48h (status `expired`)

### Dashboard (`/`)
- 5 KPIs en temps reel : statut API, ligues actives (N/50), FHG Fort du jour, LG2 Fort du jour, alertes en attente
- Alertes du jour et a venir depuis Supabase

### Selection FHG (`/alerts`)
- Alertes FHG_A/B/A+B avec filtres : jour, ligue, confiance (Tout/Fort/Moyen)
- Expand detaille : 15 derniers matchs dom/ext par equipe
- Barres de timing buts (minutes exactes), curseur interactif
- Stats resume : 1MT%, AVG buts
- Badges Valide/Perdu/EN COURS

### Selection LG2 (`/alerts-lg2`)
- Alertes LG2_A/B/A+B avec filtres : jour, ligue, confiance (Tout/Fort/Moyen)
- Expand par equipe avec barres timing buts (marqueur 80', buts apres 80' encadres)
- Pills Dom/Ext affichant la longueur du streak

### Mes matchs (`/mes-matchs`)
- Alertes selectionnees manuellement dans FHG et LG2
- Sections : A venir / Aujourd'hui / Passes
- Tri par date et confiance (fort_double > fort > moyen)

### Historique (`/historique`)
- FiltersBar multi-criteres : periode, strategie FHG/LG2, confiance, equipe, ligue, statut
- Grille 2x2 Chart.js : evolution hybride, stacked par strategie, top 10 equipes, top 10 ligues
- Tableau dense triable avec expand goal-bar, infinite scroll
- Blocs "Mes trades vs Global" et "What-if exclusions" (Wilson CI 95%)

### Matchs a venir (`/matches`)
- Matchs par date avec filtres ligue + recherche equipe (autocomplete)
- Badge FHG 31-45% par equipe (saison en cours, contexte dom/ext)
- Cards avec expand (barres timing buts, curseur minute)

### Autres pages
- **Classements ligues** (`/explore`) — par pays, stats, classements
- **Ligues actives** (`/leagues`) — 50 ligues, toggle actif/inactif, FHG% equipes
- **Parametres** (`/settings`) — journal trades, bankroll
- **Configuration** (`/config`) — config algo (Admin)
- **Debug** (`/debug`) — tests API/Supabase, seed, panel crons (auth requise en prod)

---

## Algorithme FHG — streak v2

Analyse de **recurrence comportementale par equipe** dans son contexte (domicile ou exterieur).

**Scenario A** — l'equipe marque en 31-45 :
1. Streak consecutif >= 3 matchs avec but en 31-45 (dom ou ext selon role)
2. Confirmation : l'adversaire concede en 1MT dans >= 60% de ses 5 derniers matchs

**Scenario B** — l'adversaire concede en 31-45 :
1. Count >= 3/5 matchs (non consecutif) avec but encaisse en 31-45
2. Confirmation : l'equipe marque en 1MT dans >= 60% de ses 5 derniers matchs

| Signal | Description | Confidence |
|--------|-------------|-----------|
| `FHG_A` | Scenario A seul (streak >= 3) | `fort` |
| `FHG_B` | Scenario B seul (count 3/5) | `moyen` |
| `FHG_A+B` | A et B simultanes | `fort_double` |

**Veto H2H** : >= 3 H2H sans but 1MT de l'equipe → exclusion totale.

## Algorithme LG2 — streak but >= 80'

Streak consecutif de matchs avec au moins un but apres la 80e minute, par equipe et par cote (dom/ext).

| Signal | Description | Confidence |
|--------|-------------|-----------|
| `LG2_A` | Streak dom >= 3 | `moyen` (3) / `fort` (4+) |
| `LG2_B` | Streak ext >= 3 | `moyen` (3) / `fort` (4+) |
| `LG2_A+B` | A et B simultanes | `fort_double` |

---

## Architecture

```
[Browser SPA — Svelte 5 runes]
    |
    +-- /.netlify/functions/footystats  --> [FootyStats API] (proxy, whitelist, CORS restreint)
    +-- Supabase JS client (anon, RLS)  --> [Supabase PostgreSQL]
    |
[Netlify Scheduled Functions (service_role)]
    +-- generate-alerts.js   (cron 12h) --> FootyStats + Supabase (FHG + LG2)
    +-- check-results.js     (cron 1h)  --> FootyStats + Supabase (valide/perdu)
    +-- daily-seed.js        (cron 6h)  --> FootyStats + Supabase (matchs d'hier)
    +-- compute-team-fhg.js  (cron 7h)  --> Supabase team_fhg_cache
```

### Tables Supabase (RLS actif)

| Table | Role | anon |
|-------|------|------|
| `alerts` | Alertes FHG/LG2 (pending/validated/lost/expired) | SELECT |
| `trades` | Journal des trades | ALL |
| `h2h_matches` | Historique matchs avec goal_events | SELECT |
| `team_seasons` | Stats equipes par saison | SELECT |
| `seed_jobs` | Suivi progression seed | SELECT |
| `team_fhg_cache` | FHG% 0-45 min par (season_id, team_id) | SELECT |

---

## Securite

- **Auth Supabase** : email solo, sign ups desactives, guard SvelteKit sur routes admin
- **Headers securite** : injectes via `src/hooks.server.js` (CSP, HSTS, X-Frame-Options…)
- **Proxy API** : cle FootyStats jamais exposee au browser
- **FUNCTIONS_AUTH_TOKEN** : protege les boutons de generation/seed en prod

---

## Developpement

```bash
npm install
npm run dev
npm test          # vitest — 331 tests unitaires
npm run test:watch
```

### Variables d'environnement (Netlify)

| Variable | Contexte | Usage |
|----------|----------|-------|
| `VITE_SUPABASE_URL` | Frontend | URL Supabase |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Cle anon Supabase |
| `FOOTYSTATS_API_KEY` | Serveur | Cle API FootyStats |
| `SUPABASE_URL` | Serveur | URL Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Serveur | Cle service_role (bypass RLS) |
| `SEED_AUTH_TOKEN` | Serveur | Token auth pour seed-data |
| `FUNCTIONS_AUTH_TOKEN` | Serveur | Token auth pour generate/check en prod |
| `VITE_FUNCTIONS_AUTH_TOKEN` | Frontend | Meme valeur, envoye par debug page |

### Structure cle

```
netlify/functions/
  lib/api.js           # helpers partages (footyRequest, supabaseQuery)
  lib/analysis.cjs     # logique FHG streak v2 (server-side CJS)
  lib/lg2.cjs          # logique LG2 streak (server-side CJS)
src/lib/
  core/scoring.js      # logique FHG streak v2 (client-side ESM, miroir analysis.cjs)
  core/lg2.js          # logique LG2 streak (client-side ESM, miroir lg2.cjs)
  utils/formatters.js  # formatDate, formatTime, isInPlay, etc.
  utils/teamData.js    # loadTeamMatches, computeTeamStats, goalBar
  stores/appStore.js   # stores Svelte + persistence localStorage
  stores/selectionStore.js # selections FHG/LG2 (localStorage)
  stores/tradeStore.js # CRUD trades (Supabase)
```
