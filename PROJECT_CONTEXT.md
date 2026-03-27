# FHG Tracker — Contexte Projet

> Fichier de référence : état du projet, décisions techniques, historique des livraisons.
> À mettre à jour à chaque feature déployée.

---

## Vue d'ensemble

Application web de **trading sportif** basée sur la méthode FHG (First Half Goal) + Double Chance.
- Stack : Vanilla JS ES6+ (modules natifs), Chart.js, CSS custom properties
- Hébergement cible : **Netlify** (déploiement depuis la branche `main`)
- Pas de framework front (pas de React/Vue/Angular)
- Pas de bundler pour l'instant (fichiers servis directement)

---

## Branches actives

| Branche | Rôle |
|---|---|
| `main` | Production — **on ne dev jamais ici directement** |
| `claude/sports-trading-app-GHSTb` | Branche de livraison initiale (v1.0 complète) |

> **Règle absolue** : toute nouvelle fonctionnalité = nouvelle branche dédiée.

---

## Ce qui a été livré (v1.0)

**Commit** : `589d291` — branche `claude/sports-trading-app-GHSTb`

### Architecture fichiers

```
/
├── index.html                    — SPA, modules ES6 natifs
├── netlify.toml                  — Config Netlify (publish = ".")
├── src/
│   ├── css/
│   │   ├── main.css              — Design system, layout, variables CSS
│   │   ├── components.css        — 40+ composants réutilisables
│   │   └── responsive.css        — Mobile-first (breakpoints 768px / 480px)
│   └── js/
│       ├── api/
│       │   ├── footystats.js     — Client API FootyStats (tous endpoints)
│       │   └── cache.js          — Cache localStorage TTL 15min
│       ├── core/
│       │   ├── scoring.js        — Formule FHG (6 étapes) + DC + timer
│       │   ├── h2h.js            — Filtre Clean Sheet H2H
│       │   └── filters.js        — Filtres, tris, stats dashboard
│       ├── store/
│       │   └── store.js          — State management pub/sub + localStorage
│       ├── components/
│       │   ├── sidebar.js        — Navigation, routing, statut API
│       │   ├── matchCard.js      — Carte match dépliable + table row
│       │   ├── charts.js         — Wrappers Chart.js (distribution, sparkline, donut)
│       │   └── modal.js          — Modales, toast notifications
│       ├── pages/
│       │   ├── dashboard.js      — Page principale + mode Focus
│       │   ├── matches.js        — Matchs à venir + filtres
│       │   ├── leagues.js        — Ligues actives + stats
│       │   ├── alerts.js         — Config alertes + historique simple
│       │   └── settings.js       — Paramètres, journal trades, bankroll
│       └── app.js                — Entrée, mock data, routing
```

### Fonctionnalités livrées

- [x] Design system dark mode complet (CSS custom properties)
- [x] Sidebar fixe desktop / drawer mobile avec burger menu
- [x] 5 pages : Dashboard, Matchs à venir, Ligues, Alertes, Paramètres
- [x] Scoring FHG : formule complète 6 étapes
  - Saison N × 0.60 + N-1 × 0.25 + Forme × 0.15
  - Bonus 1MT 50%+ (badge violet)
  - Pénalité H2H orange (-8 pts)
  - Malus début de saison (-10 pts)
  - Stabilité inter-saisons (±3/5 pts)
- [x] Filtre H2H Clean Sheet (exclusion automatique, règle absolue)
- [x] 6 matchs mock de démonstration (dont 1 exclu H2H)
- [x] Mode démonstration (sans clé API)
- [x] Cartes match dépliables : graphique buts, SVG progress, timeline H2H, checklist, DC
- [x] Page Matchs à venir : tableau filtrable (ligue, signal, contexte, 1MT)
- [x] Page Ligues : stats par ligue, toggle activer/désactiver
- [x] Page Alertes : sliders config, profil joueur, historique basique
- [x] Page Paramètres : clé API, sélection ligues, journal trades, bankroll
- [x] Journal trades avec export CSV
- [x] Calcul bankroll avec 4 scénarios 30 jours
- [x] Stats personnelles (taux réussite, H2H vert vs orange, badge 1MT)
- [x] Mode Focus session (plein écran)
- [x] Bouton PAUSE SESSION
- [x] Toast notifications
- [x] Cache API (localStorage, TTL 15 min)
- [x] Responsive mobile-first

### Limites connues de la v1.0

