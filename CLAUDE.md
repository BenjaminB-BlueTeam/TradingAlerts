# CLAUDE.md — FHG Tracker

Fichier chargé automatiquement par Claude à chaque session. Contient tout le contexte nécessaire pour continuer le projet sans répéter le briefing.

---

## Projet

App **SvelteKit** de **trading sportif football**. Identifie les matchs avec fort potentiel de but entre la **31e et 45e minute** (FHG = First Half Goal).

- **Repo GitHub** : BenjaminB-BlueTeam/TradingAlerts
- **Déploiement** : Netlify → https://tradingfootalerts.netlify.app/
- **Utilisateur** : Benjamin — usage solo, francophone

---

## Stack technique

| Couche | Tech |
|--------|------|
| Frontend | SvelteKit 2 + Svelte 5 runes (SPA, ssr: false) |
| Build | Vite 6 |
| Déploiement | Netlify (adapter-netlify) + Netlify Functions |
| Données | API FootyStats (`football-data-api.com`) via proxy Netlify sécurisé |
| Persistance | Supabase (PostgreSQL) — alerts, trades, team_seasons, h2h_matches, seed_jobs |
| Charts | Chart.js 4.4 (tree-shaké, imports sélectifs) |
| Tests | Vitest (139 tests) |

### Variables d'environnement

| Variable | Contexte | Usage |
|----------|----------|-------|
| `VITE_SUPABASE_URL` | Frontend | URL Supabase (exposé au browser) |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Clé anon Supabase (exposé au browser) |
| `SUPABASE_URL` | Serveur (Netlify Functions) | URL Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Serveur | Clé service_role (bypass RLS) |
| `FOOTYSTATS_API_KEY` | Serveur | Clé API FootyStats (jamais côté browser) |
| `SEED_AUTH_TOKEN` | Serveur | Token auth pour seed-data.js |

---

## Architecture des fichiers

```
package.json / svelte.config.js / vite.config.js
netlify.toml
netlify/functions/
  footystats.js         ← proxy sécurisé API FootyStats (whitelist endpoints, CORS restreint)
  generate-alerts.js    ← cron 12h — génère alertes FHG/DC pour J, J+1, J+2
  check-results.js      ← cron 1h — vérifie résultats matchs pending terminés (fenêtre 31-45 min)
  seed-data.js          ← seed Supabase (team_seasons, h2h_matches) (auth token requis)
  daily-seed.js         ← cron quotidien 6h UTC — seed matchs d'hier dans h2h_matches
  lib/
    api.js              ← helpers partagés (footyRequest, supabaseQuery)
    analysis.cjs        ← logique FHG/DC extraite et testable (server-side)
    analysis.test.js    ← tests unitaires analyse FHG/DC (19 tests)
    parseMatch.js       ← parseMatchRow partagé (daily-seed + seed-data)
src/
  app.css               ← styles globaux (variables CSS, badges, goal-bar, responsive)
  app.html              ← template HTML
  routes/
    +layout.svelte      ← layout global (Sidebar, Toast, init)
    +layout.js          ← ssr: false, prerender: false
    +page.svelte        ← Dashboard KPIs + alertes du jour (Supabase)
    alerts/+page.svelte       ← Sélection FHG — alertes FHG depuis Supabase
    selection-dc/+page.svelte ← Sélection DC — alertes DC depuis Supabase
    historique/+page.svelte   ← Historique alertes + stats performance (KPI, ligues, filtres)
    matches/+page.svelte      ← Matchs à venir (cards avec expand)
    leagues/+page.svelte      ← Ligues actives (toggle, stats)
    explore/+page.svelte      ← Explorer toutes les ligues (par pays, stats, classement)
    config/+page.svelte       ← Configuration algo (section Admin)
    settings/+page.svelte     ← Paramètres, journal trades, bankroll
    debug/+page.svelte        ← Debug (test API/Supabase, seed, testeur API brut)
  lib/
    api/
      footystats.js     ← appels API via proxy, cache TTL, normalizeLeagues
      cache.js          ← cache localStorage TTL par endpoint
      cache.test.js     ← tests unitaires cache (20 tests)
      supabase.js       ← client Supabase + CRUD trades + helpers debug
      seedClient.js     ← client seed (orchestre seed ligue par ligue)
    components/
      Sidebar.svelte    ← navigation (section principale + section Admin)
      MatchCard.svelte  ← carte match (résumé + détail dépliable)
      GoalTimeline.svelte← barre timing buts H2H
      Toast.svelte      ← notifications toast
      Modal.svelte      ← modale globale
      charts.js         ← graphiques Chart.js (tree-shaké)
      settings/
        ApiTest.svelte    ← test connexion API
        TradeJournal.svelte← journal des trades
        TradeStats.svelte ← stats personnelles
        BankrollCalc.svelte← calcul bankroll
        DangerZone.svelte ← zone danger (reset)
    stores/
      appStore.js       ← stores Svelte (config, leagues, prefs, persistence localStorage)
      tradeStore.js     ← CRUD trades (Supabase + localStorage)
      tradeStore.test.js← tests unitaires tradeStore (14 tests)
      tradeStats.js     ← calcul stats trades (fonction pure)
    core/
      scoring.js        ← algorithme FHG (% bruts) + DC (client-side)
      scoring.test.js   ← tests unitaires scoring (29 tests)
      h2h.js            ← analyse head-to-head
      h2h.test.js       ← tests unitaires h2h (21 tests)
      filters.js        ← isWindowActive (fenêtre 31-45 min)
    utils/
      formatters.js     ← fonctions partagées (formatDate, formatTime, isInPlay, etc.)
      formatters.test.js← tests unitaires formatters (22 tests)
      teamData.js       ← fonctions partagées (loadTeamMatches, computeTeamStats, goalBar)
      teamData.test.js  ← tests unitaires teamData (14 tests)
      leagueHelpers.js  ← fonctions partagées leagues/explore (stats, expand, couleurs)
    data.js             ← initApp (test connexion API)
```

