# API N’Teri

Backend Django 6.1 de la messagerie N’Teri : authentification par numéro de
téléphone et code OTP, carnet de contacts privé, API REST et flux temps réel
WebSocket.

## Démarrage local

Prérequis : Python 3.12+, un environnement virtuel et, pour le temps réel,
Redis en production (le développement peut utiliser le canal en mémoire).

```bash
cd backend
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

Le frontend React Router se trouve dans `../frontend`. Son proxy Vite envoie
`/api` et `/ws` vers `http://127.0.0.1:8000` ; les cookies de session et la
protection CSRF restent ainsi sur la même origine.

En développement, `NTERI_SMS_BACKEND=console` affiche le code dans les logs
Django. Si `NTERI_EXPOSE_OTP=True` (valeur par défaut en DEBUG), l’API renvoie
aussi `devCode` pour faciliter les tests. Ces deux comportements sont refusés
hors DEBUG.

## Comptes de démonstration

`seed_demo` crée huit comptes, dont :

| Nom | Téléphone |
| --- | --- |
| Awa Traoré | `+22376123456` |
| Moussa Diarra | `+22370451289` |
| Fatoumata Keïta | `+22375086321` |

La connexion se fait avec le numéro et le code OTP. Les comptes conservent
aussi un mot de passe Django (`NteriDemo2026!` par défaut) utilisable
uniquement pour l’administration ; l’interface N’Teri ne le demande plus. Le
mot de passe de démonstration peut être remplacé avec
`NTERI_DEMO_PASSWORD`.

La commande refuse de s’exécuter quand `DJANGO_DEBUG=False`, sauf avec
`--force`. Ces comptes ne doivent jamais être créés en production.

```bash
python manage.py seed_demo --reset --reset-passwords
```

`--reset` recrée uniquement les conversations et les contacts de démonstration ;
les autres conversations sont conservées.

## API REST

Toutes les réponses sont en JSON. Les cookies de session sont `HttpOnly`,
`SameSite=Lax` et `Secure` hors développement.

| Méthode | Chemin | Description |
| --- | --- | --- |
| `GET` | `/api/health/` | Sonde de disponibilité |
| `GET` | `/api/auth/csrf/` | Dépose le cookie CSRF et renvoie le jeton |
| `POST` | `/api/auth/otp/request/` | Envoie un code de connexion par SMS |
| `POST` | `/api/auth/otp/verify/` | Vérifie le code et ouvre une session |
| `POST` | `/api/auth/logout/` | Ferme la session, les WebSockets et les abonnements Push |
| `GET` | `/api/auth/me/` | Profil de l’utilisateur connecté |
| `GET` | `/api/contacts/` | Carnet privé de l’utilisateur (`?q=` accepté) |
| `POST` | `/api/contacts/` | Ajoute un contact par numéro de téléphone |
| `DELETE` | `/api/contacts/<user_id>/` | Retire un contact de son propre carnet |
| `GET` | `/api/push/config/` | Indique si Web Push est configuré et expose la clé publique VAPID |
| `POST` | `/api/push/subscribe/` | Enregistre l’abonnement Push du navigateur |
| `POST` | `/api/push/unsubscribe/` | Supprime un abonnement Push |
| `GET` | `/api/conversations/` | Conversations de l’utilisateur, non lues comprises |
| `POST` | `/api/conversations/` | Crée une conversation directe ou un groupe |
| `GET` | `/api/conversations/<id>/` | Détail d’une conversation autorisée |
| `GET` | `/api/conversations/<id>/messages/` | Messages paginés (`limit`, `before`) |
| `POST` | `/api/conversations/<id>/messages/` | Envoie un message texte |
| `POST` | `/api/conversations/<id>/read/` | Marque la conversation comme lue |

Les méthodes `POST` et `DELETE` exigent le jeton CSRF dans l’en-tête
`X-CSRFToken`. Le frontend l’obtient via `/api/auth/csrf/` et le renouvelle
après connexion ou en cas de réponse `403`.

Les erreurs utilisent la forme `{"detail": "…"}` ou les erreurs de champ de
DRF. Une session absente renvoie `401`, une ressource d’une autre personne
renvoie `404` pour ne pas révéler son existence.

### Contacts privés

Chaque utilisateur possède son propre carnet. Ajouter quelqu’un ne l’ajoute
pas dans le carnet de cette personne. L’API ne fournit jamais l’annuaire
global des comptes : elle expose uniquement le carnet du demandeur et les
profils des participants aux conversations auxquelles il appartient.

Créer une conversation directe exige que la personne ciblée figure dans le
carnet du créateur. En revanche, une personne peut recevoir un message d’un
expéditeur qu’elle n’a pas encore enregistré, comme dans WhatsApp.

## Authentification OTP

- Les numéros sont normalisés au format international. Un numéro malien à
  8 chiffres devient automatiquement `+223…`.
- Le code contient 6 chiffres, expire après 5 minutes et accepte au maximum
  5 essais.
- Les demandes sont limitées à 3 par 10 minutes par numéro et par IP ; les
  vérifications échouées sont également limitées.
- Les codes sont stockés hachés et ne sont jamais renvoyés en production.
- Un nouveau numéro crée un compte après vérification du code. Le nom complet
  peut être demandé dans un second temps.

`SMS_BACKEND` accepte `console` (développement uniquement), `twilio` ou `http`
(passerelle générique). Sans passerelle configurée hors DEBUG, la demande OTP
renvoie `503` : aucun code ne doit apparaître dans les journaux de production.

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

## Notifications Web Push

Le frontend enregistre un service worker (`/sw.js`) et s’abonne avec la clé
publique VAPID fournie par `/api/push/config/`. Lorsqu’un message est créé, le
backend envoie une notification aux autres participants qui ont un abonnement.
Le service worker ne l’affiche pas si une fenêtre N’Teri est déjà visible.

