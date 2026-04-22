# Audit Findings — État initial (2026-04-22)

## 1. Tests

**136 tests total : 135 pass, 1 fail**

```
Test Files  1 failed | 6 passed (7)
     Tests  1 failed | 135 passed (136)
```

Test cassé : `src/lib/utils/teamData.test.js:128` — "uses goal_events when available with minutes"
- Le test utilise `toEqual` (strict equality) mais l'implémentation retourne des champs supplémentaires (`label`, `raw`) ajoutés lors de la feature stoppage time.
- Erreur : `expected { min: 10, raw: '10', label: "10'", ... } to deeply equal { min: 10, pct: Any<Number>, scored: true }`
- Fix : remplacer `toEqual` par `toMatchObject` (3 occurrences dans ce test).

Répartition par fichier :
| Fichier | Tests |
|---------|-------|
| formatters.test.js | 22 |
| scoring.test.js | 29 |
| h2h.test.js | 21 |
| cache.test.js | 20 |
| analysis.test.js | 19 |
| tradeStore.test.js | 14 |
| teamData.test.js | 14 (1 fail) |
| **Total** | **139 (136 exécutés, 135 pass)** |

## 2. Documentation — Contradictions

### CLAUDE.md vs README.md
- **Coefficients algo** : CLAUDE.md dit 50/25/15/10 (correct). README.md dit aussi 50/25/15/10. ✅ Cohérent.
- **RLS** : CLAUDE.md dit "ON" partout. À vérifier en base (voir Phase 1.1).
- **Nombre de tests** : CLAUDE.md mentionne "80+ tests" (section features) puis "135+" (roadmap). Le nombre réel est 139. README.md dit "80+". Les deux sont sous-estimés.
- **Scheduled functions** : CLAUDE.md documente `daily-seed.js` ✅. README.md aussi ✅.
- **PROJECT_CONTEXT.md** : supprimé dans cette session. N'existe plus. ✅

### CLAUDE.md contient des références obsolètes
- Section architecture : `doubleChance.js` listé mais le fichier est supprimé.
- Section architecture : `mockData.js` listé mais le fichier est supprimé (noté "données démo").

## 3. Stores — Usage réel

Stores exportés depuis `appStore.js` et leur usage hors du fichier :

| Store | Utilisé par | Verdict |
|-------|------------|---------|
| `apiConnected` | Sidebar, explore, leagues, ApiTest, data.js | ✅ Utilisé |
| `config` | MatchCard, config page | ✅ Utilisé |
| `leagues` | leagues page, matches page | ✅ Utilisé |
| `trades` | config page, TradeJournal | ✅ Utilisé |
| `prefs` | — | ⚠️ Importé nulle part directement, mais `savePrefs` est utilisé par Sidebar |
| `apiRequestsRemaining` | Sidebar | ✅ Utilisé |
| `alertesActives` | Sidebar | ✅ Utilisé |
| `pauseSession` | Sidebar | ✅ Utilisé |
| `allLeagues` | — | ❌ MORT — jamais importé |
| `matches` | — | ❌ MORT — jamais importé (Dashboard utilise Supabase directement) |
| `matchesUpcoming` | — | ❌ MORT — jamais importé |
| `signaux` | — | ❌ MORT — jamais importé (ancien pipeline scoring) |
| `exclus` | — | ❌ MORT — jamais importé |
| `loading` | — | ❌ MORT — jamais importé |
| `lastUpdate` | — | ❌ MORT — jamais importé |
| `watchlist` | — | ❌ MORT — `saveWatchlist`, `addToWatchlist`, `removeFromWatchlist` jamais appelés |

**7 stores morts** + fonctions watchlist associées.

## 4. Config vs Settings

- **`/settings`** (13 lignes) : shell qui importe 5 sous-composants (ApiTest, TradeJournal, TradeStats, BankrollCalc, DangerZone). C'est la page utilisateur principale.
- **`/config`** (433 lignes) : page Admin avec configuration algo (profil, seuils FHG/DC, toggles H2H/1MT/stabilité, gestion trades inline). Liée dans Sidebar sous "Admin > Configuration".

**Verdict** : les deux ont des rôles distincts.
- `/settings` = outil utilisateur (trades, stats, bankroll)
- `/config` = tuning algo + gestion trades (admin)

Cependant, la gestion des trades est dupliquée entre les deux (config page a son propre mini-journal trades). C'est un risque de divergence mais pas un doublon pur.

## 5. Sécurité — Points d'attention

- **Clé anon Supabase hardcodée** dans `supabase.js:10` et `seedClient.js:9` avec fallback `||`. Lisible dans le code source public.
- **`SEED_AUTH_TOKEN`** : vérification conditionnelle — si pas défini, seed-data.js est public.
- **`daily-seed.js`** : aucune protection sur le mode backfill (`?from=...&to=...`).
- **RLS** : documenté "ON" dans CLAUDE.md mais à vérifier en base.
