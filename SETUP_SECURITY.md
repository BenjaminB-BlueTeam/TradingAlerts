# SETUP_SECURITY.md — Configuration sécurité TradingAlerts

Étapes manuelles à réaliser après déploiement des chantiers de sécurité.

---

## CHANTIER B1 — Auth tokens Netlify Functions

### 1. Générer un token sécurisé (PowerShell)

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object {[byte](Get-Random -Max 256)}))
```

Copier le résultat (44 caractères base64).

### 2. Ajouter dans Netlify

Netlify Dashboard → tradingfootalerts → **Site settings** → **Environment variables** → **Add a variable**

| Key | Value | Scopes | Sensitivity |
|-----|-------|--------|-------------|
| `FUNCTIONS_AUTH_TOKEN` | `<token>` | Functions only | Secret |
| `VITE_FUNCTIONS_AUTH_TOKEN` | `<même token>` | Builds | Plain |

> **Important** : les deux variables doivent avoir la même valeur.

### 3. Redéployer

Netlify → **Deploys** → **Trigger deploy** → **Clear cache and deploy site**

### 4. Vérifier

```bash
# Doit retourner 401
curl -X POST https://tradingfootalerts.netlify.app/.netlify/functions/delete-alerts \
  -H "Content-Type: application/json" \
  -d '{"ids":[99999]}'

# Doit retourner 200 (avec ton token)
curl -X POST https://tradingfootalerts.netlify.app/.netlify/functions/delete-alerts \
  -H "Authorization: Bearer <ton-token>" \
  -H "Content-Type: application/json" \
  -d '{"ids":[99999]}'
```

### 5. Surveiller les crons après déploiement

Dans les 24h suivant le déploiement, vérifier dans Netlify → **Functions** → **Logs** que :
- `generate-alerts` (5h/16h UTC) → pas de 401
- `daily-seed` (4h UTC) → pas de 401
- `compute-team-stats` (4h30 UTC) → pas de 401
- `notify-*` (*/5 min + quotidiens) → pas de 401

---

## CHANTIER B3 — Supabase Auth Email/Password

### 1. Activer Email/Password dans Supabase

Supabase Dashboard → **Authentication** → **Providers** → **Email** → Enable

### 2. Désactiver les inscriptions publiques

Supabase Dashboard → **Authentication** → **Settings** → **User Signups** → **Disable sign ups** ✓

> Cela empêche tout nouveau compte de s'inscrire via l'API. Seul l'admin (toi) peut créer des comptes via le Dashboard.

### 3. Créer ton compte Benjamin

Supabase Dashboard → **Authentication** → **Users** → **Add user** → **Create new user**

| Champ | Valeur |
|-------|--------|
| Email | `benjamin.bourger92@gmail.com` |
| Password | (mot de passe fort) |
| Auto Confirm User | ✓ (cocher pour skip l'email de confirmation) |

### 4. Vérifier la session

Après déploiement, aller sur https://tradingfootalerts.netlify.app → doit rediriger vers `/login`.
Se connecter avec `benjamin.bourger92@gmail.com` + ton mot de passe → doit accéder au dashboard.

---

## Vérifications post-déploiement globales

```bash
# Headers sécurité (après CHANTIER B2)
curl.exe -I https://tradingfootalerts.netlify.app

# Doit contenir :
# Strict-Transport-Security: max-age=...
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# Content-Security-Policy: ...
```

- `/debug` est protégé par l'auth Supabase (redirect `/login` si non connecté) — accessible en prod uniquement après connexion
- Les boutons "Lancer maintenant" dans `/debug` doivent fonctionner avec le token configuré dans `.env.local` (ou `VITE_FUNCTIONS_AUTH_TOKEN` en prod)