- Journal trades stocké dans `localStorage` → limité à ~5MB, lié à l'appareil
- Historique alertes dans la page Alertes : fonctionnalité basique (pas de page dédiée)
- Pas de backend → pas de sync multi-device
- Pas d'authentification
- Les données API FootyStats N-1 et "5 derniers matchs" nécessitent un enrichissement manuel

---

## Ce qui reste à faire (Backlog)

### Priorité HAUTE

- [ ] **Page Historique Alertes** (feature complète — voir IDEAS.md)
  - Backlog de toutes les alertes passées
  - Indicateur succès/échec
  - Modal "ai-je pris l'alerte ?" → cote + montant → calcul gain/perte
  - Total gain/perte en bas
  - Filtres date + toggle "prises uniquement"
  - Dashboard analytics (ligues rentables, équipes, cotes moyennes)
  - → **Nécessite décision base de données** (voir section DB ci-dessous)

### Priorité MOYENNE

- [ ] Intégration API FootyStats réelle (calcul des 5 derniers matchs, N-1)
- [ ] Notifications navigateur (Web Push ou polling)
- [ ] Synchronisation multi-device des trades
- [ ] Page d'onboarding (premier lancement, guide de la méthode)
- [ ] Graphique radar de comparaison équipes
- [ ] Import CSV du journal de trades

### Priorité BASSE / Idées

- [ ] Mode hors ligne complet (PWA / Service Worker)
- [ ] Export PDF rapport hebdomadaire
- [ ] Widget "prochaine fenêtre" (overlay flottant)
- [ ] Partage de fiches trade (lien public anonymisé)
- [ ] Support multi-langue (FR/EN)

---

## Décisions techniques

### Base de données — État actuel vs Long terme

**Actuellement** : `localStorage` uniquement
- Avantages : zéro infrastructure, fonctionne hors ligne
- Limites : ~5MB max, device-only, pas de backup, pas de sync

**Recommandation long terme : Supabase (PostgreSQL)**

| Option | Type | Avantages | Inconvénients |
|---|---|---|---|
| `localStorage` | Browser | Zero infra, offline | 5MB, device-only |
| `IndexedDB` | Browser | Plus grande capacité | Toujours device-only |
| **Supabase** ⭐ | Cloud (PostgreSQL) | SQL, free tier généreux, SDK JS, auth intégrée, self-hostable | Nécessite backend léger |
| Firebase Firestore | Cloud (NoSQL) | Temps réel, Google | Vendor lock-in, NoSQL moins adapté |
| PocketBase | Self-hosted | Léger, SQL-like | Nécessite un serveur |

**Choix recommandé : Supabase**
- Free tier : 500MB DB, 2GB transfer, auth incluse
- SDK JavaScript natif, compatible avec l'architecture actuelle
- PostgreSQL → requêtes SQL pour les analytics (ligues rentables, etc.)
- Peut être ajouté sans tout réécrire (migration progressive depuis localStorage)
- Self-hostable si besoin de souveraineté des données

**Plan de migration** :
1. Feature Historique Alertes → localStorage d'abord (MVP rapide)
2. Ajouter Supabase en option (toggle "sync cloud" dans Paramètres)
3. Migration transparente des données existantes

---

## Stack technique — Résumé

| Couche | Techno | Raison |
|---|---|---|
| Front | Vanilla JS ES6+ | Pas de dépendance, performance, maintenabilité |
| Charts | Chart.js 4.x (CDN) | Léger, bien documenté |
| Fonts | Inter (Google Fonts) | Design system |
| State | Custom pub/sub store | Aucune dépendance |
| Persistence | localStorage | MVP — migration Supabase prévue |
| API | FootyStats | Seule API football avec stats 31-45min |
| Déploiement | Netlify | Free, CD depuis GitHub |
| DB future | Supabase | PostgreSQL managé, free tier |

---

## Conventions de développement

- **1 feature = 1 branche** : `feature/nom-court` ou `fix/nom-court`
- Commits en français ou anglais mais descriptifs
- CSS : classes BEM légères + utilitaires (pas de framework CSS)
- JS : modules ES6 natifs, `import/export`, pas de bundler obligatoire
- Pas de `console.log` en production (utiliser les toasts pour le feedback user)
- Les données sensibles (clé API) ne vont jamais dans Git

---

## Dernière mise à jour

2026-03-27 — v1.0 livrée, projet initialisé
