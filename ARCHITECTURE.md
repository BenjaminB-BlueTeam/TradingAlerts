# Architecture — FHG Tracker

## Pipeline automatique

```
[Netlify Scheduled Functions]
  |
  +-- generate-alerts.js (cron 12h, 6h/18h UTC)
  |     Analyse les matchs des 3 prochains jours
  |     Utilise analysis.cjs (FHG streak v2) + lg2.cjs (LG2 streak)
  |     Insert les alertes FHG_A/B/A+B et LG2_A/B/A+B dans Supabase
  |
  +-- check-results.js (cron 1h)
  |     Charge les alertes pending dont le kickoff est passe
  |     Evalue FHG_A/B/A+B : buts 31-45 min via goal_events
  |     Evalue LG2_A/B/A+B : au moins un but >= 80 min via goal_events
  |     Met a jour status -> validated / lost / expired (>48h)
  |
  +-- daily-seed.js (cron 6h UTC)
  |     Fenetre glissante J-3→J-1 via todays-matches (attrape matchs reprogrammes)
  |     Upsert dans h2h_matches avec scores + goal_events (idempotent, on_conflict=match_id)
  |     Mode backfill : ?from=...&to=... (requiert FUNCTIONS_AUTH_TOKEN)
  |
  +-- compute-team-fhg.js (cron 7h UTC)
        Calcule FHG% 0-45 min par (season_id, team_id) depuis h2h_matches
        Upsert dans team_fhg_cache
```

## Supabase — Tables et RLS

Toutes les tables ont RLS active. `service_role` bypass RLS par defaut.

| Table | Colonnes cles | authenticated | anon | Ecrivain principal |
|-------|--------------|--------------|------|-------------------|
| `alerts` | match_id, signal_type, confidence, status, algo_version, user_excluded | SELECT + UPDATE | — | generate-alerts.js, check-results.js |
| `trades` | match_id, mise, resultat | ALL | — | Frontend |
| `h2h_matches` | match_id, home/away_team_id, goal_events, match_date (65k lignes) | SELECT | — | daily-seed.js, seed-data.js |
| `teams` | team_id (unique), name (1077 equipes) | — | SELECT | seed-data.js (league-teams) |
| `team_seasons` | team_id, season_id, stats (non peuplee, legacy) | SELECT | — | — |
| `seed_jobs` | job_id, status, progress | SELECT + INSERT + UPDATE | — | seed-data.js |
| `team_fhg_cache` | season_id, team_id, fhg_pct (PK composite) | SELECT | — | compute-team-fhg.js |
| `selected_alerts` | match_id, signal_type | ALL | — | Frontend (SelectAlertButton) |
| `leagues`, `api_cache`, `alerts_v1_backup` | Tables legacy | — | — | service_role only |

## Algorithme FHG streak v2

Remplace l'ancien score composite 0-100 depuis la session 2026-04-23.

### Deux scenarii independants

**Scenario A** — l'equipe marque en 31-45 :
1. Streak : elle a marque en 31-45 dans les N derniers matchs (dom ou ext selon le role)
2. Confirmation : l'adversaire a concede en 1MT dans >= 60% de ses 5 derniers matchs (min 3)

**Scenario B** — l'adversaire concede en 31-45 :
1. Count : l'adversaire a concede en 31-45 dans au moins 3/5 matchs (non necessairement consecutifs)
2. Confirmation : l'equipe marque en 1MT dans >= 60% de ses 5 derniers matchs (min 3)

### Signal resultant
- Si A et B : `FHG_A+B` (priorite maximale)
- Si A seul : `FHG_A`
- Si B seul : `FHG_B`

### Niveaux de confiance
| Critere | Confidence |
|---------|-----------|
| Streak A >= 3 consecutifs + confirmation | `fort` |
| Count B >= 3/5 + confirmation | `moyen` |
| A+B simultanement | `fort_double` |

> Streak A == 2 consecutifs → null (seuil minimum = 3).

### Veto H2H
Si >= 3 H2H et l'equipe n'a jamais marque en 1MT (0-45 min) → exclusion totale.

### Constantes (analysis.cjs + scoring.js)
```
STREAK_FORT        = 3
STREAK_MOYEN       = 2
CONFIRM_MIN_RATE   = 0.60
CONFIRM_WINDOW     = 5
CONFIRM_MIN_SAMPLE = 3
STREAK_MIN_MATCHES = 3
```

## Algorithme LG2 streak

