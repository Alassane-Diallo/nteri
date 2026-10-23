# N’Teri — déploiement Vercel

Ce dépôt regroupe le frontend React Router et l’API Django de N’Teri pour un
déploiement sur **un seul projet Vercel** avec deux services et un domaine
unique.

> Ce dépôt est un dépôt de déploiement. Les applications sources restent dans
> `demo/nteri` et `demo/py/nteri-api` ; synchronisez-les ici avant chaque
> déploiement si vous continuez à développer dans les dossiers d’origine.

## Architecture

```text
https://<projet>.vercel.app
├── /            → frontend React Router (SSR)
├── /api/*       → API Django
├── /ws/*        → Django Channels (WebSocket)
├── /admin/*     → administration Django
└── /static/*    → fichiers statiques Django
```

Le frontend et l’API partagent la même origine. Les cookies de session
restent donc `SameSite=Lax`, sans CORS ni cookie tiers.

## Structure

```text
nteri-deploy/
├── frontend/          # React Router 8 + Vite + Tailwind
├── backend/           # Django 6.1 + DRF + Channels
├── vercel.json        # services et règles de routage
├── .gitignore
└── .vercelignore
```

## Développement local

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(64))"
# Reporter la valeur dans DJANGO_SECRET_KEY

python manage.py migrate
python manage.py seed_demo
python manage.py runserver 127.0.0.1:8000
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

Le proxy Vite envoie `/api` et `/ws` vers `http://127.0.0.1:8000`.

## Déploiement

### 1. Créer les ressources

- **PostgreSQL** (Neon ou Supabase) → `DATABASE_URL`
- **Redis** (Upstash) → `REDIS_URL` en `rediss://`

Redis est obligatoire en production : il permet aux messages diffusés par une
instance Vercel d’atteindre les WebSockets connectés à une autre instance.

### 2. Variables d’environnement Vercel

| Variable | Valeur |
| --- | --- |
| `DJANGO_SECRET_KEY` | clé aléatoire d’au moins 64 caractères |
| `DJANGO_DEBUG` | `False` |
| `DJANGO_ALLOWED_HOSTS` | `nteri.vercel.app` (ou le domaine généré) |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://nteri.vercel.app` |
| `DJANGO_TRUST_PROXY_HEADERS` | `True` |
| `DATABASE_URL` | URL PostgreSQL poolée |
| `REDIS_URL` | URL Redis TLS |
| `DB_CONN_MAX_AGE` | `0` recommandé sur Vercel |
| `PYTHON_VERSION` | `3.14` |

Les variables `VERCEL_URL` et `VERCEL_PROJECT_PRODUCTION_URL` sont fournies
automatiquement par Vercel et ajoutées aux hôtes et origines CSRF par
`backend/nteri_api/settings.py`.

**Ne définissez pas `NTERI_DEMO_PASSWORD` en production.** La commande
`seed_demo` est réservée au développement local.

### 3. Importer le dépôt

1. Pousser ce dépôt sur GitHub.
2. Dans Vercel : **Add New → Project → Import Git Repository**.
3. Laisser le **Root Directory** à la racine du dépôt.
4. Si Vercel demande un framework, choisir **Other** : les services sont
   déclarés dans `vercel.json`.
5. Ajouter les variables d’environnement avant le premier déploiement.
6. Déployer.

Le build du service backend exécute `collectstatic` puis `migrate`. Le
service frontend exécute `npm run build`.

### 4. Vérifier

- `GET https://<domaine>/api/auth/csrf/` renvoie un JSON avec un jeton ;
- `https://<domaine>/admin/` affiche la page de connexion avec son CSS ;
- l’inscription et la connexion fonctionnent ;
- dans les outils développeur, `wss://<domaine>/ws/inbox/` répond `101` ;
- deux navigateurs différents échangent des messages en temps réel.

## Limites Vercel

- Les WebSockets sont en **beta publique**. Une connexion est coupée à la
  durée maximale de la fonction : 300 s en Hobby, 800 s en Pro. Le client se
  reconnecte automatiquement et recharge les messages depuis l’API.
- Les services Vercel sont en **beta**.
- Le plan Hobby est réservé aux usages non commerciaux.
- Le système de fichiers est éphémère : ne pas utiliser SQLite en production.

## Sécurité

- `DJANGO_DEBUG=False`, clé secrète unique, hôtes et origines explicites.
- Hors développement, le backend refuse de démarrer sans PostgreSQL et Redis,
  et refuse explicitement SQLite.
- Cookies `Secure`, `HttpOnly`, `SameSite=Lax`.
- CSRF obligatoire sur toutes les écritures.
- WebSocket authentifié par la session et validé par origine.
- Redis et PostgreSQL accessibles uniquement avec TLS.
- Les variables de production doivent être limitées à l’environnement
  **Production**, ou pointer vers une base de preview séparée.
- Ne pas exposer les previews avec les identifiants de production.
