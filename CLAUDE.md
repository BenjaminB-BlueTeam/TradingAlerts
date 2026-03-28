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
| Frontend | SvelteKit 2 + Svelte 5 (SPA, ssr: false) |
| Build | Vite 6 |
| Déploiement | Netlify (adapter-netlify) + Netlify Functions |
| Données | API FootyStats (`football-data-api.com`) via proxy Netlify sécurisé |
| Persistance | Supabase (PostgreSQL) — trades, team_seasons, h2h_matches, seed_jobs |
| Charts | Chart.js 4.4 |
| Clé API | `FOOTYSTATS_API_KEY` en variable d'env Netlify (jamais côté browser) |
| Supabase (serveur) | `SUPABASE_URL` + `SUPABASE_ANON_KEY` en env vars Netlify (pour seed-data function) |

---

## Architecture des fichiers

```
package.json / svelte.config.js / vite.config.js
netlify.toml
netlify/functions/
  footystats.js         ← proxy sécurisé API FootyStats
  seed-data.js          ← seed Supabase (team_seasons, h2h_matches)
src/
  app.css               ← styles globaux (variables CSS, composants, responsive)
  app.html              ← template HTML
  routes/
    +layout.svelte      ← layout global (Sidebar, Toast, init)
    +layout.js           ← ssr: false, prerender: false
    +page.svelte         ← Dashboard signaux FHG
    dc/+page.svelte      ← Double Chance — analyse H2H (3 jours)
    matches/+page.svelte ← Matchs à venir (table)
    leagues/+page.svelte ← Ligues actives (toggle, stats, classement)
    explore/+page.svelte ← Explorer toutes les ligues (par pays, stats, classement)
    alerts/+page.svelte  ← Alertes FHG + DC (matchs pertinents à surveiller)
    live/+page.svelte    ← Live — matchs alertés en cours, scores temps réel (refresh 10s)
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
      appStore.js       ← stores Svelte (config, leagues, trades, etc.)
    core/
      scoring.js        ← algorithme FHG + DC
      doubleChance.js   ← analyse DC basée H2H (% défaite, comeback, MT≠FT)
      h2h.js            ← analyse head-to-head
      filters.js        ← filtrage/tri des signaux
      mockData.js       ← données démo (sans clé API)
    data.js             ← orchestration chargement données
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

| Table | Rôle | RLS |
|-------|------|-----|
| `trades` | Journal des trades | OFF |
| `team_seasons` | Stats équipes par saison (3 ans, buts/min) | OFF |
| `h2h_matches` | Historique matchs H2H avec goal_events | OFF |
| `seed_jobs` | Suivi progression seed | OFF |

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

## Ce qui est implémenté

- Dashboard signaux FHG, filtre H2H Clean Sheet, mode Focus
- Supabase connecté (persistance trades + tables team_seasons, h2h_matches, seed_jobs)
- Proxy Netlify sécurisé (clé API en env var)
- Journal trades : stats, export CSV, calcul bankroll
- Goal Timeline H2H — barre de timing des buts style FootyStats
- **Page Double Chance** (`/dc`) — analyse H2H pure sur 3 jours : % défaite H2H, buts moy., forme récente, MT≠FT, historique détaillé avec tags Comeback/MT≠FT
- **Page Ligues actives** — 50 ligues API, toggle actif, stats (1MT%, Avg, BTTS%, O2.5%), classement expand
- **Page Explorer** — ligues groupées par pays, mêmes stats, classement expand
- **Page Debug** — test API/Supabase, stats cache, seed data, testeur API brut avec copie JSON
- **Seed Data** — Netlify Function seed-data.js, orchestration client ligue par ligue
- **Page Alertes** (`/alerts`) — matchs à surveiller, 2 sections FHG (but 1MT ≥60%) et DC (défaite H2H ≤35%), H2H sur 5 saisons, ligues actives uniquement. Sauvegarde auto les matchs alertés dans la watchlist pour le Live.
- **Page Live** (`/live`) — surveillance temps réel des matchs alertés. 3 sections : en cours (refresh 10s), à venir, terminés. Scores live, badges FHG/DC, minute estimée.
- **Sidebar** — nav principale (Dashboard, Alertes, Live, DC, Matchs, Paramètres) + section Admin repliable (Ligues, Explorer, Configuration, Debug) + bouton Refresh (vide cache + reload)

---

## Roadmap — décisions prises

Ces décisions sont actées, ne pas remettre en question sauf si Benjamin le demande explicitement :

1. **Supprimer le scoring 0-100** → remplacer par des **% bruts** (saison, 5 derniers, 10 derniers matchs)
2. **DC analysée indépendamment du FHG** (plus de condition FHG ≥60)
3. **Carte avec les 2 badges FHG + DC** apparaît dans les 2 sections du dashboard
4. **Stats FHG et DC trackées séparément** en Supabase
5. **Bouton "Analyse IA"** sur chaque carte (Claude API, résultat mis en cache Supabase)

### Prochaines étapes prioritaires

- [x] Refonte DB Supabase — tables team_seasons, h2h_matches, seed_jobs
- [x] Seed FootyStats → Supabase via Netlify Function
- [x] Pages Admin (Debug, Ligues, Explorer)
- [x] Page Double Chance — analyse H2H pure (% défaite, buts moy., forme, MT≠FT)
- [ ] Refonte algo — % bruts sans scoring
- [ ] Refonte cartes — badges FHG + DC indépendants, bouton "Analyse IA"
- [ ] Adapter `renderGoalTimeline` aux vrais champs FootyStats API en prod
- [ ] Page Historique des Alertes
- [x] Page Live — surveillance matchs alertés en temps réel (refresh 10s), scores live, 3 sections (en cours/à venir/terminés)
- [ ] Vérification auto des résultats — après chaque match, vérifier si l'alerte FHG/DC était un succès ou un échec (goal_minute, fenêtre validée, etc.) et stocker le résultat en Supabase
- [ ] Compteur requêtes API FootyStats — afficher dans la sidebar le nombre de req/heure restantes

---

## Conventions de développement

- **SvelteKit** — composants .svelte, stores Svelte, routing fichier
- **Pas de modification du store global** sans vérifier les subscribers existants
- **Toute nouvelle feature** : légère, compatible Netlify static + Supabase
- **CSS** : utiliser les variables CSS existantes (`--color-*`, `--radius-*`, etc.) — ne pas coder de couleurs en dur
- **Mode démo** : toute nouvelle feature avec données API doit avoir un fallback dans `mockData.js`
- **Clé API** : ne jamais l'exposer côté browser — toujours passer par `/.netlify/functions/footystats`

## Conventions git

- Commit directement sur `main` pour les features solo (pas de PR obligatoire)
- Toujours pusher `CLAUDE.md` à jour après une session de travail
- Push + merge autonome autorisé si Benjamin le demande explicitement dans la session
