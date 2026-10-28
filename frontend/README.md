# N’Teri

Une messagerie simple aux couleurs du Mali : messages texte en temps réel,
carnet de contacts privé, conversations directes et groupes.

Le projet est composé de deux applications :

- ce frontend React Router dans `demo/nteri` ;
- l’API Django dans `demo/py/nteri-api`.

## Fonctionnalités

- Connexion par numéro de téléphone et code OTP envoyé par email
- Création de compte automatique après vérification du code sur un nouveau
  numéro
- Carnet de contacts privé : chaque personne ne voit que ses propres contacts
- Conversations directes avec une personne de son carnet
- Groupes avec un nom et au moins deux contacts
- Messages texte en temps réel via WebSocket
- Notifications locales lorsque l’onglet est masqué, et Web Push lorsque
  l’application est fermée si le serveur est configuré pour cela
- Recherche, filtres « Toutes / Non lues / Groupes » et compteurs de messages
  non lus calculés par le serveur
- Interface mobile et bureau, thème clair ou sombre selon le système

## Stack

- React 19 + React Router 8 en Framework Mode (SSR)
- Vite 8 et Tailwind CSS 4
- TypeScript strict
- API Django 6.1 + Django REST Framework + Channels
- Design system intégré dans `app/app.css` (vert, jaune et rouge du drapeau
  malien)

## Démarrage

Le frontend a besoin de l’API pour fonctionner. Dans un premier terminal :

```bash
cd ../py/nteri-api
source .venv/bin/activate
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 127.0.0.1:8000
```

Puis, dans ce dossier :

```bash
npm install
npm run dev
```

L’application est disponible sur `http://localhost:5173` (ou le port suivant
si Vite en choisit un autre). Le proxy Vite transmet `/api` et `/ws` à
`http://127.0.0.1:8000` ; l’origine reste donc identique et les cookies de
session fonctionnent sans configuration CORS supplémentaire.

Pour viser un autre backend en développement :

```bash
NTERI_BACKEND_URL=http://127.0.0.1:8000 npm run dev
```

### Comptes de démonstration

Après `seed_demo`, la connexion se fait avec le numéro de téléphone, puis une
adresse email qui reçoit le code OTP. En développement, n’importe quelle
adresse email valide peut être associée à un compte de démonstration lors de
sa première connexion ; le code est affiché dans l’interface ou dans les logs
Django selon `NTERI_EXPOSE_OTP`. En production, l’email doit déjà être associé
au compte par un administrateur.

| Nom | Téléphone |
| --- | --- |
| Awa Traoré | `+22376123456` |
| Moussa Diarra | `+22370451289` |
| Fatoumata Keïta | `+22375086321` |

Les comptes conservent un mot de passe Django (`NteriDemo2026!` par défaut)
uniquement pour l’administration. L’interface N’Teri ne propose plus de
connexion par mot de passe.

### Notifications

Le bouton cloche du bandeau latéral demande l’autorisation du navigateur.
Sans configuration Web Push côté serveur, les notifications restent locales :
elles s’affichent lorsque l’onglet est masqué. Avec les clés VAPID configurées
dans l’API, le service worker `public/sw.js` reçoit aussi les messages lorsque
l’application est fermée.

Les notifications Push nécessitent HTTPS en production (localhost est accepté
en développement). Un clic sur une notification ouvre la conversation
concernée.

## Vérification et production

```bash
npm run typecheck   # génère les types de routes puis vérifie TypeScript
npm run build       # construit build/client et build/server
npm start           # sert le build sur le port 3000 (PORT pour changer)
```

Le serveur de production ne fait pas de proxy vers Django. Déployez le
frontend et l’API derrière un reverse proxy de même origine :

- `/` et les assets → serveur React Router (`npm start`) ;
- `/api` → Django ;
- `/ws` → Django en ASGI, avec le support WebSocket.

Le service worker est copié dans `build/client/sw.js` et doit être servi à la
racine du site.

Si le frontend et l’API sont sur des origines différentes, définissez
`VITE_API_URL` et `VITE_WS_URL` à la construction, puis adaptez
`DJANGO_CORS_ALLOWED_ORIGINS`, `DJANGO_CSRF_TRUSTED_ORIGINS` et les cookies.
Le déploiement sur une même origine reste fortement recommandé.

## Structure

```txt
app/
├── components/                 # Briques visuelles partagées (avatar, icônes, logo)
├── features/auth/
│   └── AuthScreen.tsx          # Connexion téléphone → email → code OTP
├── features/messaging/
│   ├── api.ts                  # Client REST, CSRF, session, Push et WebSocket
│   ├── components/             # Liste, conversation, composeur, contacts, groupe
│   ├── format.ts               # Formats de date et de compteurs
│   ├── selectors.ts            # Résumés de conversations et tri des messages
│   ├── types.ts                # Modèle de données
│   └── useChatStore.ts         # État piloté par l’API et événements temps réel
├── features/notifications/
│   ├── browser.ts              # Notifications locales du navigateur
│   └── push.ts                 # Abonnement Web Push et service worker
├── routes/home.tsx             # Garde d’authentification et écran principal
├── routes.ts                   # Déclaration explicite des routes
└── app.css                     # Tokens de design et styles globaux
public/
└── sw.js                       # Réception Push et clic sur notification
```

## Sécurité

- Aucun message, contact, groupe ou identifiant utilisateur n’est stocké dans
  le `localStorage`. L’état est reconstruit depuis l’API à chaque ouverture.
- La session repose sur un cookie `HttpOnly` ; le jeton CSRF est demandé au
  serveur et conservé en mémoire, puis envoyé dans `X-CSRFToken`.
- Le carnet de contacts est privé et filtré côté serveur. L’interface ne
  propose jamais d’annuaire global.
- Créer une conversation directe exige que la personne soit dans le carnet du
  créateur ; recevoir un message d’un inconnu reste possible, comme dans
  WhatsApp.
- Le WebSocket `/ws/inbox/` est authentifié par la session. Le client ne
  fournit jamais d’identifiant utilisateur pour s’abonner à un flux.
- Les messages sont envoyés par REST ; seul le serveur décide des
  participants autorisés et du nombre de messages non lus.
- La clé privée VAPID reste côté serveur. Le navigateur ne reçoit que la clé
  publique.
- Les erreurs réseau et les réponses du serveur sont affichées sans exposer de
  détails techniques.

## Portée

Le périmètre actuel couvre les messages texte, les contacts privés et la
création de groupes. Les médias, appels et pièces jointes ne sont pas pris en
charge.

## Docker

Le `Dockerfile` fournit uniquement le frontend. En production, placez-le
derrière le même reverse proxy que l’API Django et assurez la terminaison
HTTPS.