---

## Endpoints API FootyStats (vrais noms)

| Endpoint | Param clé | Usage |
|----------|-----------|-------|
| `league-list` | `chosen_leagues_only=true` | Liste des 50 ligues choisies |
| `league-teams` | `season_id`, `include=stats` | Équipes + stats d'une saison |
| `league-matches` | `season_id` | Tous les matchs d'une saison |
| `league-tables` | `season_id` | Classement (data.data.league_table) |
| `league-season` | `season_id` | Stats agrégées ligue (FHG%, BTTS, O2.5...) |
| `todays-matches` | `date` | Matchs du jour |
| `match` | `match_id` | Détail d'un match |
| `team` | `team_id` | Stats d'une équipe |
| `lastx` | `team_id` | Last 5/6/10 matchs |
| `country-list` | — | Liste des pays |

> **Important** : `league-list` retourne une structure imbriquée `{ name, country, season: [{id, year}] }`. Le `season[].id` = `season_id` à passer aux autres endpoints. Utiliser `normalizeLeagues()` pour aplatir.

---

## Tables Supabase

| Table | Rôle | RLS | Policies anon | Policies service_role |
|-------|------|-----|---------------|----------------------|
| `alerts` | Alertes FHG/DC (status: pending/validated/lost/expired) | ON | SELECT | ALL |
| `trades` | Journal des trades | ON | ALL | ALL |
| `h2h_matches` | Historique matchs H2H avec goal_events | ON | SELECT, INSERT, UPDATE | ALL |
| `team_seasons` | Stats équipes par saison (3 ans, buts/min) | ON | SELECT | ALL |
| `seed_jobs` | Suivi progression seed | ON | SELECT, INSERT, UPDATE | ALL |

---

## Algorithme FHG

### Client-side (`scoring.js` — utilisé par MatchCard sur /matches)

% bruts calculés par équipe (domicile ET extérieur, meilleur retenu) :

1. **Filtre H2H Clean Sheet** (exclusion totale) — si >=3 H2H et 0 but avant 45min
2. **Filtre adversaire** — l'adversaire doit encaisser en 1MT dans >=2 de ses 5 derniers matchs
3. **Score composite** (moyenne pondérée) :
   - `pct1MT` — % matchs où l'équipe marque en 1MT (poids **50%**)
   - `pctAdversaire` — % matchs où l'adversaire encaisse en 1MT (poids **25%**)
   - `pct2Plus1MT` — % matchs avec 2+ buts en 1MT (poids **15%**)
   - `pctReaction` — réaction quand menée en 1MT (poids **10%**)
4. Si `pctReaction` indisponible, redistribution : pct1MT 55%, pctAdversaire 28%, pct2Plus1MT 17%

**Seuils** : Fort >=80% | Moyen >=70%

### Server-side (`analysis.cjs` — utilisé par generate-alerts.js cron)

Même formule composite avec les mêmes poids (50/25/15/10), mais :
- Utilise `goal_events` filtré fenêtre **31-45 min** (minutes exactes depuis Supabase)
- Analyse DC séparée via H2H : `analyzeDCFromH2H` — % défaite <= 20% (fort) ou <= 30% (moyen), min 5 H2H

---

## Ce qui est implémenté

