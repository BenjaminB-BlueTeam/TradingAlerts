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

- La logique DC reste **inchangée** : `analyzeDCFromH2H`, route `/selection-dc`, colonnes `dc_*`, `check-results.js` évaluation DC.
- Pas de migration TypeScript — reste JS/ESM + CommonJS selon contexte.
- Pas de cotes / ROI / ML / IA prédictive.
- Confirmation Benjamin requise avant : SQL en prod Supabase, suppression fichier, modif `analysis.cjs`.

---

## Deux scénarios FHG indépendants

Les deux scénarios sont évalués sur **chaque équipe** du match (home ciblée ET away ciblée). La meilleure confidence est retenue.

### Scénario A — Offensif

> "L'équipe marque 31-45 de façon récurrente"

- **Signal principal** : streak consécutif (depuis le match le plus récent) où l'équipe a marqué entre 31-45 min (`e.min >= 31 && e.min <= 45`), filtré par contexte (home → matchs home uniquement).
- **Signal de confirmation** : l'adversaire a encaissé en **1MT (0-45)** dans ≥ 60% de ses 5 derniers matchs dans le contexte opposé.

### Scénario B — Défensif

> "L'adversaire encaisse 31-45 de façon récurrente"

- **Signal principal** : streak consécutif où l'adversaire a encaissé entre 31-45, filtré par contexte opposé.
- **Signal de confirmation** : l'équipe ciblée a marqué en **1MT (0-45)** dans ≥ 60% de ses 5 derniers matchs dans le contexte du match à venir.

---

## Règles communes

### Filtrage par contexte (systématique)

| Équipe ciblée | Matchs utilisés |
|---------------|-----------------|
| Home | Matchs à domicile uniquement |
| Away | Matchs à l'extérieur uniquement |

L'adversaire est filtré dans le contexte **opposé**.

### Veto H2H (unique pour A et B)

Si H2H ≥ 3 **et** l'équipe ciblée n'a **jamais marqué en 1MT (0-45)** dans ces H2H → exclusion totale, pas d'alerte.  
Pas de filtre home/away sur le H2H (règle globale).

### Minimum de matchs historiques

`STREAK_MIN_MATCHES = 3` — si l'équipe a moins de 3 matchs dans son contexte, pas d'évaluation possible.

---

## Seuils

| Constante | Valeur | Description |
|-----------|--------|-------------|
| `STREAK_FORT` | 3 | Streak ≥ 3 = signal principal fort (proba aléatoire ~1% sur fenêtre 31-45) |
| `STREAK_MOYEN` | 2 | Streak ≥ 2 = signal moyen, nécessite confirmation |
| `CONFIRM_MIN_RATE` | 0.60 | Taux minimum de confirmation (60%) |
| `CONFIRM_WINDOW` | 5 | Fenêtre de confirmation (5 derniers matchs de l'adversaire) |
| `CONFIRM_MIN_SAMPLE` | 3 | Minimum de matchs dans la fenêtre pour valider la confirmation |
| `STREAK_MIN_MATCHES` | 3 | Minimum de matchs historiques pour évaluer un streak |

Un signal est émis si :
- streak ≥ `STREAK_MOYEN` **ET** confirmation OK (`rate >= CONFIRM_MIN_RATE` ET `sample >= CONFIRM_MIN_SAMPLE`)
- OU streak ≥ `STREAK_FORT` **ET** confirmation OK → confidence `'fort'`
- streak ≥ `STREAK_MOYEN` + confirmation OK → confidence `'moyen'`

---

## Combinaison A + B

| Résultat | signal_type | confidence |
|----------|-------------|------------|
| A seul (quelle que soit la confidence) | `FHG_A` | `'moyen'` ou `'fort'` |
| B seul | `FHG_B` | `'moyen'` ou `'fort'` |
| A et B tous les deux ≥ moyen | `FHG_A+B` | `'fort_double'` |

### Hiérarchie des confidences (tri/filtres)

`fort_double` > `fort` > `moyen` > (null = pas d'alerte)

---

## Nouveaux signal_type

| Valeur | Description |
|--------|-------------|
| `FHG_A` | Scénario offensif uniquement |
| `FHG_B` | Scénario défensif uniquement |
| `FHG_A+B` | Les deux scénarios actifs → fort_double |
| `DC` | Double Chance (inchangé) |

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

- `analyzeDCFromH2H` et ses tests
- Route `/selection-dc`
- Colonnes `dc_defeat_pct`, `dc_best_side`, `dc_confidence`
- Logique `evaluateDC` dans `check-results.js`
- Liaison `trades ↔ alerts` via `match_id` dans `/historique`
- Paramètre `?type=FHG` / `?type=DC` dans `generate-alerts.js`