Pour activer Web Push en local ou en production, générez une paire VAPID
encodée en base64url :

```bash
python - <<'PY'
import base64
from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid

vapid = Vapid()
vapid.generate_keys()
public = vapid.public_key.public_bytes(
    serialization.Encoding.X962,
    serialization.PublicFormat.UncompressedPoint,
)
private = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
print("NTERI_VAPID_PUBLIC_KEY=" + base64.urlsafe_b64encode(public).rstrip(b"=").decode())
print("NTERI_VAPID_PRIVATE_KEY=" + base64.urlsafe_b64encode(private).rstrip(b"=").decode())
PY
```

Définissez ensuite `NTERI_VAPID_PUBLIC_KEY`, `NTERI_VAPID_PRIVATE_KEY` et
`NTERI_VAPID_SUBJECT`. `pywebpush` accepte aussi un chemin vers un fichier PEM
pour la clé privée. Sans ces clés, le backend désactive Web Push et le frontend
conserve les notifications locales tant que l’onglet est ouvert.

Web Push exige HTTPS en production (localhost est autorisé pour le
développement) et l’autorisation explicite de l’utilisateur. Les abonnements
obsolètes (`404`/`410`) sont supprimés automatiquement. Les endpoints sont
limités aux suffixes de `NTERI_PUSH_ALLOWED_HOSTS` (FCM, Mozilla, Apple et
Windows par défaut) afin d’éviter qu’un utilisateur fasse envoyer des requêtes
serveur vers un hôte arbitraire ; ajoutez un suffixe si vous utilisez un autre
service de Push.

## Sécurité

- Secrets, hôtes, origines et base de données viennent de l’environnement ;
  `.env` est ignoré par Git et `.env.example` ne contient aucun secret réel.
- L’authentification utilise la session Django, jamais un identifiant fourni
  par le client. Les droits d’accès aux conversations sont vérifiés côté
  serveur à chaque lecture et à chaque écriture.
- Le carnet de contacts est filtré par propriétaire. Aucun annuaire global
  n’est exposé, et supprimer un contact ne modifie que le carnet du demandeur.
- CSRF est actif sur toutes les écritures. Les cookies sont `HttpOnly` et
  `SameSite=Lax` ; HSTS et la redirection HTTPS sont actifs hors DEBUG.
- Les messages, noms, téléphones et noms de groupe sont normalisés, limités en
  taille et débarrassés des caractères de contrôle.
- Les demandes de code et les vérifications sont limitées en base
  (`AuthAttempt`) par IP et par numéro, avec un blocage temporaire. Les codes
  OTP sont hachés et à usage unique.
- L’API n’accepte que du JSON, limite la taille des requêtes et ne gère aucun
  fichier. Les réponses API sont marquées `no-store` et protégées par une CSP
  restrictive.
- Les WebSockets sont authentifiés, liés à l’origine et à la session, et ne
  diffusent un message qu’aux participants de sa conversation.
- La clé privée VAPID reste exclusivement côté serveur et n’est jamais incluse
  dans une réponse API ou dans le bundle frontend.

## Tests et vérifications

```bash
python manage.py check
python manage.py test chat -v 2
python manage.py makemigrations --check --dry-run
```

La suite couvre l’authentification OTP, CSRF, le rate limiting, la privacy des
contacts, les droits sur les conversations, la pagination, la validation des
messages, les notifications Push et les WebSockets.

## Production

1. Utiliser PostgreSQL (`DATABASE_URL`) et Redis (`REDIS_URL`).
   Avec l’intégration Supabase de Vercel, `DATABASE_POSTGRES_URL`,
   `POSTGRES_URL`, `POSTGRES_PRISMA_URL` et les variantes non poolées sont
   détectés automatiquement hors DEBUG si `DATABASE_URL` est absent. Préférer
   l’URL du pooler transaction (port `6543`) ; le code retire les paramètres
   Supabase `supa`/`pgbouncer`, désactive les curseurs côté serveur et les
   requêtes préparées de psycopg 3. En option, `DATABASE_MIGRATION_URL` peut
   pointer vers l’URL Supabase non poolée (port `5432`) pour les migrations.
   Redis reste nécessaire pour les WebSockets multi-instances : utiliser une
   URL Upstash `rediss://`.
2. Définir `DJANGO_DEBUG=False`, une `DJANGO_SECRET_KEY` unique, les hôtes et
   origines réels, puis `DJANGO_TRUST_PROXY_HEADERS=True` uniquement derrière
   un reverse proxy de confiance qui transmet `X-Forwarded-Proto`.
3. Configurer une passerelle SMS réelle (`NTERI_SMS_BACKEND=twilio` ou `http`)
   avec ses identifiants. Le backend `console` est refusé hors DEBUG.
4. Générer des clés VAPID propres à l’environnement et définir
   `NTERI_VAPID_PUBLIC_KEY`, `NTERI_VAPID_PRIVATE_KEY` et
   `NTERI_VAPID_SUBJECT`. Servir le frontend en HTTPS pour autoriser
   l’abonnement Push.
5. Servir l’application en ASGI (WebSockets) avec Daphne ou un serveur
   équivalent, après `python manage.py migrate` et
   `python manage.py collectstatic`. WhiteNoise sert les fichiers statiques
   collectés (`/static/`, admin inclus).
6. Servir le frontend et l’API sur la même origine, avec `/api` et `/ws`
   proxifiés vers Django. Sinon, adapter CORS, CSRF et les cookies.
7. Purger périodiquement les compteurs de tentatives expirés :

```bash
python manage.py clean_auth_attempts --days 7
```

8. Ne jamais lancer `seed_demo` en production et protéger `/admin/`.