But >= 80 min (temps additionnels inclus, peu importe qui marque). Streak consecutif par equipe et par cote.

### Signal resultant
- `LG2_A` : streak dom >= 3
- `LG2_B` : streak ext >= 3
- `LG2_A+B` : les deux simultanement

### Niveaux de confiance
| Streak | Confidence |
|--------|-----------|
| 3 consecutifs | `moyen` |
| >= 4 consecutifs | `fort` |
| A+B | `fort_double` |

### Constantes (lg2.cjs + lg2.js)
```
LG2_MIN_MINUTE       = 80
LG2_STREAK_MIN_MATCHES = 3
LG2_STREAK_MOYEN     = 3
LG2_STREAK_FORT      = 4
```

### Ce qui n'existe pas pour LG2
- Pas de scenarios C/D
- Pas de confirmation independante
- Pas de veto H2H
- `fhg_factors` jsonb reutilise pour stocker `{ streakHome, streakAway }` (pas de nouvelle colonne)

## Deux moteurs de scoring (miroir ESM/CJS)

### Server-side
- `netlify/functions/lib/analysis.cjs` — FHG streak v2 (CommonJS)
- `netlify/functions/lib/lg2.cjs` — LG2 streak (CommonJS)

### Client-side
- `src/lib/core/scoring.js` — FHG streak v2 (ESM, miroir de analysis.cjs)
- `src/lib/core/lg2.js` — LG2 streak (ESM, miroir de lg2.cjs)

La duplication ESM/CJS est intentionnelle : les bundlers Netlify/Vite ne supportent pas le meme format. Pas de fichier partage.

## Exclusion manuelle

Les alertes pending peuvent etre exclues manuellement :
- Bouton ✕ sur dashboard, /alerts, /alerts-lg2, /historique
- ExcludeAlertModal : 7 tags predefinis + note libre
- Stockage : `user_excluded`, `user_exclusion_tags[]`, `user_exclusion_note`, `user_excluded_at`
- Reinsertion possible via bouton Reintegrer
- Page /historique : stats filtrees sur `!user_excluded` + section what-if avec Wilson CI 95%

## Selection manuelle

Bouton SelectAlertButton sur /alerts et /alerts-lg2.
- Store `selectionStore` (localStorage) : Set de cles `matchId:signalType`
- Page /mes-matchs : affiche les alertes selectionnees, triees par date et confiance

## Securite

### Auth
- Supabase Auth (email, sign ups desactives)
- Guard SvelteKit via `src/routes/+layout.svelte` (redirect /login si non authentifie)
- Page /login avec formulaire email/password
- /debug accessible uniquement aux utilisateurs connectes

### Headers HTTP
- `src/hooks.server.js` injecte les headers de securite sur toutes les reponses SSR
- CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP

### FUNCTIONS_AUTH_TOKEN
- `generate-alerts.js`, `check-results.js`, `seed-data.js` exigent `Authorization: Bearer <token>`
- Token stocke dans `FUNCTIONS_AUTH_TOKEN` (env Netlify, Functions scope)
- Valeur envoyee par le frontend via `VITE_FUNCTIONS_AUTH_TOKEN`

## Calibration des seuils

`scripts/calibrate-threshold.js` — a lancer manuellement avec les vars Supabase :
- Tableau par signal_type (FHG_A, FHG_B, FHG_A+B)
- Tableau par confiance (fort_double, fort, moyen)
- Cross-tab signal_type x confiance
- Wilson CI 95% + recommandations automatiques

## Seed initial

`scripts/run-seed.mjs` orchestre le seed complet de facon autonome :
1. `start_full` → recupere 51 ligues + season_ids (5 saisons par ligue = 240 saisons)
2. Boucle sur chaque `season_id` → appelle `seed_league` qui insere server-side :
   - `h2h_matches` via `league-matches` (batches 200, on_conflict=match_id)
   - `teams` via `league-teams` (upsert, on_conflict=team_id)
3. Resultat : ~65k matchs, ~1100 equipes

`seed-data.js` requiert `SEED_AUTH_TOKEN`. Toutes les autres fonctions requierent `FUNCTIONS_AUTH_TOKEN` (bypass automatique pour les crons via detection `next_run` dans le body).

## Proxy API

Le frontend n'accede jamais directement a FootyStats. Tout passe par `/.netlify/functions/footystats` qui :
- Ajoute la cle API (serveur uniquement)
- Whitelist 10 endpoints autorises
- CORS restreint a tradingfootalerts.netlify.app
