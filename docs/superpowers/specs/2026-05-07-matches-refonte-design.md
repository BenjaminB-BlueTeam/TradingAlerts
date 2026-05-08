# Refonte "Matchs à venir" — Design Spec

**Date :** 2026-05-07  
**Statut :** Validé  

---

## Contexte

La page `/matches` affiche actuellement les matchs à venir sur 3 jours maximum via un dropdown. La sélection d'équipe filtre uniquement les matchs à venir, sans afficher l'historique de l'équipe. La refonte étend la fenêtre à 30 jours et ajoute un panneau équipe avec les matchs de la saison en cours.

---

## Fonctionnalités

### 1. Navigation dates style Flashscore

**Avant :** dropdown `<select>` avec options fixes (Aujourd'hui / Demain / Après-demain / 3 jours)

**Après :** barre de navigation jour par jour :

```
← Hier  |  Mer. 07/05  |  Demain →
```

- Flèche gauche `←` : jour précédent (min : J-1, pour voir matchs hier terminés)
- Flèche droite `→` : jour suivant (max : J+29, soit 30 jours en avant)
- Date centrale : libellé court (`Aujourd'hui`, `Hier`, ou `Jeu. 08/05`) + cliquable pour revenir à aujourd'hui
- Navigation fluide sans rechargement de page

**Cache :**
- Clé localStorage : `todays-matches-YYYY-MM-DD`
- TTL : 72h (3 jours)
- Utilise le `cache.js` existant (`getCache` / `setCache`)
- Chargement on-demand à la navigation (pas de prefetch)

**Plage API :** `getTodaysMatches(dateStr)` — endpoint FootyStats `todays-matches?date=YYYY-MM-DD`

---

### 2. Panneau équipe (conditionnel)

Affiché **uniquement si une équipe est sélectionnée** via l'autocomplete existant. S'insère entre la barre de navigation et la liste des matchs à venir.

**Structure :**
```
┌─────────────────────────────────────────┐
│ 🔵 PSG — Saison en cours [✕]           │
│ [Domicile ●] [Extérieur]               │
│                                          │
│ 12/04  PSG 2-0 Arsenal   goalbar ● 43' │
│ 05/04  Lyon 1-1 PSG      goalbar  —    │
│ ...    (tous les matchs dom/ext saison) │
└─────────────────────────────────────────┘
```

**Données :**
- Source : table Supabase `h2h_matches` — fonction `loadTeamMatches(teamId, context)` existante
- Pas d'appel API FootyStats supplémentaire
- Contexte par défaut : `home` (domicile)
- Toggle Dom / Ext → recharge le bon contexte (déjà mis en cache dans `teamMatchesCache` state)

**Affichage par match :**
- Date (JJ/MM)
- Adversaire + score
- Goal bar 31-45 min (même composant que l'expand actuel)
- Indicateur but en 31-45 (● ou —)

**Cache :** `teamMatchesCache` state (déjà en place dans la page), rechargement uniquement si absent.

---

### 3. Liste matchs à venir (comportement conservé)

- Si équipe sélectionnée → filtrée sur cette équipe
- Si aucune équipe → tous les matchs de la date
- Tri par `date_unix` croissant
- Exclusion des matchs terminés/en cours (filtre `status !== 'complete'` existant)
- Cards expandables avec goal bars (comportement inchangé)

---

## Architecture — fichiers impactés

| Fichier | Changement |
|---------|-----------|
| `src/routes/matches/+page.svelte` | Navigation dates, panneau équipe, cache TTL 72h |
| `src/lib/api/cache.js` | Aucun changement (utilisé tel quel) |
| `src/lib/api/footystats.js` | Aucun changement (`getTodaysMatches` accepte déjà une date) |
| `src/lib/utils/teamData.js` | Aucun changement (`loadTeamMatches` réutilisée) |

Un seul fichier modifié : `+page.svelte`.

---

## Ce qui NE change PAS

- Filtre ligue (dropdown)
- Autocomplete équipe (recherche Supabase `teams`)
- Cards matchs expandables + goal bars H2H
- Stats LG1 31-45 par équipe dans les cards
- LG1 streak affiché dans les cards

---

## Contraintes

- Quota API FootyStats : 1 appel par date naviguée (cache évite les doublons)
- TTL 72h : matchs passés = score définitif, matchs futurs = changements rares
- Pas de prefetch : chargement on-demand uniquement
- Svelte 5 runes exclusivement (`$state`, `$derived`, `$effect`)
- Aucune nouvelle dépendance npm

---

## Hors scope

- Prefetch ±1 jour (à envisager après si navigation trop lente)
- Page dédiée profil équipe
- Statistiques avancées équipe (ELO, forme, classement)
- Notifications fixtures
