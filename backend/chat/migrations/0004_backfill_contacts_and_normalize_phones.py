from __future__ import annotations

import re

from django.db import migrations


def normalize_phone(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return ""

    digits = re.sub(r"\D", "", raw)
    if not digits:
        return ""

    starts_with_plus = raw.startswith("+")
    starts_with_00 = raw.startswith("00")
    if starts_with_00:
        digits = digits[2:]

    if not starts_with_plus and not starts_with_00:
        if len(digits) == 8:
            digits = f"223{digits}"
        elif len(digits) == 11 and digits.startswith("223"):
            pass

    if (
        starts_with_plus
        or starts_with_00
        or (len(digits) == 11 and digits.startswith("223"))
        or len(digits) == 8
    ):
        return f"+{digits}"

    return digits


def normalize_phones(apps, schema_editor):
    User = apps.get_model("chat", "User")
    seen: dict[str, int] = {}

    for user in User.objects.exclude(phone__isnull=True).exclude(phone=""):
        normalized = normalize_phone(user.phone)
        if not normalized:
            continue
        if normalized in seen:
            # Une valeur dupliquée ne doit pas empêcher la migration. Le
            # compte reste accessible à l'admin, qui pourra corriger le numéro.
            User.objects.filter(pk=user.pk).update(phone=None)
            continue
        seen[normalized] = user.pk
        if normalized != user.phone:
            User.objects.filter(pk=user.pk).update(phone=normalized)


def backfill_contacts(apps, schema_editor):
    Conversation = apps.get_model("chat", "Conversation")
    Participant = apps.get_model("chat", "ConversationParticipant")
    Contact = apps.get_model("chat", "Contact")

    links: list[Contact] = []
    for conversation in Conversation.objects.only("pk").iterator():
        user_ids = list(
            Participant.objects.filter(conversation_id=conversation.pk)
            .order_by("user_id")
            .values_list("user_id", flat=True)
        )
        for owner_id in user_ids:
            for contact_id in user_ids:
                if owner_id == contact_id:
                    continue
                links.append(
                    Contact(owner_id=owner_id, contact_id=contact_id)
                )

    Contact.objects.bulk_create(links, ignore_conflicts=True, batch_size=500)


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0003_otpchallenge_contact"),
    ]

    operations = [
        migrations.RunPython(normalize_phones, migrations.RunPython.noop),
        migrations.RunPython(backfill_contacts, migrations.RunPython.noop),
    ]
