# SPEC Streak v2 — Algo FHG

> Validée avec Benjamin le 2026-04-23 (Phase 0).
> Référence technique pendant l'implémentation.

---

## Contexte

L'app TradingAlerts génère des alertes FHG (First Half Goal, fenêtre 31-45 min) pour le live trading football.  
Benjamin entre en position à 31-35' quand la cote "but avant MT" monte ≥ 2.10.  
**Seul KPI = % de réussite. Pas de cotes / ROI dans l'app.**

Cette spec remplace l'ancien algorithme FHG composite (score 0-100 avec coefficients 0.50/0.25/0.15/0.10) par une **logique streak** à deux scénarios indépendants.

---

## Règles absolues

- [ARCHIVÉ 2026-05-07] La logique DC a été supprimée de l'app. Les colonnes `dc_*` et les données historiques sont conservées en BDD sans modification du schéma.
- Pas de migration TypeScript — reste JS/ESM + CommonJS selon contexte.
- Pas de cotes / ROI / ML / IA prédictive.
- Confirmation Benjamin requise avant : SQL en prod Supabase, suppression fichier, modif `analysis.cjs`.

---

## Quatre scénarios FHG

Les scénarios sont évalués sur **chaque équipe** du match (home ciblée ET away ciblée). La meilleure confidence est retenue.

**Priorité d'évaluation** : A et B sont évalués en premier. C et D ne s'évaluent que si A **et** B sont tous les deux inactifs (fallback). Si C et D sont tous les deux actifs, C prend la priorité — il n'existe pas de signal `FHG_C+D`.

### Scénario A — Offensif

> "L'équipe marque 31-45 de façon récurrente"

- **Signal principal** : streak consécutif (depuis le match le plus récent) où l'équipe a marqué entre 31-45 min (`e.min >= 31 && e.min <= 45`), filtré par contexte (home → matchs home uniquement).
- **Signal de confirmation** : l'adversaire a encaissé en **1MT (0-45)** dans ≥ 60% de ses 5 derniers matchs dans le contexte opposé.

### Scénario B — Défensif

> "L'adversaire encaisse 31-45 de façon récurrente"

- **Signal principal** : streak consécutif où l'adversaire a encaissé entre 31-45, filtré par contexte opposé.
- **Signal de confirmation** : l'équipe ciblée a marqué en **1MT (0-45)** dans ≥ 60% de ses 5 derniers matchs dans le contexte du match à venir.

### Scénario C — Streak court, confirmation maximale

> "Streak trop court pour A, mais l'adversaire est ultra-fiable en 1MT"

Fallback activé uniquement si A et B sont tous deux inactifs.

- **Signal principal** : streak consécutif de l'équipe en 31-45 === `STREAK_MOYEN` (exactement 2). Si le streak est ≥ 3, le scénario A se serait déclenché à la place.
- **Signal de confirmation** : l'adversaire a encaissé en **1MT (0-45)** dans les `CONFIRM_WINDOW` (3) derniers matchs **et** ce count est ≥ `CONFIRM_WINDOW` (3 sur 3 = 100%).
- **Confidence** : `moyen`
- **Contexte** : même filtrage dom/ext que A (teamMatches déjà filtrés par contexte). Veto H2H appliqué.

Exemple : équipe marqué en 31-45 lors de ses 2 derniers matchs à dom, et l'adversaire a encaissé en 1MT lors de ses 3 derniers matchs ext → `FHG_C` moyen.

### Scénario D — Double activité 31-45

> "Beaucoup de buts dans la fenêtre 31-45 des deux côtés"

Fallback activé uniquement si A et B sont tous deux inactifs. Si C est aussi actif, C prend la priorité sur D.

- **Signal principal** : l'équipe a **marqué** ≥ `CONFIRM_MIN_COUNT` (1) en 31-45 **ET** **encaissé** ≥ `CONFIRM_MIN_COUNT` (1) en 31-45, dans les `CONFIRM_WINDOW` (3) derniers matchs dans son contexte (dom ou ext).
- **Signal de confirmation** : l'adversaire a **marqué en 1MT (0-45)** dans ≥ `CONFIRM_MIN_COUNT` (1) de ses `CONFIRM_WINDOW` (3) derniers matchs dans son contexte opposé.
- **Confidence** : `moyen`
- **Contexte** : même filtrage dom/ext que A/B. Veto H2H appliqué. Requiert ≥ `STREAK_MIN_MATCHES` (3) matchs historiques pour les **deux** équipes.

Exemple : équipe a marqué en 31-45 dans 2 de ses 3 derniers matchs à dom et encaissé en 31-45 dans 1 de ces 3 matchs, et l'adversaire a marqué en 1MT lors d'au moins 1 de ses 3 derniers matchs ext → `FHG_D` moyen.

---

## Règles communes

### Filtrage par contexte (systématique)

| Équipe ciblée | Matchs utilisés |
|---------------|-----------------|
| Home | Matchs à domicile uniquement |
| Away | Matchs à l'extérieur uniquement |

L'adversaire est filtré dans le contexte **opposé**.

### Veto H2H (appliqué à tous les scénarios)

Si H2H ≥ 3 **et** l'équipe ciblée n'a **jamais marqué en 1MT (0-45)** dans ces H2H → exclusion totale, pas d'alerte. Aucun scénario (A, B, C, D) n'est évalué.  
Pas de filtre home/away sur le H2H (règle globale).

