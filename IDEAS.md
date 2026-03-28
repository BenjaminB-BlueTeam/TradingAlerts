# IDEAS — FHG Tracker

Ce fichier recense les idées de fonctionnalités à explorer, avec leur statut et leur priorité.

---

## Statuts
- `[ ]` À faire
- `[~]` En cours de réflexion / à affiner
- `[x]` Implémenté

---

## Idées

### [~] Page Historique des Alertes (Backlog)
**Priorité : Haute**

Page dédiée à l'historique complet des alertes générées par l'app.

#### Fonctionnalités détaillées :
- Liste paginée de toutes les alertes passées (date, match, équipe ciblée, score FHG)
- **Indicateur visuel** par alerte : succès / échec / non renseigné
- **Bouton "Enregistrer"** sur chaque alerte → ouvre une modale :
  - "Avez-vous pris cette alerte ?" (Oui / Non)
  - Si Oui : saisie de la **côte** et du **montant parié**
  - Calcul automatique du **gain/perte** affiché sur la ligne
- **Total gain/perte** en bas de la liste
- **Filtres** :
  - Par tranche de dates (date picker)
  - Toggle "Afficher uniquement les alertes jouées"
- **Dashboard de stats** sur les alertes jouées :
  - Taux de succès global
  - ROI
  - Gain/perte cumulé
  - Comparaison avec/sans badge 1MT
  - Comparaison H2H vert / orange / insuffisant
  - Série en cours (win streak / loss streak)

#### Question base de données → voir section Infrastructure

---

### [ ] Notifications push / alertes temps réel
Notifier l'utilisateur quand un signal fort apparaît, même si l'onglet est en arrière-plan.
- Service Worker + Web Push API
- Ou intégration Telegram Bot

---

### [ ] Export CSV / PDF des trades
Exporter l'historique pour analyse externe (Excel, Google Sheets).

---

### [ ] Mode "Focus Session"
Masquer toutes les infos non essentielles, ne montrer que les signaux du jour avec le timer.

---

### [ ] Comparaison de ligues
Vue comparative des performances FHG par ligue sur la saison.

---

### [ ] Backtesting
Simuler l'algo FHG sur des données historiques pour valider les paramètres.

---

## Infrastructure

### Base de données — Recommandation long terme

**Option recommandée : Supabase**
- PostgreSQL managé, gratuit jusqu'à 500MB
- SDK JavaScript simple, fonctionne en client-side pur
- Auth intégrée (si on veut multi-comptes plus tard)
- Temps réel via WebSockets
- Compatible Netlify sans backend
- Migration facile depuis localStorage

**Alternatives :**
- `Firebase Firestore` — NoSQL, bonne option mais vendor lock-in Google
- `PocketBase` — self-hosted, excellent mais nécessite un serveur
- `localStorage` (actuel) — suffisant pour usage solo mono-device, limité à ~5MB

**Plan de migration suggéré :**
1. Court terme : continuer localStorage (déjà en place)
2. Moyen terme : ajouter Supabase pour l'historique des alertes uniquement
3. Long terme : migrer tous les trades et config vers Supabase
