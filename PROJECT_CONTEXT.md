# PROJECT CONTEXT — FHG Tracker

---

## Concept
Application web de **trading sportif** sur le football.
Identifie les matchs avec fort potentiel de but entre la **31e et 45e minute** (First Half Goal = FHG).
Basée sur l'API **FootyStats** (`football-data-api.com`).

---

## Stack technique
- **Frontend** : HTML / CSS / JavaScript ES Modules (vanilla, sans framework)
- **Déploiement** : Netlify (SPA redirect configuré)
- **Données** : API FootyStats + mode démo (mockData.js)
- **Persistance** : localStorage (clé API, config, trades, préférences)
- **Charts** : Chart.js 4.4

---

## Architecture des fichiers
```
index.html                  — HTML unique (SPA)
netlify.toml                — Config Netlify
src/
  css/
    main.css                — Styles globaux, variables CSS, layout
    components.css          — Composants UI (cards, badges, modales...)
    responsive.css          — Media queries
  js/
    app.js                  — Point d'entrée, navigation, refresh auto 10min
    store/store.js          — État global (pub/sub + localStorage)
    api/
      footystats.js         — Appels API avec cache TTL
      cache.js              — Cache mémoire avec TTL par endpoint
    core/
      scoring.js            — Algorithme FHG + DC (cœur métier)
      h2h.js                — Analyse head-to-head
      filters.js            — Filtrage et tri des signaux
      mockData.js           — Données fictives pour mode démo
    components/
      sidebar.js            — Navigation latérale
      modal.js              — Modale globale réutilisable
      matchCard.js          — Carte d'un match/signal
      charts.js             — Graphiques Chart.js
    pages/
      dashboard.js          — Page principale (signaux du jour)
      matches.js            — Matchs à venir
      leagues.js            — Gestion des ligues actives
      alerts.js             — Alertes actives
      settings.js           — Config clé API, paramètres algo
```

---

## Algorithme FHG (scoring.js)

Score calculé par équipe (domicile ET extérieur, on prend le meilleur) :

1. **Filtre H2H Clean Sheet** (priorité absolue) :
   - Si ≥3 H2H et 0 but avant 45min → exclusion totale
   - Si 1 seul but → warning orange (-8 pts)
   - Si ≥2 buts → vert

2. **Score de base** :
   - 60% × taux buts 31-45min saison N
   - 25% × taux buts 31-45min saison N-1
   - 15% × forme 5 derniers matchs

3. **Bonus 1MT** : +4 pts (≥50%) ou +8 pts (≥65%) si l'équipe score souvent en 1ère mi-temps

4. **Stabilité inter-saisons** : +3 pts si écart N/N-1 ≤8%, -5 pts si >15%

5. **Malus début de saison** : -10 pts si <8 matchs joués

**Seuils signal** : Fort ≥75 | Moyen ≥60 | Faible <60

**Score DC** (Double Chance) : calculé uniquement si FHG ≥60, basé sur pct retour si encaisse + force FHG + avantage domicile.

---

## Pages de l'app
| Page | Description |
|------|-------------|
| Dashboard | Signaux du jour triés par score FHG |
| Matchs à venir | Liste des matchs des ligues actives |
| Ligues actives | Activer/désactiver les ligues suivies |
| Alertes | Alertes en temps réel (session en cours) |
| Paramètres | Clé API, config algo, profil (débutant/intermédiaire/expert) |

---

## État actuel du projet

### ✅ Fait
- Structure complète de l'app (SPA, routing, store, composants)
- Algorithme FHG + DC implémenté
- Intégration API FootyStats avec cache TTL
- Mode démo fonctionnel (mockData)
- Gestion des trades en localStorage
- Dashboard avec statistiques trades
- Déploiement Netlify configuré
- Design responsive (mobile + desktop)

### 🔄 En cours / À affiner
- (rien en cours pour l'instant)

### 📋 À faire (voir IDEAS.md pour le détail)
- [ ] **Page Historique des Alertes** — backlog complet avec gain/perte, filtres, dashboard stats
- [ ] Notifications push / alertes temps réel
- [ ] Export CSV/PDF
- [ ] Mode Focus Session
- [ ] Comparaison de ligues
- [ ] Backtesting

---

## Décisions techniques notables
- Pas de framework JS (vanilla ES Modules) — volonté de légèreté et contrôle total
- localStorage pour la persistance → migration Supabase envisagée (voir IDEAS.md)
- Mode démo intégré pour tester sans clé API
- Rafraîchissement automatique toutes les 10 minutes (pause possible)
- L'API FootyStats n'a pas d'endpoint H2H direct → filtrage depuis `league-matches`

---

## Dev local
```bash
# Lancer le serveur de développement
cd "Alerte Trading Football"
python -m http.server 3000
# → http://localhost:3000
```