### Minimum de matchs historiques

`STREAK_MIN_MATCHES = 3` — si l'équipe a moins de 3 matchs dans son contexte, pas d'évaluation possible.

---

## Seuils

| Constante | Valeur | Description | Scénarios |
|-----------|--------|-------------|-----------|
| `STREAK_FORT` | 3 | Streak ≥ 3 = signal principal fort (proba aléatoire ~1% sur fenêtre 31-45) | A, B |
| `STREAK_MOYEN` | 2 | Streak = 2 = signal court, nécessite confirmation maximale | C |
| `CONFIRM_MIN_RATE` | 0.60 | Taux minimum de confirmation (60%) | A, B (spec initiale) |
| `CONFIRM_WINDOW` | 5 | Fenêtre de confirmation A/B (5 derniers matchs de l'adversaire) | A, B (spec initiale) |
| `CONFIRM_MIN_SAMPLE` | 3 | Minimum de matchs dans la fenêtre pour valider la confirmation A/B | A, B (spec initiale) |
| `CONFIRM_MIN_COUNT` | 1 | Minimum de matchs confirmants dans la fenêtre (scénarios C et D, CONFIRM_WINDOW=3) | C, D |
| `STREAK_MIN_MATCHES` | 3 | Minimum de matchs historiques pour évaluer un scénario | Tous |

Un signal est émis si :
- streak ≥ `STREAK_MOYEN` **ET** confirmation OK (`rate >= CONFIRM_MIN_RATE` ET `sample >= CONFIRM_MIN_SAMPLE`)
- OU streak ≥ `STREAK_FORT` **ET** confirmation OK → confidence `'fort'`
- streak ≥ `STREAK_MOYEN` + confirmation OK → confidence `'moyen'`

---

## Combinaison des scénarios — signaux émis

| Résultat | signal_type | confidence |
|----------|-------------|------------|
| A et B tous les deux actifs | `FHG_A+B` | `'fort'` |
| A seul actif | `FHG_A` | `'fort'` |
| B seul actif | `FHG_B` | `'moyen'` |
| C seul actif (fallback, A et B inactifs) | `FHG_C` | `'moyen'` |
| D seul actif (fallback, A, B et C inactifs) | `FHG_D` | `'moyen'` |

### Hiérarchie des confidences (tri/filtres)

`fort` > `moyen` > (null = pas d'alerte)

---

## Valeurs signal_type

| Valeur | Description |
|--------|-------------|
| `FHG_A` | Scénario A seul (streak offensif ≥ 3) |
| `FHG_B` | Scénario B seul (streak défensif adversaire ≥ 3) |
| `FHG_A+B` | A et B actifs simultanément → fort |
| `FHG_C` | Scénario C (streak court = 2, confirmation 3/3) — fallback A/B inactifs |
| `FHG_D` | Scénario D (double activité 31-45) — fallback A/B/C inactifs |

L'ancien `signal_type = 'FHG'` n'est plus émis. Il subsiste uniquement dans `alerts_v1_backup`.

---

## Champs Supabase ajoutés (Phase 3)

| Colonne | Type | Usage |
|---------|------|-------|
| `algo_version` | `text` | `'v2'` pour les alertes streak, `'v1'` (backup) pour l'ancien |
| `user_excluded` | `boolean` | Exclusion manuelle par Benjamin |
| `user_exclusion_tags` | `text[]` | Tags raison de l'exclusion |
| `user_exclusion_note` | `text` | Note libre |
| `user_excluded_at` | `timestamptz` | Timestamp de l'exclusion |

`fhg_pct` reste en base mais est `null` pour toutes les alertes v2 (score composite obsolète).

---

## Fichiers impactés

| Fichier | Modification |
|---------|-------------|
| `netlify/functions/lib/analysis.cjs` | Ajout `analyzeStreakAlert` + helpers ; suppression `analyzeFHGFromMatches` (Phase 1.5) |
| `netlify/functions/lib/analysis.test.js` | 25+ nouveaux tests streak |
| `netlify/functions/generate-alerts.js` | Remplacement bloc FHG par `analyzeStreakAlert` |
| `netlify/functions/check-results.js` | Extension switch pour `FHG_A`/`FHG_B`/`FHG_A+B` |
| `src/lib/core/scoring.js` | Remplacement `calculerScoreFHG` par `analyserStreakFHG` (ESM) |
| `src/lib/core/scoring.test.js` | 20+ tests streak ESM |
| `src/lib/components/MatchCard.svelte` | Affichage factors streak (streak, rates) |
| `src/lib/components/ExcludeAlertModal.svelte` | Nouveau composant exclusion manuelle |
| `src/lib/api/supabase.js` | Helpers `excludeAlert` / `unexcludeAlert` |
| `src/routes/historique/+page.svelte` | Toggle exclusions + stats what-if |
| `scripts/calibrate-threshold.js` | Refonte bucketing streak-aware |
| `ARCHITECTURE.md` / `README.md` / `CLAUDE.md` | Mise à jour docs |

---

## Ce qui ne change pas

- Liaison `trades ↔ alerts` via `match_id` dans `/historique`
- Colonnes `dc_*` en BDD (conservées pour les données historiques — pas de migration destructive)