- **Système d'alertes autonome** — `generate-alerts.js` (cron 12h) + `analysis.cjs` : FHG (récurrence 1MT, 2+ buts 1MT, réaction, clean sheet H2H, filtre adversaire) + DC (H2H % défaite), tags FHG/DC/FHG+DC, confiance fort/moyen, table Supabase `alerts`
- **Vérification auto résultats** — `check-results.js` (cron 1h) : FHG sur buts 31-45 min via goal_events, DC sur résultat final, statut -> validated/lost/expired (cleanup 48h)
- **Daily seed auto** — `daily-seed.js` (cron 6h UTC) : seed matchs d'hier dans `h2h_matches`
- **Dashboard** (`/`) — KPIs + alertes du jour/a venir depuis Supabase
- **Selection FHG** (`/alerts`) — alertes FHG/FHG+DC, filtres par jour, expand detaille par equipe (15 derniers matchs dom/ext), barres timing buts avec ballons PNG, curseur interactif, scores colores, stats resume (1MT%, AVG), badges Valide/Perdu/EN COURS
- **Selection DC** (`/selection-dc`) — alertes DC/FHG+DC, filtres par jour, expand H2H (10 derniers matchs W/D/L), % defaite colore, badges confiance
- **Historique** (`/historique`) — stats globales (Global/FHG/DC/fort/moyen), tableau par ligue trie, liste filtree paginee (90 jours + bouton "Charger plus")
- **Matchs a venir** (`/matches`) — cards cliquables avec expand, barres timing buts, curseur interactif
- **Ligues actives** (`/leagues`) — 50 ligues, toggle, tout selectionner/deselectionner
- **Classements ligues** (`/explore`) — par pays, stats, classements
- **Parametres** (`/settings`) — 5 sous-composants (ApiTest, TradeJournal, TradeStats, BankrollCalc, DangerZone)
- **Config** (`/config`) — configuration algo (section Admin)
- **Debug** (`/debug`) — test API/Supabase, seed complet (50 ligues x 5 saisons), testeur API brut
- **Proxy Netlify securise** — whitelist endpoints, CORS restreint
- **Cache localStorage TTL** — eviction auto par endpoint
- **Compteur API** — req restantes affiche dans la sidebar
- **Svelte 5 runes** — migration complete : `$state`, `$derived`, `$effect`, `$props()`, `onclick` natif
- **Accessibilite** — keyboard handlers, `aria-pressed`/`aria-expanded`, `.sr-only`, skip-to-content, `<h1>` sur toutes les pages, contraste WCAG
- **Supabase RLS active** — policies read-only anon, service_role pour les Netlify Functions
- **Tests unitaires** — Vitest, 139 tests (scoring 29, h2h 21, cache 20, analysis 19, formatters 22, teamData 14, tradeStore 14)
- **CSS centralise** — badges, goal-bar, team-detail, match-row dans `app.css`
- **Fetch timeouts** — 8s sur tous les appels reseau (fonctions Netlify)
- **Parallelisation queries** — `generate-alerts.js` traite les matchs par batch de 5

---

## Roadmap — prochaines etapes

- [ ] Adapter `renderGoalTimeline` aux vrais champs FootyStats API
- [ ] Tests pour `tradeStats.js`

---

## Decisions actees

1. FHG = analyse comportementale par equipe (pas H2H), dom/ext separes
2. DC analysee independamment du FHG, basee H2H uniquement
3. Verification FHG a la MT (pas a la volee — VAR)
4. Terminologie : Valide / Perdu
5. Seuil adversaire encaisse : 2/5 minimum
6. Pas de mode demo — donnees reelles uniquement
7. Pas de cotes/stakes/profits dans l'app
8. Pas de bouton "Analyse IA" — Benjamin fait sa propre analyse
9. Cle anon sans fallback hardcode

---

## Conventions de developpement

- **Svelte 5 runes** — `$state`, `$derived`, `$effect`, `$props()` (pas de `$:` ni `export let`)
- **SvelteKit** — composants .svelte, stores Svelte, routing fichier
- **Pas de modification du store global** sans verifier les subscribers existants
- **Toute nouvelle feature** : legere, compatible Netlify static + Supabase
- **CSS** : utiliser les variables CSS existantes (`--color-*`, `--radius-*`, etc.)
- **Donnees** : H2H et alertes depuis Supabase, matchs du jour/live depuis API FootyStats
- **Cle API** : ne jamais l'exposer cote browser — toujours passer par `/.netlify/functions/footystats`
- **Push auto** : commit + push automatique sans demander confirmation
- **Tests** : `npm test` (vitest) avant de pusher les changements sur la logique metier
- **Utilitaires partages** : utiliser `$lib/utils/formatters.js` et `$lib/utils/teamData.js` au lieu de dupliquer
- **Helpers serverless** : utiliser `netlify/functions/lib/api.js` pour `footyRequest`/`supabaseQuery`

## Conventions git

- Commit directement sur `main` pour les features solo
- Toujours pusher `CLAUDE.md` a jour apres une session de travail
- Push + merge autonome autorise si Benjamin le demande explicitement
