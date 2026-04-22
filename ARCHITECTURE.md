# Architecture — FHG Tracker

## Pipeline automatique

```
[Netlify Scheduled Functions]
  |
  +-- generate-alerts.js (cron 12h, 6h/18h UTC)
  |     Analyse les matchs des 3 prochains jours
  |     Utilise analysis.cjs (FHG comportemental + DC H2H)
  |     Insert les alertes dans Supabase (status: pending)
  |
  +-- check-results.js (cron 1h)
  |     Charge les alertes pending dont le kickoff est passe
  |     Evalue FHG : buts 31-45 min via goal_events
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
| `alerts` | match_id, signal_type, fhg_pct, dc_defeat_pct, status, confidence | SELECT | generate-alerts.js, check-results.js |
| `trades` | match_id, mise, resultat | ALL | Frontend (utilisateur) |
| `h2h_matches` | match_id, home/away_team_id, goal_events, match_date | SELECT + INSERT + UPDATE | daily-seed.js, seed-data.js, seedClient.js |
| `team_seasons` | team_id, season_id, stats | SELECT | seed-data.js |
| `seed_jobs` | job_id, status, progress | SELECT + INSERT + UPDATE | seed-data.js |

## Deux moteurs de scoring

### Server-side : `analysis.cjs` (alertes automatiques)
- Utilise par `generate-alerts.js` (cron)
- Analyse les matchs Supabase (h2h_matches) pour chaque equipe
- Formule composite FHG : pct1MT x 0.50 + pctAdversaire x 0.25 + pct2Plus1MT x 0.15 + pctReaction x 0.10
- Note : pct2Plus1MT est un sous-ensemble de pct1MT (si 2+ buts en 1MT, forcement 1+ but en 1MT). C'est un bonus explosivite intentionnel, pas une dimension independante.
- Filtre clean sheet H2H : si >=3 H2H et l'equipe n'a jamais marque (toutes minutes) → exclusion
- Seuils FHG : fort >= 65%, moyen >= 50% (adaptes a la fenetre 31-45 min)
- Seuils DC : fort >= 80% victoire (win+nul), moyen >= 70%
- FHG et DC creent des alertes separees (pas de tag combine)
- generate-alerts accepte ?type=FHG ou ?type=DC pour generation manuelle

### Client-side : `scoring.js` (exploration interactive)
- Utilise par MatchCard.svelte sur la page /matches
- Meme formule et memes seuils que analysis.cjs
- Difference : travaille sur les donnees chargees a la volee depuis Supabase, pas en batch

Les deux coexistent volontairement : le cron pre-calcule les alertes, le client permet l'exploration manuelle.

## Proxy API

Le frontend n'accede jamais directement a FootyStats. Tout passe par `/.netlify/functions/footystats` qui :
- Ajoute la cle API (serveur uniquement)
- Whitelist 10 endpoints autorises
- CORS restreint a tradingfootalerts.netlify.app

## Authentification seed

`seed-data.js` et `daily-seed.js` (mode backfill) exigent un `SEED_AUTH_TOKEN` dans le header `Authorization: Bearer <token>`. Sans token en env, les fonctions retournent 503. Le token est stocke en localStorage cote debug page.
