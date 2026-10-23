# API N’Teri

Backend Django 6.1 de la messagerie N’Teri : authentification par session,
API REST et flux temps réel WebSocket.

## Démarrage local

Prérequis : Python 3.12+, un environnement virtuel et, pour le temps réel,
Redis en production (le développement peut utiliser le canal en mémoire).

```bash
cd nteri-api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Remplacer DJANGO_SECRET_KEY par une valeur générée :
python -c "import secrets; print(secrets.token_urlsafe(64))"

python manage.py migrate
python manage.py seed_demo
python manage.py runserver 127.0.0.1:8000
```

Le frontend React Router se trouve dans `../nteri`. Son proxy Vite envoie
`/api` et `/ws` vers `http://127.0.0.1:8000` ; les cookies de session et la
protection CSRF restent ainsi sur la même origine.

## Comptes de démonstration

`seed_demo` crée huit comptes, dont :

| Nom d’utilisateur | Nom | Mot de passe |
| --- | --- | --- |
| `awa` | Awa Traoré | `NteriDemo2026!` |
| `moussa` | Moussa Diarra | `NteriDemo2026!` |

Le mot de passe par défaut peut être remplacé avec `NTERI_DEMO_PASSWORD`.
La commande refuse de s’exécuter quand `DJANGO_DEBUG=False`, sauf avec
`--force`. Ces comptes ne doivent jamais être créés en production.

```bash
python manage.py seed_demo --reset --reset-passwords
```

`--reset` recrée uniquement les conversations de démonstration ; les autres
conversations sont conservées.

## API REST

Toutes les réponses sont en JSON. Les cookies de session sont `HttpOnly`,
`SameSite=Lax` et `Secure` hors développement.

| Méthode | Chemin | Description |
| --- | --- | --- |
| `GET` | `/api/health/` | Sonde de disponibilité |
| `GET` | `/api/auth/csrf/` | Dépose le cookie CSRF et renvoie le jeton |
| `POST` | `/api/auth/register/` | Crée un compte et ouvre une session |
| `POST` | `/api/auth/login/` | Ouvre une session |
| `POST` | `/api/auth/logout/` | Ferme la session et les WebSockets actifs |
| `GET` | `/api/auth/me/` | Profil de l’utilisateur connecté |
| `GET` | `/api/contacts/` | Annuaire des comptes actifs (`?q=` accepté) |
| `GET` | `/api/conversations/` | Conversations de l’utilisateur, non lues comprises |
| `POST` | `/api/conversations/` | Crée une conversation directe ou un groupe |
| `GET` | `/api/conversations/<id>/` | Détail d’une conversation autorisée |
| `GET` | `/api/conversations/<id>/messages/` | Messages paginés (`limit`, `before`) |
| `POST` | `/api/conversations/<id>/messages/` | Envoie un message texte |
| `POST` | `/api/conversations/<id>/read/` | Marque la conversation comme lue |

Les méthodes `POST` exigent le jeton CSRF dans l’en-tête `X-CSRFToken`.
Le frontend l’obtient via `/api/auth/csrf/` et le renouvelle après connexion
ou en cas de réponse `403`.

Les erreurs utilisent la forme `{"detail": "…"}` ou les erreurs de champ de
DRF. Une session absente renvoie `401`, une ressource d’une autre personne
renvoie `404` pour ne pas révéler son existence.

## WebSocket

Point d’entrée unique : `ws://<hôte>/ws/inbox/`.

Le serveur identifie l’utilisateur par sa session Django : aucun identifiant
d’utilisateur n’est accepté dans l’URL ou dans le premier message. L’origine
est vérifiée avec `AllowedHostsOriginValidator`.

Événements serveur :

```json
{"type": "message.created", "conversationId": "12", "message": {"…": "…"}, "unread": 1}
{"type": "conversation.created", "conversationId": "18"}
{"type": "pong"}
{"type": "error", "detail": "…"}
```

Le client envoie uniquement `{"type": "ping"}` toutes les 25 secondes. Le
serveur vérifie alors que la session et le compte sont toujours valides et
ferme le socket avec le code `4401` sinon. Un identifiant de session supprimé
ou une déconnexion via `/api/auth/logout/` produit la même fermeture.

