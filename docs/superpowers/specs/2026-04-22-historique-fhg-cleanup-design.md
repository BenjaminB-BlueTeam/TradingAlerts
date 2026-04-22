# Design — Historique alertes + Affinage FHG 31-45 min + Nettoyage /dc

Date : 2026-04-22

---

## Partie 1 : Page Historique des Alertes (`/historique`)

### Route & navigation
- Nouvelle route : `src/routes/historique/+page.svelte`
- Ajoutée dans `Sidebar.svelte` entre "Sélection DC" et "Matchs à venir"
- Icône : 📈

### Section stats (haut de page)
Calculée uniquement sur les alertes `validated` + `lost` (les `pending` sont exclus des KPIs).

**Ligne 1 — 3 KPI cards** :
- Global % = validated / (validated + lost)
- FHG % = validated FHG / (validated + lost) FHG — inclut signal_type FHG et FHG+DC
- DC % = validated DC / (validated + lost) DC — inclut signal_type DC et FHG+DC

**Ligne 2 — 2 barres de progression** :
- Confiance fort % = validated fort / (validated + lost) fort
- Confiance moyen % = validated moyen / (validated + lost) moyen

**Tableau par ligue** :
- Colonnes : Ligue | ✓ (validated) | ✗ (lost) | Taux %
- Trié par taux décroissant
- Généré côté client depuis les alertes déjà chargées (pas de requête séparée)

### Filtres
Boutons pill au-dessus de la liste :
`Tous` | `FHG` | `DC` | `Validé` | `Perdu` | `En cours`
- FHG = signal_type in ['FHG', 'FHG+DC']
- DC = signal_type in ['DC', 'FHG+DC']
- En cours = status 'pending' + kickoff_unix passé + < 7200s

### Liste des alertes
- Toutes les alertes Supabase (sans restriction de date)
- Triée par date décroissante (kickoff_unix desc)
- Colonnes : Date (JJ/MM) | Ligue | Match (Home - Away) | Type | Résultat
- Résultat affiché : `✓ Validé` (vert) | `✗ Perdu` (rouge) | `EN COURS` (orange animé) | `En attente` (gris)

### Données
- Source : Supabase `alerts`, select `*`, order `kickoff_unix desc`
- Chargement unique au mount, pas de pagination (volume faible attendu)

---

## Partie 2 : Affinage FHG fenêtre 31-45 min

### Contexte
Dans `generate-alerts.js`, le scoring FHG compte actuellement les buts sur toute la 1MT via les champs agrégés. Les `h2h_matches` contiennent un champ `goal_events` (JSON array) avec les minutes de chaque but.

### Changement
Dans la fonction d'analyse FHG de `generate-alerts.js` :
- Parser `goal_events` pour chaque match récent de l'équipe
- Compter uniquement les buts en minutes 31–45 (inclus)
- Les ratios/taux FHG utilisés dans le scoring sont recalculés sur cette fenêtre

### Périmètre
- `generate-alerts.js` uniquement — la logique d'analyse FHG
- `check-results.js` non touché (utilise `ht_goals_team_a/b` pour la vérification résultat, pas pour l'analyse)
- Vérifier le format exact de `goal_events` dans Supabase avant d'implémenter

### Format attendu de goal_events
À vérifier via la page Debug avant implémentation. Format probable :
```json
[{"minute": 23, "team": "home"}, {"minute": 38, "team": "away"}]
```
ou tableau de minutes simples `[23, 38]`.

---

## Partie 3 : Nettoyage `/dc`

- Supprimer `src/routes/dc/` (dossier entier)
- Route legacy, plus référencée dans la navigation depuis le commit a1bbc1f
- Aucune autre référence à nettoyer (vérifié : non importée ailleurs)

---

## Ordre d'implémentation suggéré

1. Nettoyage `/dc` — trivial, fait en premier
2. Page Historique — nouvelle page autonome, pas de dépendance
3. Affinage FHG 31-45 min — nécessite vérification format `goal_events` d'abord
