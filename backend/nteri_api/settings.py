"""Configuration Django de N'Teri.

Toutes les valeurs sensibles proviennent de l'environnement. Le fichier
``.env`` (ignoré par Git) sert uniquement au développement local.
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default

    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)

    return [item.strip() for item in raw.split(",") if item.strip()]


def clean_database_url(value: str) -> str:
    """Nettoie une URL copiée depuis Vercel ou Supabase.

    Les intégrations Vercel entourent parfois les valeurs de guillemets et
    ajoutent des paramètres destinés à Prisma ou à Supavisor. Psycopg ne
    comprend ni ``pgbouncer`` ni ``supa``, on les retire avant de configurer
    Django.
    """
    value = value.strip().strip('"').strip("'")
    if not value:
        return ""

    parts = urlsplit(value)
    query = [
        (key, item)
        for key, item in parse_qsl(parts.query, keep_blank_values=True)
        if key not in {"pgbouncer", "supa"}
    ]

    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )


DEBUG = env_bool("DJANGO_DEBUG", False)

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    raise RuntimeError(
        "DJANGO_SECRET_KEY est absent. Copiez .env.example vers .env et "
        "générez une clé avec : python -c \"import secrets; print(secrets.token_urlsafe(64))\""
    )

# Supabase/Vercel peut fournir DATABASE_POSTGRES_URL (parfois préfixé) au lieu
# de DATABASE_URL. En développement, seules les variables explicites sont
# utilisées pour éviter de toucher accidentellement à la base de production.
_database_candidates = [os.getenv("DATABASE_URL", "")]
if not DEBUG:
    _database_candidates.extend(
        [
            os.getenv("DATABASE_POSTGRES_URL", ""),
            os.getenv("POSTGRES_URL", ""),
            os.getenv("DATABASE_POSTGRES_PRISMA_URL", ""),
            os.getenv("POSTGRES_PRISMA_URL", ""),
            os.getenv("DATABASE_POSTGRES_URL_NON_POOLING", ""),
            os.getenv("POSTGRES_URL_NON_POOLING", ""),
        ]
    )

DATABASE_URL = ""
for value in _database_candidates:
    candidate = clean_database_url(value)
    if candidate:
        DATABASE_URL = candidate
        break

_redis_candidates = [os.getenv("REDIS_URL", "")]
if not DEBUG:
    _redis_candidates.append(os.getenv("KV_URL", ""))

REDIS_URL = ""
for value in _redis_candidates:
    candidate = value.strip().strip('"').strip("'")
    if candidate:
        REDIS_URL = candidate
        break

if not DEBUG:
    if not DATABASE_URL.startswith(("postgres://", "postgresql://")):
        raise RuntimeError(
            "DATABASE_URL (ou DATABASE_POSTGRES_URL fourni par Supabase) "
            "doit être une URL PostgreSQL hors développement."
        )
    if "sslmode=disable" in DATABASE_URL:
        raise RuntimeError("sslmode=disable est interdit hors développement.")
    if not REDIS_URL:
        raise RuntimeError(
            "REDIS_URL est obligatoire hors développement "
            "(Upstash Redis, URL rediss://)."
        )
    if not REDIS_URL.startswith("rediss://"):
        raise RuntimeError(
            "REDIS_URL doit utiliser TLS (rediss://) hors développement."
        )

ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS",
    "localhost,127.0.0.1,[::1]",
)

# Vercel fournit l'URL du déploiement courant (previews incluses) et l'URL de
# production. On les ajoute automatiquement pour ne pas coder les domaines en
# dur et pour que les previews restent utilisables.
VERCEL_HOSTS = [
    host.strip()
    for host in (
        os.getenv("VERCEL_URL", ""),
        os.getenv("VERCEL_PROJECT_PRODUCTION_URL", ""),
    )
    if host.strip()
]

# Alias stables du projet. Vercel ne les expose pas toujours au runtime des
# services ; on les ajoute explicitement pour que l'alias court et l'URL de
# déploiement répondent tous les deux (sans wildcard sur *.vercel.app).
VERCEL_PROJECT_HOSTS = (
    "nteri.vercel.app",
    "nteri-alassane-diallos-projects-6b5efa42.vercel.app",
)

if not DEBUG:
    for host in VERCEL_PROJECT_HOSTS:
        if host not in VERCEL_HOSTS:
            VERCEL_HOSTS.append(host)

for host in VERCEL_HOSTS:
    if host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(host)

if not ALLOWED_HOSTS:
    raise RuntimeError("DJANGO_ALLOWED_HOSTS ne peut pas être vide.")

if not DEBUG:
    if SECRET_KEY == "remplacez-moi" or len(SECRET_KEY) < 50:
        raise RuntimeError(
            "DJANGO_SECRET_KEY doit être une clé unique d'au moins 50 "
            "caractères hors développement."
        )
    if "*" in ALLOWED_HOSTS:
        raise RuntimeError(
            "DJANGO_ALLOWED_HOSTS ne doit pas contenir '*' hors développement."
        )

CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)

# Le frontend et l'API partagent le domaine Vercel : chaque déploiement doit
# donc être une origine CSRF de confiance.
for host in VERCEL_HOSTS:
    origin = f"https://{host}"
    if origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(origin)

CORS_ALLOWED_ORIGINS = env_list(
    "DJANGO_CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
CORS_ALLOW_CREDENTIALS = True

AUTH_USER_MODEL = "chat.User"

INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "channels",
    "chat",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "chat.middleware.ApiSecurityHeadersMiddleware",
]

ROOT_URLCONF = "nteri_api.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "nteri_api.wsgi.application"
ASGI_APPLICATION = "nteri_api.asgi.application"

DATABASE_IS_POOLED = (
    ".pooler." in DATABASE_URL
    or "-pooler" in DATABASE_URL
    or ":6543" in DATABASE_URL
)

if DATABASE_URL:
    DATABASES = {
        "default": dj_database_url.parse(
            DATABASE_URL,
            conn_max_age=int(
                os.getenv(
                    "DB_CONN_MAX_AGE",
                    "0" if DATABASE_IS_POOLED else "60",
                )
            ),
            conn_health_checks=True,
        )
    }
else:
    DATABASES = {
        "default": dj_database_url.config(
            default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
            conn_max_age=int(os.getenv("DB_CONN_MAX_AGE", "60")),
            conn_health_checks=True,
        )
    }

# PgBouncer/Supavisor en mode transaction (Supabase pooler, Neon) ne supporte
# pas les curseurs côté serveur ni les requêtes préparées entre transactions.
if DATABASE_IS_POOLED:
    DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True
    DATABASES["default"].setdefault("OPTIONS", {})["prepare_threshold"] = None

if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
        }
    }
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [REDIS_URL]},
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "nteri-local",
        }
    }
    CHANNEL_LAYERS = {
        "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"},
    }

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "UserAttributeSimilarityValidator"
        ),
        "OPTIONS": {
            "user_attributes": ("username", "first_name", "last_name", "email")
        },
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Africa/Bamako"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# WhiteNoise sert les fichiers statiques (admin inclus) depuis l'application
# ASGI sur Vercel, où aucun serveur web séparé ne les expose.
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Sécurité HTTP ---------------------------------------------------------

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 12
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
SESSION_COOKIE_SECURE = not DEBUG

CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_AGE = 60 * 60 * 8
CSRF_FAILURE_VIEW = "chat.views.csrf_failure"

if env_bool("DJANGO_TRUST_PROXY_HEADERS", False):
    TRUST_PROXY_HEADERS = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
else:
    TRUST_PROXY_HEADERS = False

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

DATA_UPLOAD_MAX_MEMORY_SIZE = 64 * 1024
DATA_UPLOAD_MAX_NUMBER_FIELDS = 50
DATA_UPLOAD_MAX_NUMBER_FILES = 0

# --- Authentification par SMS ----------------------------------------------

SMS_BACKEND = os.getenv("NTERI_SMS_BACKEND", "console").strip().lower()
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "").strip()
SMS_WEBHOOK_URL = os.getenv("NTERI_SMS_WEBHOOK_URL", "").strip()
SMS_WEBHOOK_TOKEN = os.getenv("NTERI_SMS_WEBHOOK_TOKEN", "").strip()

# Le code OTP ne doit jamais être renvoyé au client hors développement.
EXPOSE_OTP = DEBUG and env_bool("NTERI_EXPOSE_OTP", True)

# --- Notifications Web Push -------------------------------------------------
# Générez une paire de clés VAPID et renseignez les deux variables pour
# activer les notifications lorsque l’application est fermée. Sans clés,
# l’interface conserve les notifications locales tant que l’onglet est ouvert.
VAPID_PUBLIC_KEY = os.getenv("NTERI_VAPID_PUBLIC_KEY", "").strip()
VAPID_PRIVATE_KEY = os.getenv("NTERI_VAPID_PRIVATE_KEY", "").strip()
VAPID_SUBJECT = os.getenv(
    "NTERI_VAPID_SUBJECT",
    "mailto:contact@nteri.app",
).strip()

# Les endpoints Web Push sont fournis par les navigateurs. Cette liste évite
# qu’un utilisateur authentifié fasse envoyer des requêtes serveur vers un hôte
# arbitraire. Ajoutez un suffixe si vous utilisez un autre service de Push.
PUSH_ALLOWED_HOSTS = env_list(
    "NTERI_PUSH_ALLOWED_HOSTS",
    "fcm.googleapis.com,updates.push.services.mozilla.com,"
    "web.push.apple.com,notify.windows.com",
)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_THROTTLE_RATES": {
        "messages": "40/min",
        "conversations": "10/hour",
        "contacts": "120/min",
        "reads": "240/min",
        "me": "120/min",
    },
    "EXCEPTION_HANDLER": "chat.exceptions.api_exception_handler",
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {
            "format": "{levelname} {asctime} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "simple"},
    },
    "loggers": {
        "django.security": {"handlers": ["console"], "level": "WARNING"},
        "chat": {"handlers": ["console"], "level": "INFO"},
    },
}