## Sécurité

- Secrets, hôtes, origines et base de données viennent de l’environnement ;
  `.env` est ignoré par Git et `.env.example` ne contient aucun secret réel.
- L’authentification utilise la session Django, jamais un identifiant fourni
  par le client. Les droits d’accès aux conversations sont vérifiés côté
  serveur à chaque lecture et à chaque écriture.
- CSRF est actif sur toutes les écritures. Les cookies sont `HttpOnly` et
  `SameSite=Lax` ; HSTS et la redirection HTTPS sont actifs hors DEBUG.
- Les messages, noms, téléphones et noms de groupe sont normalisés, limités en
  taille et débarrassés des caractères de contrôle.
- Les tentatives de connexion et d’inscription sont limitées en base
  (`AuthAttempt`) par IP et par nom d’utilisateur, avec un blocage temporaire.
  Les mots de passe passent par les validateurs Django (10 caractères
  minimum, mots de passe courants et numériques refusés).
- L’API n’accepte que du JSON, limite la taille des requêtes et ne gère aucun
  fichier. Les réponses API sont marquées `no-store` et protégées par une CSP
  restrictive.
- Les WebSockets sont authentifiés, liés à l’origine et à la session, et ne
  diffusent un message qu’aux participants de sa conversation.

## Tests et vérifications

```bash
python manage.py check
python manage.py test chat -v 2
python manage.py makemigrations --check --dry-run
```

La suite couvre l’authentification, CSRF, le rate limiting, les droits sur les
conversations, la pagination, la validation des messages et les WebSockets.

## Déploiement Vercel

Le dépôt de déploiement contient un `vercel.json` à sa racine : le frontend et
cette API sont déployés comme deux services d’un même projet Vercel, sur le
même domaine. Les requêtes `/api`, `/ws`, `/admin` et `/static` sont routées
vers Django.

Le service backend utilise `nteri_api.asgi:application` et exécute au build :

```bash
python manage.py collectstatic --noinput
python manage.py migrate --noinput
```

WhiteNoise sert ensuite `/static/` (admin inclus) depuis l’application ASGI :
aucun serveur web séparé n’est nécessaire sur Vercel.

Variables à définir dans Vercel :

- `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`, `DJANGO_ALLOWED_HOSTS`,
  `DJANGO_CSRF_TRUSTED_ORIGINS`, `DJANGO_TRUST_PROXY_HEADERS=True` ;
- `DATABASE_URL` (PostgreSQL Supabase, pooler port `6543`) et `REDIS_URL`
  (Upstash, `rediss://`) ;
- `DB_CONN_MAX_AGE=0` recommandé pour les fonctions serverless.

Avec l’intégration Supabase de Vercel, `DATABASE_POSTGRES_URL` ou
`POSTGRES_URL` sont détectés automatiquement hors DEBUG si `DATABASE_URL` est
absent. Les paramètres Supabase `supa` et `pgbouncer` sont retirés avant la
connexion, et le pooler désactive les curseurs côté serveur ainsi que les
requêtes préparées de psycopg 3.

`VERCEL_URL` et `VERCEL_PROJECT_PRODUCTION_URL` sont ajoutés automatiquement
aux hôtes et origines CSRF. Ne pas lancer `seed_demo` en production.

## Production

1. Utiliser PostgreSQL (`DATABASE_URL`) et Redis (`REDIS_URL`).
2. Définir `DJANGO_DEBUG=False`, une `DJANGO_SECRET_KEY` unique, les hôtes et
   origines réels, puis `DJANGO_TRUST_PROXY_HEADERS=True` uniquement derrière
   un reverse proxy de confiance qui transmet `X-Forwarded-Proto`.
3. Servir l’application en ASGI (WebSockets) avec Daphne ou un serveur
   équivalent, après `python manage.py migrate` et
   `python manage.py collectstatic`.
4. Servir le frontend et l’API sur la même origine, avec `/api` et `/ws`
   proxifiés vers Django. Sinon, adapter CORS, CSRF et les cookies.
5. Purger périodiquement les compteurs de tentatives expirés :

```bash
python manage.py clean_auth_attempts --days 7
```

6. Ne jamais lancer `seed_demo` en production et protéger `/admin/`.
