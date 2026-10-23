from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from chat.models import AuthAttempt


class Command(BaseCommand):
    help = "Supprime les compteurs de tentatives d'authentification inactifs."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=7,
            help="Âge minimal des compteurs à supprimer (7 jours par défaut).",
        )

    def handle(self, *args, **options):
        days = options["days"]
        if days < 1:
            raise CommandError("--days doit être supérieur ou égal à 1.")

        cutoff = timezone.now() - timedelta(days=days)
        deleted, _ = AuthAttempt.objects.filter(updated_at__lt=cutoff).delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"{deleted} compteur(s) de tentatives supprimé(s)."
            )
        )
