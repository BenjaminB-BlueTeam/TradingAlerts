# Refonte /historique — dashboard analytique

- **Date** : 2026-04-23
- **Auteur** : Benjamin (brainstorming avec Claude)
- **Statut** : design validé, prêt pour implémentation

## 1. Objectif

Refondre la page `/historique` pour passer d'une vue liste + KPIs à un **dashboard analytique multi-critères** permettant :

- de visualiser à l'oeil la performance (4 graphiques synthèse),
- de filtrer finement par stratégie, équipe, ligue, confidence, période et statut,
- d'explorer les matchs validés et perdus dans un tableau triable avec expand détaillé (goal-bar + buts),
- de conserver les blocs existants "Mes trades vs Global" et "What-if exclusions".

## 2. Structure de la page

```
┌── H1 Historique ────────────────────────────────────────┐
│ FiltersBar (sticky top)                                  │
│  - Date range picker + presets 7j/30j/90j/1an/Tout       │
│  - Stratégie : Tous / FHG / DC / LG2                     │
│  - Confidence : Tous / fort / moyen / fort_double        │
│  - Équipe : dropdown search                              │
│  - Ligue  : dropdown search                              │
│  - Statut : Tous / Terminées / Validés / Perdus / En cours│
├──────────────────────────────────────────────────────────┤
│ Grille 2x2 :                                             │
│  [Chart A : Évolution]       [Chart B : Stacked stratégie]│
│  [Chart C : Top équipes]     [Chart D : Top ligues]      │
├──────────────────────────────────────────────────────────┤
│ MatchesTable (infinite scroll)                           │
│  Date │ Ligue │ Match │ Score │ HT │ Signal │ Conf │ Résultat│
│  Expand inline par clic (goal-bar + buts)                │
├──────────────────────────────────────────────────────────┤
│ Bloc "Mes trades vs Global" (collapsible <details>)      │
│ Bloc "What-if exclusions" (toggle en haut)               │
└──────────────────────────────────────────────────────────┘
```

## 3. Filtres

Combinaison **AND stricte** : tous les filtres actifs s'additionnent. Les graphiques et le tableau reflètent la même intersection.

État central Svelte 5 :
```js
let filters = $state({
  dateFrom: null,        // ISO YYYY-MM-DD ou null
  dateTo: null,
  strategy: 'tous',      // tous | fhg | dc | lg2
  confidence: 'tous',    // tous | fort | moyen | fort_double
  team: null,            // team_id
  league: null,          // league_name
  status: 'terminees',   // tous | terminees | validated | lost | encours
  evolutionGranularity: 'jour', // jour | mois | année
});
```

**Valeurs par défaut** à l'ouverture : les 90 derniers jours, statut "terminées", reste à "Tous". Calque le comportement actuel au `daysRange = 90`.

