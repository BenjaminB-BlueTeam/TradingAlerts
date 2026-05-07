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
| Persistance | Supabase (PostgreSQL) — alerts, trades, team_seasons, h2h_matches, seed_jobs, team_fhg_cache, teams, selected_alerts, alert_trades |
| Charts | Chart.js 4.4 (tree-shaké, imports sélectifs) |
| Tests | Vitest (331 tests) |

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
  generate-alerts.js    ← cron 12h — génère alertes FHG/LG2 pour J, J+1, J+2
  check-results.js      ← cron 1h — vérifie résultats matchs pending terminés (fenêtre 31-45 min)
  delete-alerts.js      ← suppression d'alertes par IDs (auth requise)
  seed-data.js          ← seed Supabase (team_seasons, h2h_matches) (auth token requis)
  daily-seed.js         ← cron quotidien 6h UTC — seed matchs d'hier dans h2h_matches
  compute-team-fhg.js  ← cron quotidien 7h UTC — calcule FHG% 0-45 min (goal_events) par (season_id, team_id), upsert team_fhg_cache
  lib/
    api.js              ← helpers partagés (footyRequest, supabaseQuery)
    auth.cjs            ← requireAuth (FUNCTIONS_AUTH_TOKEN + bypass scheduled)
    auth.test.js        ← tests unitaires auth
    cors.cjs            ← corsHeaders (CORS restreint + dev localhost)
    analysis.cjs        ← logique FHG streak v2 (server-side CJS)
    analysis.test.js    ← tests unitaires streak (162 tests)
    lg2.cjs             ← logique LG2 streak (but >= 80') — server-side CJS
    lg2.test.js         ← tests unitaires LG2 server (27 tests)
    parseMatch.js       ← parseMatchRow partagé (daily-seed + seed-data)
src/
  app.css               ← styles globaux (variables CSS, badges, goal-bar, responsive)
  app.html              ← template HTML
  hooks.server.js       ← headers sécurité HTTP (CSP, HSTS, X-Frame-Options, etc.)
  routes/
    +layout.svelte      ← layout global (Sidebar, Toast, init, guard auth)
    +layout.js          ← ssr: false, prerender: false
    +page.svelte        ← Dashboard 12 KPIs en 4 sections (Supabase)
    login/+page.svelte        ← formulaire email/password Supabase Auth
    alerts/+page.svelte       ← Sélection FHG — alertes FHG depuis Supabase
    alerts-lg2/+page.svelte   ← Sélection LG2 — alertes LG2 depuis Supabase
    mes-matchs/+page.svelte   ← Mes matchs sélectionnés + saisie positions (cote/mise) + résultat manuel
    historique/+page.svelte   ← Historique alertes + stats performance + "Bet Analytix"
    matches/+page.svelte      ← Matchs à venir (cards avec expand)
    leagues/+page.svelte      ← Ligues actives (toggle, stats)
    explore/+page.svelte      ← Explorer toutes les ligues (par pays, stats, classement)
    config/+page.svelte       ← Configuration algo (section Admin)
    debug/+page.svelte        ← Debug (test API/Supabase, seed, testeur API brut)
  lib/
    api/
      footystats.js     ← appels API via proxy, cache TTL, normalizeLeagues
      cache.js          ← cache localStorage TTL par endpoint
      cache.test.js     ← tests unitaires cache (20 tests)
      functions.js      ← appels aux Netlify Functions (generate, check, seed, delete)
      supabase.js       ← client Supabase + CRUD alert_trades + helpers auth
      supabase.auth.test.js ← tests unitaires supabase auth helpers
      seedClient.js     ← client seed (orchestre seed ligue par ligue)
    components/
      Sidebar.svelte        ← navigation (section principale + section Admin)
      MatchCard.svelte      ← carte match (résumé + détail dépliable)
      GoalTimeline.svelte   ← barre timing buts H2H
      Toast.svelte          ← notifications toast
      Modal.svelte          ← modale globale
      SelectAlertButton.svelte ← bouton toggle sélection alerte (selectionStore)
      ExcludeAlertModal.svelte ← modale exclusion manuelle (7 tags + note)
      charts.js             ← graphiques Chart.js (tree-shaké) + helpers line/stacked/horizontal
      historique/
        FiltersBar.svelte         ← bloc filtres multi-critères + toggle scope (Global/Mes positions)
        ScopeToggle.svelte        ← toggle Global vs Mes positions
        SectionGlobal.svelte      ← section stats globales (graphiques + tableau)
        SectionMesPositions.svelte← section mes positions (alert_trades + P&L)
        ChartEvolution.svelte     ← courbes taux dans le temps (hybride 1 ou 3 courbes)
        ChartStackedStrategy.svelte ← barres empilées validés/perdus par stratégie
        ChartTopTeams.svelte      ← top 10 équipes par taux
        ChartTopLeagues.svelte    ← top 10 ligues par taux
        MatchesTable.svelte       ← tableau dense triable + expand goal-bar
        TradesVsGlobal.svelte     ← bloc "Mes trades vs Global" (collapsible)
        WhatIfExclusions.svelte   ← bloc what-if exclusions avec Wilson CI
    stores/
      appStore.js       ← stores Svelte (config, leagues, prefs, persistence localStorage)
      selectionStore.js ← sélections FHG/LG2 (localStorage, Set de clés matchId:signalType)
      selectionStore.test.js ← tests unitaires selectionStore
      tradeStore.js     ← CRUD trades (Supabase + localStorage)
      tradeStore.test.js← tests unitaires tradeStore (14 tests)
      tradeStats.js     ← calcul stats trades (fonction pure)
      tradeStats.test.js← tests unitaires tradeStats
    core/
      scoring.js        ← algorithme FHG streak v2 (client-side ESM, miroir de analysis.cjs)
      scoring.test.js   ← tests unitaires streak (44 tests)
      lg2.js            ← algorithme LG2 streak (client-side ESM, miroir de lg2.cjs)
      lg2.test.js       ← tests unitaires LG2 client (17 tests)
      h2h.js            ← analyse head-to-head
      h2h.test.js       ← tests unitaires h2h
      filters.js        ← isWindowActive (fenêtre 31-45 min)
    utils/
      formatters.js     ← fonctions partagées (formatDate, formatTime, isInPlay, etc.)
      formatters.test.js← tests unitaires formatters (22 tests)
      teamData.js       ← fonctions partagées (loadTeamMatches, computeTeamStats, goalBar)
      teamData.test.js  ← tests unitaires teamData (14 tests)
      leagueHelpers.js  ← fonctions partagées leagues/explore (stats, expand, couleurs)
      historyFilters.js ← filtrage AND strict + 4 agrégations pour /historique
      historyFilters.test.js ← tests unitaires filtres + agrégations (30 tests)
      selectionFilters.js    ← filtres pour /mes-matchs (tri, sections actif/terminé)
      selectionFilters.test.js ← tests unitaires selectionFilters
      countryFlags.js     ← mapping nom de pays FootyStats → ISO 3166-1 alpha-2 + helpers flagUrl/extractCountry/leagueFlagUrl (drapeaux flagcdn.com)
    data.js             ← initApp (test connexion API)
static/
  manifest.json         ← PWA manifest (nom, icônes, display standalone)
  sw.js                 ← Service Worker (cache statique, offline shell)
  icon-192.png          ← icône PWA 192×192
  icon-512.png          ← icône PWA 512×512
scripts/
  run-seed.mjs          ← orchestre seed complet autonome (~240 saisons)
  calibrate-threshold.js← calibration seuils FHG (Wilson CI 95%)
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

| Table | Rôle | RLS | Policies authenticated | Policies anon | Policies service_role |
|-------|------|-----|----------------------|---------------|----------------------|
| `alerts` | Alertes FHG/LG2 (status: pending/validated/lost/expired) | ON | SELECT + UPDATE | UPDATE (résultat manuel /mes-matchs) | ALL |
| `trades` | Journal des trades (legacy) | ON | ALL | — | ALL |
| `h2h_matches` | Historique matchs H2H avec goal_events (65k+ lignes) | ON | SELECT | — | ALL |
| `team_seasons` | Stats équipes par saison (legacy, non peuplée) | ON | SELECT | — | ALL |
| `seed_jobs` | Suivi progression seed | ON | SELECT, INSERT, UPDATE | — | ALL |
| `team_fhg_cache` | FHG% 0-45 min par equipe par saison (PK: season_id+team_id) | ON | SELECT | — | ALL |
| `teams` | 1098 équipes (team_id unique + colonne réelle `name`, pas `team_name`), autocomplete /matches | ON | SELECT | SELECT | ALL |
| `selected_alerts` | Sélections manuelles FHG/LG2 par Benjamin | ON | SELECT, INSERT, DELETE | — | ALL |
| `alert_trades` | Positions trading (cote + mise), plusieurs par match | ON | ALL | ALL | ALL |

---

## Algorithme FHG — streak v2 (depuis 2026-04-23)

Spec complète : `SPEC_STREAK_V2.md` à la racine du projet.

### Quatre scenarii (domicile ET extérieur évalués séparément)

C et D sont des fallback — ils ne s'évaluent que si A et B sont tous deux inactifs.

**Scénario A** — l'équipe marque en 31-45 (streak offensif) :
1. Streak consécutif >= 3 en 31-45 (dom ou ext selon le rôle)
2. Confirmation : l'adversaire a concédé en 1MT dans >= 60% de ses 5 derniers matchs (min 3)

**Scénario B** — l'adversaire concède en 31-45 (streak défensif) :
1. Streak consécutif >= 3 de l'adversaire qui encaisse en 31-45
2. Confirmation : l'équipe marque en 1MT dans >= 60% de ses 5 derniers matchs (min 3)

**Scénario C** — streak court + confirmation maximale (fallback A/B) :
1. Streak consécutif === 2 exactement en 31-45 (si >= 3, A aurait déclenché)
2. Confirmation : l'adversaire a encaissé en 1MT dans les 3 derniers matchs, **3 sur 3** (100%)

**Scénario D** — double activité 31-45 (fallback A/B/C) :
1. L'équipe a marqué >= 1 ET encaissé >= 1 en 31-45 dans ses 3 derniers matchs
2. Confirmation : l'adversaire a marqué en 1MT dans >= 1 de ses 3 derniers matchs

### Signal résultant
| Cas | signal_type |
|-----|------------|
| A et B actifs | `FHG_A+B` (priorité max) |
| A seul | `FHG_A` |
| B seul | `FHG_B` |
| C seul (fallback, A/B inactifs) | `FHG_C` |
| D seul (fallback, A/B/C inactifs) | `FHG_D` |

### Confiance
| Critère | Scénario | Confidence |
|---------|----------|-----------|
| Streak A >= 3 + confirmation | A | `fort` |
| Streak B >= 3 + confirmation | B | `moyen` |
| A et B actifs simultanément | A+B | `fort` |
| Streak C = 2 + confirmation 3/3 | C | `moyen` |
| Double activité D + confirmation | D | `moyen` |

> `STREAK_MOYEN=2` est utilisé par le scénario C (streak exactement égal à 2).

### Veto H2H
Si >= 3 H2H et l'équipe n'a jamais marqué en 1MT (0-45 min) → exclusion totale.

### Constantes partagées (analysis.cjs + scoring.js)
```
STREAK_FORT=3, STREAK_MOYEN=2, CONFIRM_MIN_RATE=0.60, CONFIRM_WINDOW=5, CONFIRM_MIN_SAMPLE=3, STREAK_MIN_MATCHES=3
```

### Duplication ESM/CJS intentionnelle
`analysis.cjs` (server, CommonJS) et `scoring.js` (client, ESM) contiennent la même logique streak.
Pas de fichier partagé : les bundlers Netlify/Vite ne supportent pas le même format.
Idem pour LG2 : `lg2.cjs` + `lg2.js`.

---

## Algorithme LG2 — Late Goal 2e mi-temps (depuis 2026-04-23)

Spec complète : `docs/superpowers/specs/2026-04-23-lg2-design.md`.

### Principe (beaucoup plus simple que FHG)

Pour chaque équipe, on compte un **streak consécutif** de matchs (côté dom ou ext selon son rôle dans le match à venir) avec **au moins un but après 80'** (temps additionnels inclus, peu importe qui marque).

- **Signal A** : streak équipe DOM >= 3 (sur ses matchs à domicile récents)
- **Signal B** : streak équipe EXT >= 3 (sur ses matchs à l'extérieur récents)
- **Signal A+B** : les deux simultanés → `fort`

### Confiance
| Critère | Confidence |
|---------|-----------|
| Streak = 3 consécutifs | `moyen` |
| Streak >= 4 consécutifs | `fort` |
| A+B simultanés | `fort` |

### Constantes partagées (lg2.cjs + lg2.js)
```
LG2_MIN_MINUTE=80, LG2_STREAK_MIN_MATCHES=3, LG2_STREAK_MOYEN=3, LG2_STREAK_FORT=4
```

### Ce qui n'existe PAS pour LG2 (YAGNI)
- Pas de scénarios C/D
- Pas de confirmation indépendante (le streak suffit)
- Pas de veto H2H
- Pas de cache `team_lg2_cache` (calcul à la volée)

### Intégration
- `generate-alerts.js` : boucle LG2 ajoutée après FHG. Aucun appel API en plus (réutilise homeMatches/awayMatches déjà chargés).
- `check-results.js` : `evaluateLG2()` — validée si au moins un but >= 80', sinon perdue.
- `algo_version = 'lg2_v1'` (distinct de `'v2'` pour FHG).
- `fhg_factors` réutilisé pour stocker `{ streakHome, streakAway }` (pas de nouvelle colonne).

---

## Ce qui est implémenté

- **Algo FHG streak v2** (2026-04-23) — `analysis.cjs` + `scoring.js` : Scénario A (streak >=3 → fort), B (count adversaire 3/5 → moyen), A+B → fort, C (streak=2 + confirmation 3/3 → moyen, fallback), D (double activité 31-45 → moyen, fallback). Veto H2H 1MT. `fort_double` mergé dans `fort` (migration 2026-05-07). Spec : `SPEC_STREAK_V2.md`
- **Algo LG2 streak** (2026-04-23) — `lg2.cjs` + `lg2.js` : streak consécutif de matchs avec but >= 80' par équipe (dom ou ext). LG2_A (home), LG2_B (away), LG2_A+B. Confidence = moyen (3) / fort (4+). Spec : `docs/superpowers/specs/2026-04-23-lg2-design.md`
- **Système d'alertes autonome** — `generate-alerts.js` (cron 12h) : génère FHG_A/B/A+B + LG2_A/B/A+B, algo_version='v2' (FHG) ou 'lg2_v1' (LG2), table Supabase `alerts`
- **Vérification auto résultats** — `check-results.js` (cron 1h) : FHG sur buts 31-45 min, LG2 sur buts >= 80 min via goal_events, statut -> validated/lost/expired (cleanup 48h)
- **Daily seed auto** — `daily-seed.js` (cron 6h UTC) : seed matchs d'hier dans `h2h_matches`
- **Calcul FHG% équipes** — `compute-team-fhg.js` (cron 7h UTC) : FHG% 0-45 par (season_id, team_id) depuis `h2h_matches`, upsert dans `team_fhg_cache`
- **Exclusion manuelle** — bouton rouge "Exclure" (btn--danger) sur dashboard/alertes, ExcludeAlertModal (7 tags + note), réintégration possible, what-if stats dans /historique (Wilson CI 95% par tag)
- **Auth Supabase** — email/password solo, sign ups désactivés, guard SvelteKit dans +layout.svelte, page `/login`, redirect automatique si non authentifié
- **Headers sécurité** — `src/hooks.server.js` injecte CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP sur toutes les réponses SSR
- **PWA installable** — `static/manifest.json` + `static/sw.js` (service worker cache offline) + icônes 192×512px
- **Drapeaux pays** — `src/lib/utils/countryFlags.js` : mapping ~90 noms de pays FootyStats → ISO 3166-1 alpha-2 (subdivisions UK incluses). Helpers `flagUrl(country)`, `extractCountry(leagueName)` (extraction par préfixe), `leagueFlagUrl(leagueName)`. Drapeau SVG depuis flagcdn.com affiché sur `/leagues`, `/explore` (header pays), `/alerts`, `/alerts-lg2`, `/mes-matchs` (à côté du nom de ligue).
- **Dashboard** (`/`) — 12 KPIs en 4 sections : "Santé infra" (API FootyStats, Ligues actives, Historique H2H) + "Santé crons" (Génération FHG last run, Génération LG2 last run, Alertes > 48h) + "Alertes du jour" (FHG Fort, LG2 Fort, Performance 7j) + "Mes performances" (Renta semaine, Renta mois, Matchs joués). Layout centré max-width 960px.
- **Selection FHG** (`/alerts`) — alertes FHG_A/B/A+B/C/D, tri fort→moyen→date, filtres jour (boutons) + ligue (dropdown) + confiance (Tout/Fort/Moyen). Badges Fort/Moyen (sans badge signal_type). league_name via leagueMap. Expand détaillé, barres timing buts, Validé/Perdu/EN COURS, bouton Exclure, SelectAlertButton.
- **Selection LG2** (`/alerts-lg2`) — alertes LG2_A/B/A+B, tri fort→moyen→date, filtres jour + ligue + confiance. Badges Fort/Moyen. Expand par équipe, barres timing buts (marqueur 80'), pills Dom/Ext streak, bouton Exclure, SelectAlertButton.
- **Mes matchs** (`/mes-matchs`) — alertes sélectionnées via selectionStore, sections Actif (A venir/Aujourd'hui) + Terminés (collapsible). Saisie inline de positions (cote + mise) → insert dans `alert_trades`. Boutons résultat manuel Gagné/Perdu (`updateAlertStatus`). Chips réactifs par match après insert.
- **Historique** (`/historique`) — FiltersBar multi-critères + ScopeToggle (Global / Mes positions). Section Global : grille 2x2 Chart.js (évolution, stacked stratégie, top équipes, top ligues) + tableau dense triable (infinite scroll 50/batch) + blocs "Mes trades vs Global" et "What-if exclusions" (Wilson CI). Section Mes positions : table `alert_trades` + P&L réel. Spec : `docs/superpowers/specs/2026-04-23-historique-redesign-design.md`
- **Matchs a venir** (`/matches`) — cards avec streak FHG par équipe, expand barres timing buts, déduplication matchs. Curseur minute interactif. Tooltip opaque.
- **Ligues actives** (`/leagues`) — 50 ligues, toggle, tout sélectionner/désélectionner. Expand : liste équipes triée par FHG% 0-45 (depuis team_fhg_cache Supabase)
- **Classements ligues** (`/explore`) — par pays, stats, classements
- **Config** (`/config`) — configuration algo (section Admin)
- **Debug** (`/debug`) — test API/Supabase, boutons génération alertes FHG/LG2, seed complet, rattrapage matchs, token auth, testeur API brut. Panel CRON : 4 crons avec schedule, description, temps avant prochain run, bouton "Lancer maintenant"
- **Proxy Netlify sécurisé** — whitelist endpoints, CORS restreint via `lib/cors.cjs`
- **Auth Netlify Functions** — `lib/auth.cjs` : `requireAuth(event)` vérifie `FUNCTIONS_AUTH_TOKEN`, bypass automatique pour les crons Netlify Scheduled
- **Cache localStorage TTL** — éviction auto par endpoint
- **Compteur API** — req restantes affiché dans la sidebar
- **Svelte 5 runes** — `$state`, `$derived`, `$effect`, `$props()`, `onclick` natif
- **Supabase RLS durcie** (2026-05-07) — policies `authenticated` pour le frontend (plus `anon`), `service_role` pour les Netlify Functions. `anon` UPDATE sur `alerts` conservé pour résultat manuel /mes-matchs.
- **Tests unitaires** — Vitest, 331 tests (analysis.cjs 162, scoring 44, lg2.cjs 27, lg2.js 17, cache 20, formatters 22, teamData 14, tradeStore 14, tradeStats 17, historyFilters 30, selectionFilters + selectionStore + supabase.auth)
- **CSS centralisé** — badges, goal-bar, team-detail, match-row dans `app.css`. Tooltip goal-dot opaque (#1e2330). bar-hover-min opaque.
- **Fetch timeouts** — 8s sur tous les appels réseau (fonctions Netlify)
- **Parallélisation queries** — `generate-alerts.js` traite les matchs par batch de 5
- **Calibration seuils** — `scripts/calibrate-threshold.js` : cross-tab signal_type × confiance (FHG uniquement), Wilson CI, recommandations STREAK_FORT/MOYEN

---

## Roadmap — prochaines étapes

- [ ] Attendre ~20 alertes FHG terminées (validated/lost) → lancer `scripts/calibrate-threshold.js`
- [ ] Attendre ~20 alertes LG2 terminées → calibrer les seuils LG2 (STREAK_MOYEN / STREAK_FORT) avec Wilson CI
- [ ] Chantier D : Page "Résultats" + filtres équipe/ligue
- [ ] Chantier E : Blacklist équipes
- [ ] Chantier A : Notifications externes

---

## Decisions actees

1. FHG = streak comportemental par équipe (pas H2H), dom/ext séparés — algo streak v2 depuis 2026-04-23
2. [ARCHIVÉ] DC supprimée — stratégie retirée de l'app le 2026-05-07 (données existantes préservées en BDD)
3. Vérification FHG à la MT (pas à la volée — VAR)
4. Terminologie : Validé / Perdu
5. Pas de mode démo — données réelles uniquement
6. **Cotes et P&L** : utilisés dans `/mes-matchs` (saisie inline cote + mise → `alert_trades`) et `/historique` (section "Mes positions"). Plusieurs positions possibles sur un même match (mises échelonnées à différentes cotes). **Aucune cote n'est utilisée par l'algo** (génération d'alertes, filtrage, validation).
7. Pas de bouton "Analyse IA" — Benjamin fait sa propre analyse
8. Clé anon sans fallback hardcodé
9. ESM/CJS : scoring.js (frontend ESM) et analysis.cjs (backend CJS) dupliquent la logique streak — pas de fichier partagé (incompatibilité bundlers). Même règle pour lg2.js / lg2.cjs.
10. LG2 = streak simple "match avec but >= 80'" (tout but compte), sans confirmation ni veto H2H — volontairement plus léger que FHG. `fhg_factors` jsonb réutilisé pour stocker les streaks LG2 (évite une migration).

---

## Conventions de developpement

- **Svelte 5 runes** — `$state`, `$derived`, `$effect`, `$props()` (pas de `$:` ni `export let`)
- **Events composants** — NE PAS utiliser `createEventDispatcher` + `on:event` dans les composants runes : l'event est silencieusement ignoré. Utiliser des **callback props** : `let { onexcluded } = $props()` → `onexcluded?.({ ... })` côté composant, `onexcluded={handler}` côté parent.
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
- **Type mismatch `match_id`** : `alerts.match_id` est `bigint` (retourné `number` par Supabase) tandis que `alert_trades.match_id` est `TEXT` (retourné `string`). Toujours normaliser via `String(...)` (ou template literal) des deux côtés avant comparaison ou jointure côté client. La comparaison `===` stricte échoue silencieusement et fait disparaître les trades.
- **Schéma `teams` vs migration** : la migration `20260507140000_create_teams_table.sql` déclare `team_name` mais la table préexistait avec `(id, team_id, league_id, name, stats, updated_at)` — `CREATE TABLE IF NOT EXISTS` a été un no-op. **La vraie colonne pour le nom est `name`**, pas `team_name`. Toujours vérifier avec `information_schema.columns` (ou MCP Supabase) en cas de doute sur un schéma plutôt que faire confiance au fichier de migration.
- **Tables créées après hardening** : si une nouvelle table publique est créée APRÈS la migration `20260507120000_harden_rls_authenticated.sql`, elle doit avoir explicitement une policy `to authenticated` (sinon le frontend logué — qui passe en rôle `authenticated` — voit 0 ligne silencieusement). Ne pas se reposer sur les policies `to anon`. Les policies anon ne s'appliquent qu'au rôle `anon`, pas à `authenticated`.

## Conventions git

- Commit directement sur `main` pour les features solo
- Toujours pusher `CLAUDE.md` a jour apres une session de travail
- Push + merge autonome autorise si Benjamin le demande explicitement

---

## 🤖 Stratégie d'orchestration multi-agents

Ce projet utilise une **architecture à subagents spécialisés** organisée en deux niveaux :

- **Project agents** (`.claude/agents/`) — connaissent le stack TradingAlerts et les règles métier
- **User agents** (`~/.claude/agents/`) — généralistes et applicables à tout projet

### Project agents (TradingAlerts-aware)

| Agent | Modèle | Rôle |
|-------|--------|------|
| `explorer` | Haiku 4.5 | Exploration read-only du repo |
| `svelte-builder` | Sonnet 4.6 | Création/modification de composants Svelte 5 |
| `supabase-migrator` | Sonnet 4.6 | Création de migrations SQL avec conventions du projet |
| `test-writer` | Haiku 4.5 | Génération de tests Vitest avec setup TradingAlerts |
| `code-reviewer` | Opus 4.6 | Review approfondie avant commit (règles métier connues) |

Définitions complètes dans `.claude/agents/`.

### User agents (équipe de dev généraliste)

| Agent | Modèle | Rôle |
|-------|--------|------|
| `tech-lead` | Opus | Architecte / chef de projet — analyse, plan, risques |
| `senior-developer` | Sonnet | Implémentation propre du code applicatif |
| `test-engineer` | Sonnet | Tests unitaires + intégration génériques |
| `code-reviewer-senior` | Opus | Review générique (autres projets que TA) |
| `security-auditor` | Opus | Audit OWASP + BDD (RLS, Storage, Edge Functions, secrets) |
| `debugger` | Sonnet | Investigation systématique de bugs (4 étapes) |
| `refactor-specialist` | Sonnet | Refactoring sans casser le comportement |

Définitions complètes dans `~/.claude/agents/` (repo : `BenjaminB-BlueTeam/claude-personal-agents`).

### Précédence Project > User

Quand un agent existe **à la fois en Project et en User** (cas de `code-reviewer`), **toujours privilégier la version Project** car elle connaît les règles métier TradingAlerts (H2H Clean Sheet, pas de demo mode, etc.).

---

## ⚠️ IMPORTANT — Utilisation obligatoire des subagents

**Pour TOUTE tâche dans ce projet, l'agent principal DOIT déléguer aux subagents disponibles plutôt que de coder directement.** Cette règle est non négociable.

### Règles de délégation systématique

| Type de tâche | Agent à invoquer | Niveau |
|---------------|------------------|--------|
| Analyse / planification d'un nouveau chantier | `tech-lead` | User |
| Exploration du repo, compréhension de l'existant | `explorer` | Project |
| Migration / schéma BDD Supabase | `supabase-migrator` | Project |
| Composants Svelte / pages SvelteKit | `svelte-builder` | Project |
| Implémentation de logique métier complexe (>50 lignes) | `senior-developer` | User |
| Tests Vitest avec setup TradingAlerts | `test-writer` | Project |
| Tests génériques / fonctions de calcul pures | `test-engineer` | User |
| Review approfondie avant commit | `code-reviewer` | Project (TradingAlerts-aware) |
| Bug résistant (3+ tentatives infructueuses) | `debugger` | User |
| Audit sécurité (RLS, secrets, OWASP, BDD) | `security-auditor` | User |
| Refactoring sans changement de comportement | `refactor-specialist` | User |

### Quand l'agent principal peut coder directement

L'agent principal peut faire le travail lui-même **uniquement** si **toutes** ces conditions sont réunies :
- Tâche < 50 lignes de code
- Impacte ≤ 2 fichiers
- Pas de logique métier critique
- Pas de modification BDD
- Pas de nouveau composant UI

Pour tout le reste, **délégation obligatoire**.

### Workflow par défaut pour un chantier

```
1. tech-lead (User)            → analyse + plan détaillé
   ↓ ⏸️ STOP — validation utilisateur obligatoire
2. explorer (Project)          → cartographie de l'existant impacté
   ↓
3. supabase-migrator (Project) → migration SQL si BDD impactée
   ↓
4. svelte-builder (Project)    → composants UI / pages
   ↓
5. test-writer (Project)       → tests Vitest sur fonctions de calcul
   ↓
6. code-reviewer (Project)     → review approfondie (bloquants/à corriger/OK)
   ↓ corrections si bloquants
7. ⏸️ STOP — validation utilisateur final
8. Commit + push
```

### Agents génériques User pour cas particuliers

- `security-auditor` à invoquer **proactivement** sur les chantiers touchant à la BDD (Chantiers B, C, E, F) ou avant un déploiement public sensible
- `debugger` à invoquer **dès le 3e essai infructueux** sur un bug — ne pas s'enfermer dans une boucle de patches
- `refactor-specialist` à invoquer **avant** un gros chantier sur une zone existante qui mérite d'être nettoyée

### Visibilité de l'orchestration

À chaque délégation, l'agent principal **doit annoncer clairement** :
- Quel agent il invoque (et pourquoi)
- Le résultat synthétique au retour (ce que l'agent a produit)

L'utilisateur doit pouvoir suivre la chaîne de délégations dans la conversation.

### Anti-patterns interdits

- ❌ L'agent principal qui code directement une migration SQL sans déléguer à `supabase-migrator`
- ❌ Implémentation d'un composant Svelte > 50 lignes sans déléguer à `svelte-builder`
- ❌ Commit final sans review par `code-reviewer`
- ❌ Patch d'un bug sans investigation `debugger` après 3 tentatives échouées
- ❌ Utilisation des agents Built-in (`Explore`, `Plan`, `general-purpose`) au lieu des agents spécialisés Project/User
- ❌ Sauter l'étape `tech-lead` sur un chantier > 1 fichier impacté

### Quand l'agent principal doit s'arrêter et demander

- Ambiguïté sur le schéma BDD
- Conflit avec une règle métier critique
- Nouvelle dépendance npm à introduire
- Modification destructive
- Doute sur l'UX d'un composant complexe
- Plan du `tech-lead` qui dévie de la spec utilisateur

**Jamais** inventer un comportement métier qui contredit les règles critiques.

---

## 🗺️ Roadmap workflow manuel

| # | Chantier | Statut |
|---|----------|--------|
| B | Sélection manuelle des alertes + saisie positions (cote/mise) + résultat manuel | ✅ DONE (2026-05-07) |
| C | Page "Mes matchs" (sections actif/terminé + chips trades) | ✅ DONE (2026-05-07) |
| D | Page "Résultats" + filtres équipe/ligue | À faire |
| E | Blacklist équipes | À faire |
| A | Notifications externes | À faire |
| F | Calibration empirique | À faire |

**Ordre suggéré : D → E → A → F**