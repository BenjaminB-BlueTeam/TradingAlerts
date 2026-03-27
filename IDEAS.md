# FHG Tracker — Idées & Fonctionnalités futures

> Fichier vivant. Ajouter ici toutes les idées, même vagues.
> Les idées validées migrent vers PROJECT_CONTEXT.md (section Backlog).

---

## 🔴 Idée prioritaire — Page Historique Alertes

**Statut** : À développer (branche dédiée à créer)
**Complexité estimée** : Moyenne-haute

### Description

Une page à part entière dédiée au suivi des alertes passées.
Ce n'est pas le simple journal de trades existant — c'est un **outil de performance complet**.

---

### Fonctionnalité 1 — Backlog des alertes

**Vue principale** : liste chronologique de toutes les alertes générées par l'application.

Chaque ligne d'alerte affiche :
- Date + heure de l'alerte
- Match (dom. vs ext.)
- Ligue
- Score FHG au moment de l'alerte
- Badge 1MT 50%+ si présent
- Statut H2H (vert / orange / insuffisant)
- **Indicateur visuel "Succès / Échec"** :
  - Vert ✓ si le but a été marqué en 31-45min (résultat renseigné)
  - Rouge ✗ si pas de but en 31-45min
  - Gris ⏳ si résultat non encore renseigné
- Badge "Pris" / "Non pris" (l'user a-t-il placé un pari ?)
- Si pari pris : gain ou perte affiché en vert/rouge

---

### Fonctionnalité 2 — Modal "Ai-je pris cette alerte ?"

Au clic sur le bouton d'une alerte, une petite modale s'ouvre :

```
┌─────────────────────────────────────────────┐
│  Bayern Munich vs Dortmund — 20:30          │
│  Score FHG : 88 · Badge ★ · H2H vert       │
├─────────────────────────────────────────────┤
│  As-tu pris cette alerte ?                  │
│                                             │
│  [ OUI ]  [ NON — skip ]                   │
│                                             │
│  ─── Si OUI ──────────────────────────────  │
│                                             │
│  Cote prise :  [  2.30  ]                   │
│  Montant misé : [  25 €  ]                  │
│                                             │
│  Résultat du pari :                         │
│  [ ✓ Gagné ]  [ ✗ Perdu ]  [ Annulé ]      │
│                                             │
│  ────────────────────────────────────────── │
│  Gain/perte calculé : + 32,50 €             │
│                                             │
│  [ Enregistrer ]                            │
└─────────────────────────────────────────────┘
```

Calcul automatique :
- Gagné : `(cote - 1) × mise` → ex. `(2.30 - 1) × 25 = +32.50€`
- Perdu : `-mise` → ex. `-25€`
- Annulé : `0€`

---

### Fonctionnalité 3 — Total en bas de page

Barre sticky en bas (ou section fixe) :

```
Alertes prises : 12  |  Gagnées : 8 (67%)  |  Perdues : 4  |  P&L : +124.50 €
```

Couleur du P&L : vert si positif, rouge si négatif.

---

### Fonctionnalité 4 — Filtres

- **Plage de dates** : picker date début / date fin
- **Toggle "Prises uniquement"** : masque les alertes non prises
- **Toggle "Résultats renseignés"** : masque les ⏳ en attente
- **Filtre ligue** : dropdown multi-select
- **Filtre signal minimum** : slider ou boutons (>60 / >70 / >75)
- **Filtre badge 1MT** : toggle ★ uniquement

---

### Fonctionnalité 5 — Dashboard Analytics

Accessible via un onglet ou section en haut de la page.
S'affiche uniquement si ≥ 10 alertes prises.

#### Bloc "Ligues"
- Tableau : ligue | alertes prises | gagnées | taux | P&L
- Classement de la plus rentable à la moins rentable
- Barre de progression colorée par taux de réussite

#### Bloc "Équipes"
- Tableau : équipe | alertes | taux réussite | P&L
- Top 5 équipes les plus rentables
- Top 5 équipes les moins rentables

#### Bloc "Cotes"
- Cote moyenne sur les paris pris
- Plus haute cote prise (et résultat)
- Plus basse cote prise (et résultat)
- Distribution des cotes (graphique en barres : <1.5 / 1.5-2 / 2-2.5 / 2.5-3 / >3)

#### Bloc "Signal vs Résultat"
- Taux de réussite par tranche de score FHG :
  - Score 60-69 : X% réussite
  - Score 70-74 : X% réussite
  - Score 75-79 : X% réussite
  - Score 80+ : X% réussite
- Confirme ou infirme la pertinence du scoring

#### Bloc "Indicateurs"
- Avec badge ★ 1MT vs sans : taux comparatif
- H2H vert vs H2H orange vs H2H insuffisant : taux comparatif
- Graphique radar ou tableau comparatif

#### Bloc "Courbe de performance"
- P&L cumulé dans le temps (line chart)
- Permet de voir les séries et la progression

---

### Questions de conception

**Stockage des alertes** :
- Quand une alerte est-elle "générée" ? Au moment où le score FHG dépasse 75 et que le match approche ?
- Doit-on stocker les alertes automatiquement dès qu'elles sont affichées, ou l'user les ajoute manuellement ?
- Proposition : **auto-enregistrement** dès qu'un match passe en signal FORT (≥75), avec possibilité de supprimer manuellement

**Base de données recommandée pour cette feature** :
- Court terme (MVP) : localStorage avec structure dédiée
- Long terme : Supabase (voir PROJECT_CONTEXT.md section DB)

---

## 🟡 Idées en vrac (non priorisées)

### Widget temps réel "Fenêtre active"
Un overlay flottant (coin bas-droit) visible sur toutes les pages.
Quand un match est dans la tranche 31-45min ET que l'alerte est active :
- Badge pulsant "FENÊTRE OUVERTE — Bayern vs Dortmund — 37e"
- Compte à rebours jusqu'à la 45e
- Clic → ouvre la carte du match

### Export PDF rapport hebdomadaire
- Résumé de la semaine : alertes, résultats, P&L
- Liste des matchs analysés avec scores
- Statistiques de performance

### Partage de fiche trade
- Génère un lien public (anonymisé) vers une fiche trade
- Utile pour partager une analyse avec d'autres traders

### PWA / Mode hors ligne
- Service Worker pour fonctionner sans connexion
- Sync des données quand connexion rétablie

### Comparateur d'équipes
- Sélectionner 2 équipes et comparer leurs stats FHG côte à côte
- Graphique radar : FHG, 1MT%, forme, H2H

### Alertes push navigateur
- Notification système quand un match passe FORT
- Notification à la 30e minute pour les matchs ciblés

### Mode "Soirée européenne"
- Filtre rapide pour ne voir que les matchs Ligue des Champions / Europa League
- Affichage dédié pour les doubles journées

### Import historique (CSV)
- Permettre d'importer un CSV de trades passés
- Format libre avec mapping de colonnes

### ROI par stratégie
- FHG seul vs FHG + DC
- Comparer la rentabilité des deux approches sur l'historique personnel

### Intégration odds en direct
- Afficher la cote en direct depuis un bookmaker (si API dispo)
- Alerter quand la cote atteint le seuil objectif

---

## 💡 Idées rejetées (avec raison)

| Idée | Raison du rejet |
|---|---|
| Placement automatique de paris | Hors scope légal, risque utilisateur |
| Copie de cotes bookmakers en temps réel | APIs propriétaires, CGU restrictives |
| Mode multi-utilisateurs partagé | Trop complexe pour la v1, nécessite auth complète |

---

## Dernière mise à jour

2026-03-27 — Ajout idée Historique Alertes (priorité haute)
