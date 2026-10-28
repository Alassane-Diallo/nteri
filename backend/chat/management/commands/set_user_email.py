from __future__ import annotations

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from rest_framework.serializers import ValidationError as SerializerValidationError

from chat.models import User
from chat.validators import normalize_email, normalize_phone


class Command(BaseCommand):
    help = "Associe une adresse email à un compte existant (migration OTP email)."

    def add_arguments(self, parser):
        parser.add_argument("phone", help="Numéro de téléphone du compte.")
        parser.add_argument("email", help="Adresse email à associer.")

    def handle(self, *args, **options):
        try:
            phone = normalize_phone(options["phone"])
            email = normalize_email(options["email"])
            validate_email(email)
        except (SerializerValidationError, ValidationError) as error:
            raise CommandError("Numéro ou adresse email invalide.") from error

        user = User.objects.filter(phone=phone).first()
        if user is None:
            raise CommandError("Aucun compte ne correspond à ce numéro.")

        if (
            User.objects.filter(email__iexact=email)
            .exclude(pk=user.pk)
            .exists()
        ):
            raise CommandError("Cette adresse email est déjà utilisée.")

        user.email = email
        user.save(update_fields=["email"])
        self.stdout.write(
            self.style.SUCCESS(
                f"Email mis à jour pour {user.username} ({phone})."
            )
        )
