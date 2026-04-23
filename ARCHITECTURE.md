# Architecture — FHG Tracker

## Pipeline automatique

```
[Netlify Scheduled Functions]
  |
  +-- generate-alerts.js (cron 12h, 6h/18h UTC)
  |     Analyse les matchs des 3 prochains jours
  |     Utilise analysis.cjs (FHG streak v2 + DC H2H)
  |     Insert les alertes dans Supabase (status: pending)
  |
  +-- check-results.js (cron 1h)
  |     Charge les alertes pending dont le kickoff est passe
  |     Evalue FHG_A/B/A+B : buts 31-45 min via goal_events
  |     Evalue DC : resultat final (victoire/nul du cote recommande)
  |     Met a jour status -> validated / lost / expired (>48h)
  |
  +-- daily-seed.js (cron 6h UTC)
        Recupere les matchs d'hier via todays-matches
        Upsert dans h2h_matches avec scores + goal_events
        Mode backfill : ?from=...&to=... (requiert SEED_AUTH_TOKEN)
```

## Supabase — Tables et RLS

Toutes les tables ont RLS active. `service_role` bypass RLS par defaut.

| Table | Colonnes cles | anon | Ecrivain principal |
|-------|--------------|------|-------------------|
| `alerts` | match_id, signal_type, confidence, status, algo_version, user_excluded, user_exclusion_tags | SELECT + UPDATE (exclusion) | generate-alerts.js, check-results.js |
| `trades` | match_id, mise, resultat | ALL | Frontend (utilisateur) |
| `h2h_matches` | match_id, home/away_team_id, goal_events, match_date | SELECT + INSERT + UPDATE | daily-seed.js, seed-data.js, seedClient.js |
| `team_seasons` | team_id, season_id, stats | SELECT | seed-data.js |
| `seed_jobs` | job_id, status, progress | SELECT + INSERT + UPDATE | seed-data.js |

## Algorithme FHG streak v2

Remplace l'ancien score composite 0-100 depuis la session 2026-04-23.

### Deux scenarii independants

**Scenario A** — l'equipe marque en 31-45 :
1. Streak : elle a marque en 31-45 dans les N derniers matchs (dom ou ext selon le role)
2. Confirmation : l'adversaire a concede en 1MT dans >= 60% de ses 5 derniers matchs (min 3)

**Scenario B** — l'adversaire concede en 31-45 :
1. Streak : l'adversaire a concede en 31-45 dans les N derniers matchs
2. Confirmation : l'equipe marque en 1MT dans >= 60% de ses 5 derniers matchs (min 3)

### Signal resultant
- Si A et B : `FHG_A+B` (priorite maximale)
- Si A seul : `FHG_A`
- Si B seul : `FHG_B`

### Niveaux de confiance
| Streak | Confidence |
|--------|-----------|
| >= 3 matchs consec. (STREAK_FORT) | `fort` |
| == 2 matchs consec. (STREAK_MOYEN) | `moyen` |
| A+B avec fort des deux cotes | `fort_double` |

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

### DC (inchange)
Analyse H2H uniquement : % defaite de l'equipe favorite <= 20-30%.
Seuils : fort <= 10%, moyen <= 20%.

## Deux moteurs de scoring (mirroir)

### Server-side : `netlify/functions/lib/analysis.cjs`
- CommonJS, utilise par generate-alerts.js (cron Netlify)
- Fonctions exportees : `analyzeStreakAlert`, `analyzeScenarioA`, `analyzeScenarioB`, `analyzeDCFromH2H`, constantes

### Client-side : `src/lib/core/scoring.js`
- ESM, utilise par MatchCard.svelte sur /matches
- Logique identique a analysis.cjs (duplication intentionnelle : pas de fichier partage CJS/ESM)
- Fonction principale : `analyserStreakFHG`

## Exclusion manuelle

Les alertes pending peuvent etre exclues manuellement :
- Bouton ✕ sur dashboard, /alerts, /historique
- ExcludeAlertModal : 7 tags predifinis + note libre
- Stockage : `user_excluded`, `user_exclusion_tags[]`, `user_exclusion_note`, `user_excluded_at`
- Reinsertion possible via bouton Reintegrer
- Page /historique : stats filtrees sur !user_excluded + section what-if avec Wilson CI

## Calibration des seuils

`scripts/calibrate-threshold.js` — a lancer manuellement avec les vars Supabase :
- Tableau par signal_type (FHG_A, FHG_B, FHG_A+B, DC)
- Tableau par confiance (fort_double, fort, moyen)
- Cross-tab signal_type x confiance
- Wilson CI 95% + recommandations automatiques

## Proxy API

Le frontend n'accede jamais directement a FootyStats. Tout passe par `/.netlify/functions/footystats` qui :
- Ajoute la cle API (serveur uniquement)
- Whitelist 10 endpoints autorises
- CORS restreint a tradingfootalerts.netlify.app

## Authentification seed

`seed-data.js` et `daily-seed.js` (mode backfill) exigent un `SEED_AUTH_TOKEN` dans le header `Authorization: Bearer <token>`. Sans token en env, les fonctions retournent 503. Le token est stocke en localStorage cote debug page.
