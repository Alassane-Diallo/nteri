from __future__ import annotations

import re
import unicodedata

from rest_framework import serializers

CONTROL_CHARACTERS = re.compile(
    r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069\ufeff]"
)
USERNAME_VALIDATOR = re.compile(r"^[a-z0-9_.-]{3,30}$")
PHONE_ALLOWED = re.compile(r"^\+?[0-9 .()\-]+$")


def normalize_single_line(value: str, *, label: str, max_length: int) -> str:
    normalized = unicodedata.normalize("NFC", value)
    normalized = re.sub(r"\s+", " ", normalized).strip()

    if not normalized:
        raise serializers.ValidationError(f"{label} est obligatoire.")
    if len(normalized) > max_length:
        raise serializers.ValidationError(
            f"{label} ne doit pas dépasser {max_length} caractères."
        )
    if CONTROL_CHARACTERS.search(normalized):
        raise serializers.ValidationError(f"{label} contient des caractères invalides.")

    return normalized


def normalize_message_body(value: str) -> str:
    normalized = unicodedata.normalize(
        "NFC",
        value.replace("\r\n", "\n").replace("\r", "\n"),
    )
    normalized = normalized.strip()

    if not normalized:
        raise serializers.ValidationError("Le message ne peut pas être vide.")
    if len(normalized) > 4000:
        raise serializers.ValidationError(
            "Le message ne doit pas dépasser 4000 caractères."
        )
    if CONTROL_CHARACTERS.search(normalized):
        raise serializers.ValidationError(
            "Le message contient des caractères de contrôle non autorisés."
        )

    return normalized


def normalize_username(value: str) -> str:
    normalized = value.strip().lower()

    if not USERNAME_VALIDATOR.fullmatch(normalized):
        raise serializers.ValidationError(
            "Le nom d’utilisateur doit contenir 3 à 30 caractères : "
            "lettres minuscules, chiffres, point, tiret ou souligné."
        )

    return normalized


def normalize_phone(value: str) -> str:
    raw = value.strip()
    if not raw or not PHONE_ALLOWED.fullmatch(raw):
        raise serializers.ValidationError("Numéro de téléphone invalide.")

    digits = re.sub(r"\D", "", raw)
    if digits.startswith("00"):
        digits = digits[2:]
        raw = f"+{raw}"

    if not 8 <= len(digits) <= 15:
        raise serializers.ValidationError(
            "Le numéro de téléphone doit contenir entre 8 et 15 chiffres."
        )

    prefix = "+" if raw.startswith("+") else ""

    return f"{prefix}{digits}"
