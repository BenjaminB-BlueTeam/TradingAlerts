# CLAUDE.md — FHG Tracker

Fichier chargé automatiquement par Claude à chaque session. Contient tout le contexte nécessaire pour continuer le projet sans répéter le briefing.

---

## Projet

App SPA vanilla JS de **trading sportif football**. Identifie les matchs avec fort potentiel de but entre la **31e et 45e minute** (FHG = First Half Goal).

- **Repo GitHub** : BenjaminB-BlueTeam/TradingAlerts
- **Déploiement** : Netlify (SPA redirect configuré)
- **Utilisateur** : Benjamin — usage solo, francophone

---

## Stack technique

| Couche | Tech |
|--------|------|
| Frontend | HTML / CSS / JS ES Modules (vanilla, sans framework) |
| Déploiement | Netlify + Netlify Functions |
| Données | API FootyStats (`football-data-api.com`) via proxy Netlify sécurisé |
| Persistance | Supabase (PostgreSQL) — trades, historique |
| Charts | Chart.js 4.4 |
| Clé API | `FOOTYSTATS_API_KEY` en variable d'env Netlify (jamais côté browser) |

---

## Architecture des fichiers

```
index.html
netlify.toml
netlify/functions/footystats.js   ← proxy sécurisé API
src/
  css/
    main.css          — variables CSS, reset, layout
    components.css    — composants UI
    responsive.css    — media queries
  js/
    app.js            — point d'entrée, routing, refresh auto 10min
    store/store.js    — état global pub/sub + localStorage
    api/
      footystats.js   — appels API via proxy, cache TTL
      cache.js        — cache mémoire TTL par endpoint
    core/
      scoring.js      — algorithme FHG + DC
      h2h.js          — analyse head-to-head
      filters.js      — filtrage/tri des signaux
      mockData.js     — données démo (sans clé API)
    components/
      matchCard.js    — carte match (résumé + détail dépliable)
      charts.js       — graphiques Chart.js
      modal.js        — modale globale
      sidebar.js      — navigation
    pages/
      dashboard.js    — signaux du jour
      matches.js      — matchs à venir
      leagues.js      — ligues actives
      alerts.js       — alertes + paramètres algo
      settings.js     — config clé API, profil
```

---

## Algorithme FHG actuel (scoring.js)

Score 0-100 calculé par équipe (domicile ET extérieur, meilleur retenu) :

1. **Filtre H2H Clean Sheet** (priorité absolue) — si ≥3 H2H et 0 but avant 45min → exclusion totale
2. **Score de base** : 60% × taux N + 25% × taux N-1 + 15% × forme 5 derniers matchs
3. **Bonus 1MT** : +4 pts (≥50%) ou +8 pts (≥65%) si l'équipe score souvent en 1MT
4. **Stabilité inter-saisons** : +3 pts si écart ≤8%, -5 pts si >15%
5. **Malus début de saison** : -10 pts si <8 matchs joués

**Seuils** : Fort ≥75 | Moyen ≥60 | Faible <60

**Score DC** : calculé si FHG ≥60, basé sur pct retour si encaisse + force FHG + avantage domicile.

> ⚠ Ce système de scoring est **prévu pour être remplacé** par des % bruts — voir roadmap.

---

## Ce qui est implémenté

- Dashboard signaux FHG, filtre H2H Clean Sheet, mode Focus
- Supabase connecté (persistance trades)
- Proxy Netlify sécurisé (clé API en env var)
- Journal trades : stats, export CSV, calcul bankroll
- **Goal Timeline H2H** — barre de timing des buts style FootyStats dans la section H2H des cartes match :
  - ⚽ coloré = but marqué par l'équipe ciblée
  - ⚽ grisé = but encaissé (adversaire)
  - Marqueurs HT et FT sur la barre
  - Données `goals: [{minute, scored}]` dans mockData
  - En prod : mapper depuis le champ `goalscorer` de l'endpoint `match` FootyStats (structure à vérifier en loggant une vraie réponse)

---

## Roadmap — décisions prises

Ces décisions sont actées, ne pas remettre en question sauf si Benjamin le demande explicitement :

1. **Supprimer le scoring 0-100** → remplacer par des **% bruts** (saison, 5 derniers, 10 derniers matchs)
2. **DC analysée indépendamment du FHG** (plus de condition FHG ≥60)
3. **Carte avec les 2 badges FHG + DC** apparaît dans les 2 sections du dashboard
4. **Stats FHG et DC trackées séparément** en Supabase
5. **Bouton "Analyse IA"** sur chaque carte (Claude API, résultat mis en cache Supabase)
6. **Table `team_seasons`** à construire en Supabase : 3 saisons de données (buts par minute, comebacks, victoires/défaites)
7. **Seed FootyStats → Supabase** via Netlify Function

### Prochaines étapes prioritaires

- [ ] Refonte DB Supabase — table `team_seasons`
- [ ] Refonte algo — % bruts sans scoring
- [ ] Refonte cartes — badges FHG + DC indépendants, bouton "Analyse IA"
- [ ] Adapter `renderGoalTimeline` aux vrais champs FootyStats API en prod
- [ ] Page Historique des Alertes

---

## Conventions de développement

- **Vanilla JS uniquement** — pas de framework, pas de build step
- **Pas de modification du store global** sans vérifier les subscribers existants
- **Toute nouvelle feature** : légère, compatible Netlify static + Supabase
- **CSS** : utiliser les variables CSS existantes (`--color-*`, `--radius-*`, etc.) — ne pas coder de couleurs en dur sauf pour des éléments très spécifiques (ex: fond de la goal timeline)
- **Mode démo** : toute nouvelle feature avec données API doit avoir un fallback dans `mockData.js`
- **Clé API** : ne jamais l'exposer côté browser — toujours passer par `/.netlify/functions/footystats`

## Conventions git

- Commit directement sur `main` pour les features solo (pas de PR obligatoire)
- Toujours pusher `PROJECT_CONTEXT.md` après une session de travail
- Push + merge autonome autorisé si Benjamin le demande explicitement dans la session
