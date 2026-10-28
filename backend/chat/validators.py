from __future__ import annotations

import re
import unicodedata

from rest_framework import serializers

CONTROL_CHARACTERS = re.compile(
    r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069\ufeff]"
)
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


def normalize_email(value: str) -> str:
    normalized = value.strip().lower()
    if len(normalized) > 254:
        raise serializers.ValidationError(
            "L’adresse email ne doit pas dépasser 254 caractères."
        )

    return normalized


def normalize_phone(value: str) -> str:
    raw = value.strip()
    if not raw or not PHONE_ALLOWED.fullmatch(raw):
        raise serializers.ValidationError("Numéro de téléphone invalide.")

    digits = re.sub(r"\D", "", raw)
    starts_with_plus = raw.startswith("+")
    starts_with_00 = raw.startswith("00")
    if starts_with_00:
        digits = digits[2:]

    if not starts_with_plus and not starts_with_00:
        if len(digits) == 8:
            # Les numéros maliens sont saisis le plus souvent sans indicatif.
            digits = f"223{digits}"

    if not 8 <= len(digits) <= 15:
        raise serializers.ValidationError(
            "Le numéro de téléphone doit contenir entre 8 et 15 chiffres."
        )

    if (
        starts_with_plus
        or starts_with_00
        or (len(digits) == 11 and digits.startswith("223"))
    ):
        return f"+{digits}"

    return digits
