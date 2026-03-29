# FHG Tracker

Application de **trading sportif football** qui identifie les matchs avec fort potentiel de but en fin de 1re mi-temps (FHG = First Half Goal) et les opportunites Double Chance (DC).

**URL** : https://tradingfootalerts.netlify.app

## Fonctionnalites

### Alertes autonomes
Le systeme genere automatiquement des alertes toutes les 12h pour les matchs des 3 prochains jours. Chaque alerte est taguee **FHG**, **DC**, ou **FHG+DC** avec un niveau de confiance (fort/moyen).

### Page Alertes
- Affiche les alertes generees avec filtres par jour
- **Expand** sur chaque match : detail des 15 derniers matchs de chaque equipe (domicile pour l'equipe dom, exterieur pour l'equipe ext)
- Barre de timing des buts : chaque but positionne a sa minute exacte sur une barre 0-90 min
- Stats resume : % but 1MT, AVG buts, BTTS%, Over 2.5%

### Page Live
- Surveillance temps reel des matchs alertes en cours
- Refresh automatique toutes les 10 secondes
- Scores live, minute estimee, badges signaux
- Uniquement les matchs dont le kickoff est passe (pas les matchs a venir ni termines)

### Page Double Chance
- Analyse H2H (confrontations directes) sur 5 saisons depuis Supabase
- % defaite H2H, buts moyens, forme recente, MT != FT
- Historique detaille des H2H avec tags

### Page Matchs a venir
- Matchs du jour, demain, apres-demain ou 3 jours
- Filtre par ligue
- Exclusion automatique des matchs deja commences ou termines

### Page Ligues actives
- 50 ligues selectionnees via l'API FootyStats
- Toggle actif/inactif, boutons tout selectionner/deselectionner
- Stats par ligue : 1MT%, AVG, BTTS%, Over 2.5%
- Classement expand

### Page Classements ligues
- Ligues groupees par pays
- Stats et classements detailles

### Compteur API
- Affichage en temps reel dans la sidebar du nombre de requetes API restantes (sur 1800/h)

---

## Algorithme FHG — Analyse comportementale

Le FHG est une analyse de **recurrence individuelle par equipe**, pas de confrontation directe. Chaque equipe est analysee dans son **contexte domicile ou exterieur** (on n'analyse pas les matchs a domicile d'une equipe qui joue a l'exterieur).

### Criteres de selection

| Critere | Description | Poids |
|---------|-------------|-------|
| **Recurrence 1MT** | % des 10 derniers matchs ou l'equipe a marque en 1re mi-temps | 50-55% |
| **2+ buts 1MT** | % des matchs avec 2 buts ou plus marques en 1MT (capacite a marquer meme si but tot) | 15-17% |
| **Adversaire encaisse** | % des matchs ou l'adversaire encaisse en 1MT (dans son contexte) | 25-28% |
| **Reaction quand menee** | Si l'adversaire marque en 1MT, l'equipe repond-elle aussi en 1MT ? | 10% |

### Filtres d'exclusion

| Filtre | Condition | Effet |
|--------|-----------|-------|
| **Minimum matchs** | L'equipe doit avoir au moins 5 matchs recents dans son contexte | Pas d'analyse possible |
| **Clean sheet H2H** | Si >=3 H2H entre les 2 equipes et l'equipe n'a jamais marque en 1MT dans ces H2H | Exclusion ("chat noir") |
| **Adversaire trop solide** | L'adversaire doit avoir encaisse >=1 but dans au moins 2 de ses 5 derniers matchs (dans son contexte) | Exclusion si adversaire ne concede pas assez |

### Seuils de confiance

| Signal | Score composite |
|--------|----------------|
| **Fort** | >= 80% |
| **Moyen** | >= 70% |
| Pas d'alerte | < 70% |

### Verification des resultats

- **Moment** : a la mi-temps (pas a la volee, eviter annulations VAR)
- **Valide** : au moins 1 but en 1MT
- **Perdu** : 0-0 a la mi-temps

---

## Algorithme DC — Analyse H2H

La Double Chance est basee sur les **confrontations directes** (H2H) entre les deux equipes sur 5 saisons.

### Criteres de selection

| Critere | Description |
|---------|-------------|
| **Minimum H2H** | Au moins 5 matchs H2H en base de donnees |
| **% defaite H2H** | Pourcentage de defaites d'un cote (home ou away) dans les H2H |
| **Cote recommandee** | Le cote avec le plus faible % de defaite |

### Seuils de confiance

| Signal | % defaite H2H |
|--------|---------------|
| **Fort** | <= 20% |
| **Moyen** | <= 30% |
| Pas d'alerte | > 30% |

### Verification des resultats

- **Moment** : a la fin du match
- **Valide** : le cote recommande n'a pas perdu (victoire ou nul)
- **Perdu** : le cote recommande a perdu

---

## Architecture technique

| Couche | Tech |
|--------|------|
| Frontend | SvelteKit 2 + Svelte 5 (SPA) |
| Build | Vite 6 |
| Deploiement | Netlify (adapter-netlify) + Netlify Scheduled Functions |
| Donnees matchs | API FootyStats via proxy Netlify securise |
| Base de donnees | Supabase (PostgreSQL) |
| Charts | Chart.js 4.4 |

### Tables Supabase

| Table | Role | Donnees |
|-------|------|---------|
| `h2h_matches` | 70 000+ matchs sur 5 saisons, 50 ligues | Scores, scores MT, minutes des buts |
| `alerts` | Alertes generees automatiquement | Signaux FHG/DC, facteurs, resultats |
| `trades` | Journal des trades | Historique personnel |
| `team_seasons` | Stats equipes par saison | Buts/minute, taux |
| `seed_jobs` | Suivi progression seed | Status, progression |

### Flux de donnees

```
FootyStats API ──> Netlify Proxy ──> Cache localStorage (TTL)
                                          │
Netlify Scheduled Function (12h) ──> Supabase (alerts)
                                          │
Seed (manuel via Debug) ──> Supabase (h2h_matches)
                                          │
Pages Alertes/DC ──> Query Supabase (H2H instantane)
Page Live ──> API temps reel (refresh 10s)
```

### Endpoints API FootyStats

| Endpoint | Usage |
|----------|-------|
| `league-list` | 50 ligues selectionnees |
| `league-matches` | Matchs d'une saison (seed) |
| `todays-matches` | Matchs du jour (live, alertes) |
| `league-season` | Stats agregees ligue |
| `league-tables` | Classement |
| `league-teams` | Equipes + stats |

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Vue d'ensemble |
| Alertes | `/alerts` | Matchs a surveiller (FHG + DC) avec expand detail |
| Live | `/live` | Matchs alertes en cours, scores temps reel |
| Double Chance | `/dc` | Analyse H2H detaillee |
| Matchs a venir | `/matches` | Tous les matchs par date/ligue |
| Classements ligues | `/explore` | Classements par pays |
| Parametres | `/settings` | Configuration utilisateur |
| Ligues actives | `/leagues` | Toggle ligues (Admin) |
| Configuration | `/config` | Config algo (Admin) |
| Debug | `/debug` | Tests API, seed, cache (Admin) |

---

## Developpement

```bash
npm install
npm run dev
```

### Variables d'environnement (Netlify)

- `FOOTYSTATS_API_KEY` — cle API FootyStats
- `SUPABASE_URL` — URL du projet Supabase
- `SUPABASE_ANON_KEY` — cle publique Supabase

### Seed initial

1. Aller sur `/debug`
2. Cliquer sur "Seed complet (toutes les ligues)"
3. Le seed traite 50 ligues x 5 saisons = 250 appels (~15 min)
