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
| Persistance | Supabase (PostgreSQL) — trades, team_seasons, h2h_matches, seed_jobs |
| Charts | Chart.js 4.4 |
| Clé API | `FOOTYSTATS_API_KEY` en variable d'env Netlify (jamais côté browser) |
| Supabase (serveur) | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` en env vars Netlify (RLS bypass) |
| Tests | Vitest |

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
  lib/
    api.js              ← helpers partagés (footyRequest, supabaseQuery)
    analysis.cjs        ← logique FHG/DC extraite et testable
    analysis.test.js    ← tests unitaires analyse FHG/DC (31 tests)
src/
  app.css               ← styles globaux (variables CSS, composants, responsive)
  app.html              ← template HTML
  routes/
    +layout.svelte      ← layout global (Sidebar, Toast, init)
    +layout.js           ← ssr: false, prerender: false
    +page.svelte         ← Dashboard KPIs + alertes du jour (Supabase)
    alerts/+page.svelte       ← Sélection FHG — alertes FHG depuis Supabase
    selection-dc/+page.svelte ← Sélection DC — alertes DC depuis Supabase
    historique/+page.svelte   ← Historique alertes + stats performance (KPI, ligues, filtres)
    matches/+page.svelte      ← Matchs à venir (table)
    leagues/+page.svelte      ← Ligues actives (toggle, stats, classement)
    explore/+page.svelte      ← Explorer toutes les ligues (par pays, stats, classement)
    config/+page.svelte  ← Configuration algo (profil, seuils, trades)
    settings/+page.svelte← Paramètres, journal trades, bankroll
    debug/+page.svelte   ← Debug (test API/Supabase, seed, testeur API brut)
  lib/
    api/
      footystats.js     ← appels API via proxy, cache TTL, normalizeLeagues
      cache.js          ← cache localStorage TTL par endpoint
      supabase.js       ← client Supabase + CRUD trades + helpers debug
      seedClient.js     ← client seed (orchestre seed ligue par ligue)
    components/
      Sidebar.svelte    ← navigation (section principale + section Admin)
      MatchCard.svelte  ← carte match (résumé + détail dépliable)
      GoalTimeline.svelte← barre timing buts H2H
      Toast.svelte      ← notifications toast
      Modal.svelte      ← modale globale
      charts.js         ← graphiques Chart.js
    stores/
      appStore.js       ← stores Svelte (config, leagues, prefs, persistence localStorage)
      tradeStore.js     ← CRUD trades (Supabase + localStorage)
      tradeStats.js     ← calcul stats trades (fonction pure)
    core/
      scoring.js        ← algorithme FHG + DC
      scoring.test.js   ← tests unitaires scoring
      doubleChance.js   ← analyse DC basée H2H (% défaite, comeback, MT≠FT)
      h2h.js            ← analyse head-to-head
      filters.js        ← filtrage/tri des signaux
    utils/
      formatters.js     ← fonctions partagées (formatDate, formatTime, isInPlay, etc.)
      formatters.test.js← tests unitaires formatters
      teamData.js       ← fonctions partagées (loadTeamMatches, computeTeamStats, goalBar)
      teamData.test.js  ← tests unitaires teamData
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

| Table | Rôle | RLS | anon |
|-------|------|-----|------|
| `alerts` | Alertes FHG/DC (status: pending/validated/lost/expired) | ON | SELECT |
| `trades` | Journal des trades | ON | ALL |
| `team_seasons` | Stats équipes par saison (3 ans, buts/min) | ON | SELECT |
| `h2h_matches` | Historique matchs H2H avec goal_events | ON | SELECT |
| `seed_jobs` | Suivi progression seed | ON | SELECT |

---

## Algorithme FHG actuel (scoring.js)

Score 0-100 calculé par équipe (domicile ET extérieur, meilleur retenu) :

1. **Filtre H2H Clean Sheet** (priorité absolue) — si ≥3 H2H et 0 but avant 45min → exclusion totale
2. **Score de base** : 60% × taux N + 25% × taux N-1 + 15% × forme 5 derniers matchs
3. **Bonus 1MT** : +4 pts (≥50%) ou +8 pts (≥65%) si l'équipe score souvent en 1MT
4. **Stabilité inter-saisons** : +3 pts si écart ≤8%, -5 pts si >15%
5. **Malus début de saison** : -10 pts si <8 matchs joués

**Seuils** : Fort ≥75 | Moyen ≥60 | Faible <60

> ⚠ Ce système de scoring est **prévu pour être remplacé** par des % bruts — voir roadmap.

---

## Ce qui est implémenté (état 2026-04-22)

- **Système d'alertes autonome** — `generate-alerts.js` (Netlify Scheduled Function, cron 12h) + `lib/analysis.cjs`
  - FHG : analyse comportementale par équipe (récurrence 1MT, 2+ buts 1MT, réaction quand menée, clean sheet H2H, filtre adversaire encaisse 2/5)
  - DC : analyse H2H (% défaite ≤ 20-30%, min 5 H2H)
  - Tags FHG / DC / FHG+DC, confiance fort/moyen
  - Table Supabase `alerts` (match_id unique, status pending/validated/lost)
- **Vérification auto résultats** — `check-results.js` (cron 1h) : récupère les matchs `pending` terminés, évalue FHG (buts 31-45 min via goal_events) et DC (résultat final), met à jour `status` → `validated`/`lost`/`expired` (cleanup 48h)
- **Page Sélection FHG** (`/alerts`) — alertes FHG/FHG+DC depuis Supabase, filtres par jour, expand détaillé par équipe (15 derniers matchs dom/ext), barre de timing buts avec ballons PNG, scores colorés, stats résumé (1MT%, AVG, BTTS%, O2.5%), badges Validé/Perdu/EN COURS
- **Page Sélection DC** (`/selection-dc`) — alertes DC/FHG+DC depuis Supabase, filtres par jour, expand H2H (10 derniers matchs W/D/L), % défaite coloré, badges confiance fort/moyen
- **Page Matchs à venir** (`/matches`) — fetch API par date, filtres réactifs (date + ligue), exclut matchs commencés
- **Page Ligues actives** (`/leagues`) — 50 ligues, toggle, tout sélectionner/désélectionner, stats
- **Page Classements ligues** (`/explore`) — par pays, stats, classements
- **Page Configuration** (`/config`) — ancienne page config algo (section Admin)
- **Page Debug** (`/debug`) — test API/Supabase, seed complet (50 ligues × 5 saisons), testeur API brut
- **BDD Supabase** — 70 778 matchs seedés avec goal_events (minutes exactes), 5 tables
- **Seed** — Netlify Function fetch + client insert REST API Supabase, batch 200
- **Compteur API** — req restantes affiché dans la sidebar en temps réel
- **Mode démo supprimé** — toutes les données viennent de l'API/Supabase (store isDemo + banner nettoyés)
- **Page Historique** (`/historique`) — stats globales (Global/FHG/DC/fort/moyen), tableau par ligue trié, liste filtrée de toutes les alertes (Tous/FHG/DC/Validé/Perdu/En cours)
- **Sidebar** — Dashboard, Sélection FHG, Sélection DC, Historique, Matchs à venir, Classements ligues, Paramètres + Admin (Ligues, Config, Debug)
- **Page Live supprimée** — les statuts EN COURS sont affichés directement sur les pages Sélection FHG, DC et Historique
- **Paramètres / Config ligues** — charge les 50 ligues depuis l'API (plus hardcodé), boutons Tout activer / Tout désactiver
- **Matchs à venir** — table remplacée par cards cliquables avec expand : 15 derniers matchs dom/ext de chaque équipe, barres de timing buts (même schéma que Sélection FHG), curseur interactif (ligne verticale + minute dans header), "vs" → "-", colonne score supprimée
- **Barres de timing buts** (Sélection FHG + Matchs à venir) — curseur souris : ligne noire sur toutes les barres du bloc, minute affichée dans le header à côté du nom d'équipe. Colonne total buts supprimée. Stats résumé : 1MT% + AVG uniquement (BTTS/O2.5 retirés)
- Proxy Netlify sécurisé (whitelist endpoints, CORS restreint), cache localStorage TTL + éviction auto
- **Tests unitaires** — vitest, 80 tests (scoring, DC/FHG analysis, formatters, teamData)
- **Code dédupliqué** — utilitaires partagés `$lib/utils/` (formatters.js, teamData.js), helpers serverless `lib/api.js`
- **Chart.js tree-shaké** — imports sélectifs au lieu de `chart.js/auto`
- **Fetch timeouts** — 8s sur tous les appels réseau (fonctions Netlify)
- **Logging** — console.log structuré dans les 4 fonctions Netlify
- **Dashboard unifié** — KPIs + alertes du jour/à venir depuis Supabase (ancien scoring pipeline supprimé)
- **Svelte 5 runes** — migration complète : `$state`, `$derived`, `$effect`, `$props()` sur 16 fichiers
- **Accessibilité** — keyboard handlers (`on:keydown`), `aria-pressed`/`aria-expanded`, `.sr-only`
- **appStore splitté** — `tradeStore.js` (CRUD), `tradeStats.js` (calculs), `appStore.js` (stores + persistence)
- **Supabase RLS activé** — policies read-only anon, service_role pour les Netlify Functions
- **Gestion d'erreurs** — messages utilisateur sur toutes les pages (plus de catch vides)
- **Parallélisation queries** — `generate-alerts.js` traite les matchs par batch de 5 avec `Promise.all`

---

## Roadmap — prochaines étapes

### Priorité haute
- [x] **Vérification auto résultats** — `check-results.js` cron 1h, FHG sur buts MT, DC sur résultat final
- [x] **Page Historique des Alertes** — `/historique` avec KPIs, tableau ligues, liste filtrée
- [x] **Affiner FHG fenêtre 31-45 min** — `generate-alerts.js` utilise `goal_events` filtré min 31-45 au lieu de `home_goals_ht`

### Priorité moyenne
- [ ] Refonte algo — % bruts sans scoring 0-100 (scoring.js encore utilisé par MatchCard)
- [ ] Bouton "Analyse IA" (Claude API, résultat mis en cache Supabase)

### Priorité basse
- [ ] Adapter `renderGoalTimeline` aux vrais champs FootyStats API
- [ ] Seed auto de la saison en cours (mise à jour quotidienne)

### Décisions actées
1. FHG = analyse comportementale par équipe (pas H2H), dom/ext séparés
2. DC analysée indépendamment du FHG, basée H2H uniquement
3. Vérification FHG à la MT (pas à la volée — VAR)
4. Terminologie : Validé / Perdu
5. Seuil adversaire encaisse : 2/5 minimum
6. Pas de mode démo — données réelles uniquement
7. Pas de cotes/stakes/profits dans l'app

---

## Conventions de développement

- **Svelte 5 runes** — `$state`, `$derived`, `$effect`, `$props()` (pas de `$:` ni `export let`)
- **SvelteKit** — composants .svelte, stores Svelte, routing fichier
- **Pas de modification du store global** sans vérifier les subscribers existants
- **Toute nouvelle feature** : légère, compatible Netlify static + Supabase
- **CSS** : utiliser les variables CSS existantes (`--color-*`, `--radius-*`, etc.)
- **Données** : H2H et alertes depuis Supabase, matchs du jour/live depuis API FootyStats
- **Clé API** : ne jamais l'exposer côté browser — toujours passer par `/.netlify/functions/footystats`
- **Push auto** : commit + push automatique sans demander confirmation
- **Tests** : `npm test` (vitest) avant de pusher les changements sur la logique métier
- **Utilitaires partagés** : utiliser `$lib/utils/formatters.js` et `$lib/utils/teamData.js` au lieu de dupliquer
- **Helpers serverless** : utiliser `netlify/functions/lib/api.js` pour `footyRequest`/`supabaseQuery`

## Conventions git

- Commit directement sur `main` pour les features solo
- Toujours pusher `CLAUDE.md` à jour après une session de travail
- Push + merge autonome autorisé si Benjamin le demande explicitement
