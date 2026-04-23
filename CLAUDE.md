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
| Persistance | Supabase (PostgreSQL) — alerts, trades, team_seasons, h2h_matches, seed_jobs, team_fhg_cache |
| Charts | Chart.js 4.4 (tree-shaké, imports sélectifs) |
| Tests | Vitest (191 tests) |

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
  compute-team-fhg.js  ← cron quotidien 7h UTC — calcule FHG% 0-45 min (goal_events) par (season_id, team_id), upsert team_fhg_cache
  lib/
    api.js              ← helpers partagés (footyRequest, supabaseQuery)
    analysis.cjs        ← logique FHG streak v2 + DC (server-side CJS)
    analysis.test.js    ← tests unitaires streak/DC (162 tests)
    lg2.cjs             ← logique LG2 streak (but >= 80') — server-side CJS
    lg2.test.js         ← tests unitaires LG2 server (27 tests)
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
    alerts-lg2/+page.svelte   ← Sélection LG2 — alertes LG2 depuis Supabase
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
      scoring.js        ← algorithme FHG streak v2 + DC (client-side ESM, miroir de analysis.cjs)
      scoring.test.js   ← tests unitaires streak (41 tests)
      lg2.js            ← algorithme LG2 streak (client-side ESM, miroir de lg2.cjs)
      lg2.test.js       ← tests unitaires LG2 client (17 tests)
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
| `team_fhg_cache` | FHG% 0-45 min par equipe par saison (PK: season_id+team_id, mis a jour par compute-team-fhg cron) | ON | SELECT | ALL |

---

## Algorithme FHG — streak v2 (depuis 2026-04-23)

Spec complète : `SPEC_STREAK_V2.md` à la racine du projet.

### Deux scenarii indépendants (domicile ET extérieur évalués séparément)

**Scénario A** — l'équipe marque en 31-45 :
1. Streak : elle a marqué en 31-45 dans les N derniers matchs (dom ou ext selon le rôle)
2. Confirmation : l'adversaire a concédé en 1MT dans >= 60% de ses 5 derniers matchs (min 3)

**Scénario B** — l'adversaire concède en 31-45 :
1. Count : l'adversaire a concédé en 31-45 dans au moins 3 des 5 derniers matchs (non nécessairement consécutifs)
2. Confirmation : l'équipe marque en 1MT dans >= 60% de ses 5 derniers matchs (min 3)

### Signal résultant
| Cas | signal_type |
|-----|------------|
| A et B | `FHG_A+B` (priorité max) |
| A seul | `FHG_A` |
| B seul | `FHG_B` |

### Confiance
| Critère | Scénario | Confidence |
|---------|----------|-----------|
| Streak A >= 3 consécutifs (`STREAK_FORT`) + confirmation | A | `fort` |
| Count B >= 3/5 (non-consécutif) + confirmation | B | `moyen` |
| A et B actifs simultanément | A+B | `fort_double` |

> Scénario A : streak 2 consécutifs → null (seuil minimum = 3). `STREAK_MOYEN` exporté mais non utilisé dans l'algo actuel.

### Veto H2H
Si >= 3 H2H et l'équipe n'a jamais marqué en 1MT (0-45 min) → exclusion totale.

### Constantes partagées (analysis.cjs + scoring.js)
```
STREAK_FORT=3, STREAK_MOYEN=2, CONFIRM_MIN_RATE=0.60, CONFIRM_WINDOW=5, CONFIRM_MIN_SAMPLE=3, STREAK_MIN_MATCHES=3
```

### DC (inchangé)
`analyzeDCFromH2H` — % victoire (win+nul) H2H : fort <= 10% défaite, moyen <= 20%, min 5 H2H.

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
- **Signal A+B** : les deux simultanés → `fort_double`

### Confiance
| Critère | Confidence |
|---------|-----------|
| Streak = 3 consécutifs | `moyen` |
| Streak >= 4 consécutifs | `fort` |
| A+B simultanés | `fort_double` |

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
- `generate-alerts.js` : boucle LG2 ajoutée après FHG/DC. Aucun appel API en plus (réutilise homeMatches/awayMatches déjà chargés).
- `check-results.js` : `evaluateLG2()` — validée si au moins un but >= 80', sinon perdue.
- `algo_version = 'lg2_v1'` (distinct de `'v2'` pour FHG).
- `fhg_factors` réutilisé pour stocker `{ streakHome, streakAway }` (pas de nouvelle colonne).

---

## Ce qui est implémenté

- **Algo FHG streak v2** (2026-04-23) — `analysis.cjs` + `scoring.js` : Scénario A (streak consécutif >=3 → fort), Scénario B (count 3/5 non-consécutif → moyen), FHG_A+B → fort_double, veto H2H 1MT. Spec : `SPEC_STREAK_V2.md`
- **Algo LG2 streak** (2026-04-23) — `lg2.cjs` + `lg2.js` : streak consécutif de matchs avec but >= 80' par équipe (dom ou ext). LG2_A (home), LG2_B (away), LG2_A+B. Confidence = moyen (3) / fort (4+) / fort_double (A+B). Spec : `docs/superpowers/specs/2026-04-23-lg2-design.md`
- **Système d'alertes autonome** — `generate-alerts.js` (cron 12h) : génère FHG_A/B/A+B + DC + LG2_A/B/A+B, algo_version='v2' (FHG/DC) ou 'lg2_v1' (LG2), table Supabase `alerts`
- **Vérification auto résultats** — `check-results.js` (cron 1h) : FHG sur buts 31-45 min, LG2 sur buts >= 80 min via goal_events, DC sur résultat final, statut -> validated/lost/expired (cleanup 48h)
- **Daily seed auto** — `daily-seed.js` (cron 6h UTC) : seed matchs d'hier dans `h2h_matches`
- **Calcul FHG% équipes** — `compute-team-fhg.js` (cron 7h UTC) : FHG% 0-45 par (season_id, team_id) depuis `h2h_matches`, upsert dans `team_fhg_cache`
- **Exclusion manuelle** — bouton rouge "Exclure" (btn--danger) sur dashboard/alertes, ExcludeAlertModal (7 tags + note), réintégration possible, what-if stats dans /historique (Wilson CI 95% par tag)
- **Dashboard** (`/`) — KPIs + alertes du jour/a venir, bouton rouge "Exclure" sur pending, badge EXCLUE
- **Selection FHG** (`/alerts`) — alertes FHG_A/B/A+B/C/D, tri fort→moyen→date, filtres jour + ligue + signal (boutons colorés par type), expand détaillé par équipe, barres timing buts, curseur interactif (* 90), tooltip buts opaque, badges Validé/Perdu/EN COURS, badge signal_type, bouton rouge "Exclure"
- **Selection DC** (`/selection-dc`) — alertes DC, tri fort→moyen→date, filtres jour + ligue, expand H2H tableau centré, % victoire (win+nul)
- **Selection LG2** (`/alerts-lg2`) — alertes LG2_A/B/A+B, tri fort_double→fort→moyen→date, filtres jour + ligue + signal, expand par équipe avec barres timing buts (marqueur 80' visible, buts après 80' encadrés), pills Dom/Ext affichant la longueur du streak, badge signal_type, bouton rouge "Exclure"
- **Historique** (`/historique`) — stats filtrées !user_excluded, Global/FHG/DC/LG2/fort/moyen, bloc "Mes trades vs Global", tableau par ligue, toggle what-if exclusions (par tag + Wilson CI), liste paginée (90j + "Charger plus")
- **Matchs a venir** (`/matches`) — cards avec streak FHG par équipe, expand barres timing buts, déduplication matchs. Curseur minute dans la 1ère barre (data-tip + CSS, pas de délai, calcul * 90). Ballon encaissé : label "(Encaissé) - X'". Tooltip opaque (#1e2330 + border)
- **Ligues actives** (`/leagues`) — 50 ligues, toggle, tout sélectionner/désélectionner. Expand : liste équipes triée par FHG% 0-45 (depuis team_fhg_cache Supabase, affichage instantané)
- **Classements ligues** (`/explore`) — par pays, stats, classements
- **Paramètres** (`/settings`) — 5 sous-composants (ApiTest, TradeJournal, TradeStats, BankrollCalc, DangerZone)
- **Config** (`/config`) — configuration algo (section Admin)
- **Debug** (`/debug`) — test API/Supabase, boutons génération alertes FHG/DC, seed complet, rattrapage matchs, token auth, testeur API brut. Panel CRON : liste des 4 crons avec schedule, description, temps avant prochain run, bouton "Lancer maintenant"
- **Proxy Netlify sécurisé** — whitelist endpoints, CORS restreint
- **Cache localStorage TTL** — éviction auto par endpoint
- **Compteur API** — req restantes affiché dans la sidebar
- **Svelte 5 runes** — `$state`, `$derived`, `$effect`, `$props()`, `onclick` natif
- **Supabase RLS active** — policies read-only anon, service_role pour les Netlify Functions
- **Tests unitaires** — Vitest, 257 tests (analysis.cjs 162, scoring 44, lg2.cjs 27, lg2.js 17, h2h 16, cache 20, formatters 22, teamData 14, tradeStore 14, tradeStats 17)
- **CSS centralisé** — badges, goal-bar, team-detail, match-row dans `app.css`. Tooltip goal-dot opaque (#1e2330). bar-hover-min opaque.
- **Fetch timeouts** — 8s sur tous les appels réseau (fonctions Netlify)
- **Parallélisation queries** — `generate-alerts.js` traite les matchs par batch de 5
- **Calibration seuils** — `scripts/calibrate-threshold.js` : cross-tab signal_type × confiance, Wilson CI, recommandations STREAK_FORT/MOYEN

---

## Roadmap — prochaines étapes

- [ ] Attendre ~20 alertes FHG terminées (validated/lost) → lancer `scripts/calibrate-threshold.js`
- [ ] Attendre ~20 alertes LG2 terminées → calibrer les seuils LG2 (STREAK_MOYEN / STREAK_FORT) avec Wilson CI

---

## Decisions actees

1. FHG = streak comportemental par équipe (pas H2H), dom/ext séparés — algo streak v2 depuis 2026-04-23
2. DC analysée indépendamment du FHG, basée H2H uniquement (inchangé)
3. Vérification FHG à la MT (pas à la volée — VAR)
4. Terminologie : Validé / Perdu
5. Pas de mode démo — données réelles uniquement
6. Pas de cotes/stakes/profits dans l'app
7. Pas de bouton "Analyse IA" — Benjamin fait sa propre analyse
8. Clé anon sans fallback hardcodé
9. ESM/CJS : scoring.js (frontend ESM) et analysis.cjs (backend CJS) dupliquent la logique streak — pas de fichier partagé (incompatibilité bundlers). Même règle pour lg2.js / lg2.cjs.
10. LG2 = streak simple "match avec but >= 80'" (tout but compte), sans confirmation ni veto H2H — volontairement plus léger que FHG. `fhg_factors` jsonb réutilisé pour stocker les streaks LG2 (évite une migration).

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
