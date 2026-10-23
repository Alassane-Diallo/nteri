# N’Teri

Une messagerie simple aux couleurs du Mali : messages texte en temps réel,
conversations privées et groupes.

Le projet est composé de deux applications :

- ce frontend React Router dans `demo/nteri` ;
- l’API Django dans `demo/py/nteri-api`.

## Fonctionnalités

- Inscription, connexion et déconnexion par session sécurisée
- Conversations directes et groupes
- Messages texte en temps réel via WebSocket
- Création d’un groupe avec un nom et au moins deux membres
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

Après `seed_demo`, tous les comptes utilisent le même mot de passe :

| Nom d’utilisateur | Nom | Mot de passe |
| --- | --- | --- |
| `awa` | Awa Traoré | `NteriDemo2026!` |
| `moussa` | Moussa Diarra | `NteriDemo2026!` |
| `fatoumata` | Fatoumata Keïta | `NteriDemo2026!` |

## Vérification et déploiement

```bash
npm run typecheck   # génère les types de routes puis vérifie TypeScript
npm run build       # construit build/client et build/server
npm start           # sert le build sur le port 3000 (PORT pour changer)
```

Sur Vercel, le dépôt de déploiement utilise **un seul projet avec deux
services** : le frontend est servi sur `/`, l’API sur `/api` et `/ws`. Le
frontend et l’API partagent donc la même origine.

Laissez `VITE_API_URL` et `VITE_WS_URL` vides : le client utilise les chemins
relatifs et `window.location.origin`. Si vous séparez un jour les deux
origines, définissez ces variables à la construction puis adaptez
`DJANGO_CORS_ALLOWED_ORIGINS`, `DJANGO_CSRF_TRUSTED_ORIGINS` et les cookies.

## Structure

```txt
app/
├── components/                 # Briques visuelles partagées (avatar, icônes, logo)
├── features/auth/
│   └── AuthScreen.tsx          # Connexion et création de compte
├── features/messaging/
│   ├── api.ts                  # Client REST, CSRF, session et WebSocket
│   ├── components/             # Liste, conversation, composeur, dialogue de groupe
│   ├── format.ts               # Formats de date et de compteurs
│   ├── selectors.ts            # Résumés de conversations et tri des messages
│   ├── types.ts                # Modèle de données
│   └── useChatStore.ts         # État piloté par l’API et événements temps réel
├── routes/home.tsx             # Garde d’authentification et écran principal
├── routes.ts                   # Déclaration explicite des routes
└── app.css                     # Tokens de design et styles globaux
```

## Sécurité

- Aucun message, groupe ou identifiant utilisateur n’est stocké dans le
  `localStorage`. L’état est reconstruit depuis l’API à chaque ouverture.
- La session repose sur un cookie `HttpOnly` ; le jeton CSRF est demandé au
  serveur et conservé en mémoire, puis envoyé dans `X-CSRFToken`.
- Le WebSocket `/ws/inbox/` est authentifié par la session. Le client ne
  fournit jamais d’identifiant utilisateur pour s’abonner à un flux.
- Les messages sont envoyés par REST ; seul le serveur décide des
  participants autorisés et du nombre de messages non lus.
- Les erreurs réseau et les réponses du serveur sont affichées sans exposer de
  détails techniques.

## Portée

Le périmètre actuel couvre les messages texte et la création de groupes. Les
médias, appels et pièces jointes ne sont pas pris en charge.

## Vercel

Le déploiement Vercel est décrit dans le `README.md` à la racine du dépôt de
déploiement. Le `Dockerfile` du dépôt source n’est pas utilisé : Vercel détecte
directement l’application React Router et construit `build/client` et
`build/server`.
