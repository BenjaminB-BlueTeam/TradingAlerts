# FHG Tracker

Application de **trading sportif football** qui identifie les matchs avec fort potentiel de but en fin de 1re mi-temps (fenetre 31-45 min, FHG = First Half Goal) et les opportunites Double Chance (DC).

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
| Tests | Vitest (80 tests unitaires) |

## Fonctionnalites

### Alertes autonomes
- Generation automatique toutes les 12h (`generate-alerts.js`) pour J, J+1, J+2
- Tags **FHG**, **DC**, ou **FHG+DC** avec confiance fort/moyen
- Verification auto des resultats toutes les heures (`check-results.js`)
- Validation FHG basee sur les buts dans la fenetre 31-45 min (goal_events)
- Cleanup automatique des alertes pending > 48h (status `expired`)

### Dashboard (`/`)
- KPIs en temps reel : alertes FHG, DC, validees, en attente
- Alertes du jour et a venir depuis Supabase

### Selection FHG (`/alerts`)
- Alertes FHG/FHG+DC avec filtres par jour
- Expand detaille : 15 derniers matchs dom/ext par equipe
- Barres de timing buts (minutes exactes), curseur interactif
- Stats resume : 1MT%, AVG buts
- Badges Valide/Perdu/EN COURS

### Selection DC (`/selection-dc`)
- Alertes DC/FHG+DC avec filtres par jour
- Expand H2H : 10 derniers matchs W/D/L
- % defaite colore, badges confiance

### Historique (`/historique`)
- Stats globales (Global/FHG/DC/fort/moyen)
- Tableau par ligue trie
- Liste filtree des alertes (90 derniers jours, bouton "Charger plus")

### Matchs a venir (`/matches`)
- Matchs par date avec filtre par ligue
- Cards avec expand (meme schema que Selection FHG)

### Autres pages
- **Classements ligues** (`/explore`) — par pays, stats, classements
- **Ligues actives** (`/leagues`) — 50 ligues, toggle actif/inactif
- **Parametres** (`/settings`) — journal trades, bankroll
- **Configuration** (`/config`) — config algo (Admin)
- **Debug** (`/debug`) — tests API/Supabase, seed, testeur API brut

---

## Algorithme FHG — Analyse comportementale

Analyse de **recurrence individuelle par equipe** dans son contexte (domicile ou exterieur).

| Critere | Description | Poids |
|---------|-------------|-------|
| **pct1MT** | % matchs ou l'equipe marque en 1MT | 50% |
| **pctAdversaire** | % matchs ou l'adversaire encaisse en 1MT | 25% |
| **pct2Plus1MT** | % matchs avec 2+ buts marques en 1MT | 15% |
| **pctReaction** | L'equipe repond-elle en 1MT si menee ? | 10% |

**Filtres** : min 5 matchs, clean sheet H2H (chat noir), adversaire trop solide (< 2/5 encaisse)

**Seuils** : Fort >= 80% | Moyen >= 70%

**Validation** : buts entre 31-45 min (via `goal_events`)

## Algorithme DC — Analyse H2H

Basee sur les confrontations directes (5 saisons, min 5 H2H).

**Seuils** : Fort <= 20% defaite | Moyen <= 30%

**Validation** : le cote recommande n'a pas perdu (victoire ou nul)

---

## Architecture

```
[Browser SPA — Svelte 5 runes]
    |
    +-- /.netlify/functions/footystats  --> [FootyStats API] (proxy, whitelist, CORS restreint)
    +-- Supabase JS client (anon, RLS) --> [Supabase PostgreSQL]
    |
[Netlify Scheduled Functions (service_role)]
    +-- generate-alerts.js  (cron 12h) --> FootyStats + Supabase
    +-- check-results.js    (cron 1h)  --> FootyStats + Supabase
    +-- seed-data.js        (manuel)   --> FootyStats + Supabase
    +-- daily-seed.js       (cron 6h)  --> FootyStats + Supabase (matchs d'hier)
```

### Tables Supabase (RLS actif)

| Table | Role | anon |
|-------|------|------|
| `alerts` | Alertes FHG/DC (pending/validated/lost/expired) | SELECT |
| `trades` | Journal des trades | ALL |
| `h2h_matches` | 70 000+ matchs H2H avec goal_events | SELECT |
| `team_seasons` | Stats equipes par saison | SELECT |
| `seed_jobs` | Suivi progression seed | SELECT |

---

## Developpement

```bash
npm install
npm run dev
npm test          # vitest — 139 tests unitaires
npm run test:watch
```

### Variables d'environnement (Netlify)

| Variable | Usage |
|----------|-------|
| `FOOTYSTATS_API_KEY` | Cle API FootyStats |
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Cle service_role (bypass RLS, serveur uniquement) |
| `SEED_AUTH_TOKEN` | Token auth pour seed-data (optionnel) |

### Seed

- **Initial** : aller sur `/debug` → "Seed complet" (50 ligues x 5 saisons, ~15 min)
- **Auto** : `daily-seed.js` tourne chaque jour a 6h UTC et insere les matchs d'hier

### Structure cle

```
netlify/functions/
  lib/api.js          # helpers partages (footyRequest, supabaseQuery)
  lib/analysis.cjs    # logique FHG/DC extraite et testable
src/lib/
  utils/formatters.js # formatDate, formatTime, isInPlay, etc.
  utils/teamData.js   # loadTeamMatches, computeTeamStats, goalBar
  stores/appStore.js  # stores Svelte + persistence localStorage
  stores/tradeStore.js# CRUD trades (Supabase)
  stores/tradeStats.js# calcul stats trades
```