**Presets** : boutons "7j / 30j / 90j / 1an / Tout" qui recalculent `dateFrom` en `now - N jours` et forcent `dateTo = null` (aujourd'hui implicite).

**Date range picker** : deux `<input type="date">` natifs HTML5 (pas de lib tierce).

**Dropdowns équipe/ligue** : champ texte avec filtrage en direct ; sélection d'une option la fixe ; "✕" pour réinitialiser.

## 4. Graphiques (Chart.js)

Rendus via composants isolés dans `src/lib/components/historique/`. Chacun reçoit des données agrégées en prop et les dessine.

### Chart A — Évolution du taux
- Line chart, X = dates (jour/mois/année selon granularité), Y = taux %
- **Hybride** :
  - si `filters.strategy === 'tous'` : 3 courbes FHG (vert), DC (bleu), LG2 (orange)
  - sinon : 1 courbe unique de la stratégie active
- Sélecteur Jour/Mois/Année au-dessus (change `filters.evolutionGranularity`)
- Tooltip : "X validés / Y terminés (Z%)" pour le point pointé

### Chart B — Stacked stratégie
- Bar chart vertical empilé, X = FHG / DC / LG2 (ou un seul si filtré)
- Empilement vert (validés) + rouge (perdus)
- Label data sur chaque segment : chiffre exact
- Tooltip : "FHG — 45 validés / 18 perdus (71,4%)"

### Chart C — Top 10 équipes
- Horizontal bar chart
- Y = nom équipe, X = taux de validation
- Tri desc par taux, minimum 3 matchs terminés pour qu'une équipe apparaisse
- Couleur via `pctColor` : vert ≥65%, orange ≥50%, rouge sinon
- Labels : `Real Madrid — 80% (8/10)`

### Chart D — Top 10 ligues
- Idem Chart C mais groupé par `league_name`

**Responsivité** : grid 2x2 desktop, stack vertical (1 col) < 768px. `Chart.update('none')` à chaque changement de filtre pour éviter les animations parasites.

## 5. Tableau de matchs (`MatchesTable.svelte`)

### Colonnes
| # | Colonne | Source | Mobile ? |
|---|---------|--------|----------|
| 1 | Date | `match_date` (format 23/04) | oui |
| 2 | Ligue | `league_name` | non |
| 3 | Match | `home_team_name` vs `away_team_name` | oui |
| 4 | Score | `result_home_goals` - `result_away_goals` | oui |
| 5 | HT | `result_ht_home` - `result_ht_away` | non |
| 6 | Signal | `signal_type` (badge) | non |
| 7 | Confidence | `confidence` (badge) | non |
| 8 | Résultat | `status` → ✓ Validé / ✗ Perdu / EN COURS | oui |

### Tri
Par défaut : date DESC (plus récents en haut). Clic sur un en-tête trie sur cette colonne, reclic inverse l'ordre. Indicator ▲/▼ dans l'en-tête actif.

### Infinite scroll
Batch de **50 lignes**, incrémenté par `IntersectionObserver` sur un sentinel en bas du tableau.

### Expand inline
Clic sur une ligne insère une `<tr>` sous cette ligne contenant :
- Le header `home_team_name vs away_team_name`, score final, score HT
- Une **goal-bar** (réutilise `goalBar()` existant de `teamData.js`) avec les buts de ce match positionnés à leur minute
- Markers HT (50%), 80' (89%), FT (98%) — 80' visible pour les alertes LG2, 45' par défaut pour FHG
- Dots verts = buts équipe DOM, dots rouges = buts équipe EXT
- Tooltip sur chaque but : "Joueur N' (home/away)"

Un seul expand ouvert à la fois : ouvrir une autre ligne ferme la précédente.

## 6. Blocs conservés

### "Mes trades vs Global" (`TradesVsGlobal.svelte`)
- Se met à jour avec les filtres actifs (ex : taux trade FHG Real Madrid vs taux global filtré)
- Rendu sous le tableau, wrappé dans un `<details>` fermé par défaut
- Contenu : Global % / Mes trades % / Écart, avec couleur verte ou rouge selon signe

### "What-if exclusions" (`WhatIfExclusions.svelte`)
- Toggle "Voir exclusions (N)" en haut à droite (comme aujourd'hui)
- En mode exclusions : masque les graphiques standards, affiche les graphiques recalculés sur les exclus + tags avec Wilson CI 95%
- Le tableau reste affiché mais liste les alertes exclues (même colonnes, même tri)

## 7. Architecture des fichiers

### Fichier refondu
```
src/routes/historique/+page.svelte    — orchestration, état global, layout
```

### Nouveaux composants
```
src/lib/components/historique/
  FiltersBar.svelte                    — bloc filtres
  ChartEvolution.svelte                — chart A
  ChartStackedStrategy.svelte          — chart B
  ChartTopTeams.svelte                 — chart C
  ChartTopLeagues.svelte               — chart D
  MatchesTable.svelte                  — tableau + expand
  TradesVsGlobal.svelte                — bloc trades
  WhatIfExclusions.svelte              — bloc what-if
```

### Nouveaux utilitaires
```
src/lib/utils/historyFilters.js        — fonctions pures filtre + agrégations
src/lib/utils/historyFilters.test.js   — tests unitaires
```

### Charts.js étendu
`src/lib/components/charts.js` (existant) gagne des helpers de création partagés (`makeLineChart`, `makeStackedBarChart`, `makeHorizontalBarChart`) pour éviter de réimporter Chart.js dans chaque composant.

## 8. Utilitaires (historyFilters.js)

Fonctions pures, testables :

```js
// Applique tous les filtres actifs, retourne les alertes matchantes
applyFilters(alerts, filters) → alerts[]

// Agrégations pour chaque graphique, calculées sur alerts filtrées
aggregateByStrategy(alerts) → {
  FHG: { validated, lost, total, pct },
  DC:  { ... },
  LG2: { ... },
}

aggregateByTeam(alerts, minMatches = 3, topN = 10) → [
  { teamId, teamName, validated, lost, total, pct }, ...
]

aggregateByLeague(alerts, minMatches = 3, topN = 10) → [
  { leagueName, validated, lost, total, pct }, ...
]

aggregateByDate(alerts, granularity) → [
  { date, FHG: { v, t }, DC: { v, t }, LG2: { v, t } }, ...
]
// granularity : jour → match_date ; mois → YYYY-MM ; année → YYYY
```

Les composants graphes reçoivent le résultat de ces agrégations en prop, pas les alertes brutes : ils restent ignorants du filtre.

## 9. Performance

- Chargement initial : une seule requête Supabase `select * from alerts where match_date >= dateFrom` (filtrage serveur sur la date, filtrage client sur le reste).
- Agrégations via `$derived` → recalcul paresseux.
- Infinite scroll : DOM ≤ 200 lignes en moyenne.
- Charts : `update('none')` sans animation sur changement de filtre.
- Dropdowns : Set précalculée pour le lookup filtre (O(1)).

Volumes attendus (projection) :
- 90j de données : ~2000 alertes max → aucun souci.
- 1 an : ~15000 → toujours OK en mémoire (quelques MB de JSON).
- 3 ans : ~50000 → à revoir, on passerait en Option 2 (requêtes agrégées serveur).

## 10. Tests

**historyFilters.test.js** (~30 tests) :
- `applyFilters` : strategy alone, team alone, combinations AND, date range boundaries, empty filters returns all.
- `aggregateByStrategy` : 3 stratégies mixées, stratégie absente, 0 terminées.
- `aggregateByTeam` / `aggregateByLeague` : tri desc, minMatches respecté, topN tronque, tie-break déterministe.
- `aggregateByDate` : granularité jour/mois/année, regroupement correct, match sans date ignoré.

Pas de tests composant Svelte (cohérent avec le projet : 257 tests mais 0 composant testé en isolation).

## 11. Hors scope (YAGNI)

- Export CSV / PDF des alertes filtrées.
- Graphique "P&L" basé sur stakes/cotes (décision actée : pas de cotes dans l'app).
- Sauvegarde de filtres custom (bookmarks).
- Comparaison entre 2 périodes côte à côte.
- Analyse "avant exclusion / après exclusion" dans le même graphique.
