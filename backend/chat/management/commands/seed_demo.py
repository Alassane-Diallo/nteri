from __future__ import annotations

import os
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from chat.models import Contact, Conversation, ConversationParticipant, Message, User
from chat.services import direct_key_for

DEMO_PASSWORD = os.getenv("NTERI_DEMO_PASSWORD", "NteriDemo2026!")

USERS = [
    ("awa", "Awa", "Traoré", "+22376123456"),
    ("moussa", "Moussa", "Diarra", "+22370451289"),
    ("fatoumata", "Fatoumata", "Keïta", "+22375086321"),
    ("ibrahim", "Ibrahim", "Coulibaly", "+22378315640"),
    ("aissata", "Aïssata", "Touré", "+22379228714"),
    ("oumar", "Oumar", "Sissoko", "+22366540933"),
    ("kadidia", "Kadidia", "Sangaré", "+22374196208"),
    ("salif", "Salif", "Traoré", "+22377402516"),
]

CONVERSATIONS = [
    {
        "key": "chat-moussa",
        "kind": "direct",
        "members": ("awa", "moussa"),
        "name": "",
        "unread_for": ("awa", 0),
        "messages": [
            ("moussa", "Salut Awa ! Tu as vu les nouveaux tissus au marché de Médine ?", 46),
            ("awa", "Oui, j’y suis passée ce matin. Les bazins verts sont magnifiques.", 33),
            ("moussa", "Parfait, je pensais à un modèle pour le mariage de samedi.", 21),
            ("awa", "Viens à la maison vers 17 h, on regarde ça ensemble.", 14),
            ("moussa", "Ça marche. À tout à l’heure !", 8),
        ],
    },
    {
        "key": "chat-famille",
        "kind": "group",
        "members": ("awa", "moussa", "fatoumata", "aissata", "oumar"),
        "name": "Famille N’Teri",
        "unread_for": ("awa", 3),
        "messages": [
            ("aissata", "Qui vient dimanche pour le déjeuner ?", 202),
            ("fatoumata", "Moi ! Je ramène le tô et le siguin.", 181),
            ("awa", "Je m’occupe du jus de bissap.", 149),
            ("oumar", "Je viens avec les mangues du jardin.", 92),
            ("aissata", "Super, on sera au complet. À dimanche !", 53),
        ],
    },
    {
        "key": "chat-fatoumata",
        "kind": "direct",
        "members": ("awa", "fatoumata"),
        "name": "",
        "unread_for": ("awa", 2),
        "messages": [
            ("fatoumata", "Awa, tu peux m’envoyer la photo du pagne jaune ?", 57),
            ("awa", "Bien sûr, je te l’envoie ce soir.", 48),
            ("fatoumata", "Merci beaucoup !", 39),
            ("fatoumata", "N’oublie pas la réunion des mamans demain.", 31),
        ],
    },
    {
        "key": "chat-djoliba",
        "kind": "group",
        "members": ("awa", "ibrahim", "kadidia", "salif", "moussa"),
        "name": "Djoliba Studio",
        "unread_for": ("awa", 1),
        "messages": [
            ("ibrahim", "Le site du festival est en ligne.", 242),
            ("kadidia", "Bravo ! Il reste juste à corriger le programme.", 211),
            ("awa", "Je regarde la page d’accueil ce soir.", 184),
            ("salif", "On fait un point demain à 9 h ?", 121),
        ],
    },
    {
        "key": "chat-aissata",
        "kind": "direct",
        "members": ("awa", "aissata"),
        "name": "",
        "unread_for": ("awa", 0),
        "messages": [
            ("awa", "Merci pour le thé d’hier, c’était délicieux.", 26 * 60),
            ("aissata", "Avec plaisir ma sœur. À refaire très vite.", int(25.6 * 60)),
        ],
    },
    {
        "key": "chat-ibrahim",
        "kind": "direct",
        "members": ("awa", "ibrahim"),
        "name": "",
        "unread_for": ("awa", 0),
        "messages": [
            ("ibrahim", "Les cartes sont prêtes pour l’atelier.", 50 * 60),
            ("awa", "Génial, je passe les récupérer demain matin.", int(49.5 * 60)),
        ],
    },
]


class Command(BaseCommand):
    help = "Crée les comptes et conversations de démonstration N'Teri."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Supprime puis recrée les conversations de démonstration.",
        )
        parser.add_argument(
            "--reset-passwords",
            action="store_true",
            help="Réapplique le mot de passe de démonstration aux comptes.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Autorise l'exécution quand DEBUG=False.",
        )

    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError(
                "Refus d'injecter des comptes de démonstration en production. "
                "Utilisez --force si c'est réellement voulu."
            )

        users = self._create_users(options["reset_passwords"])
        if options["reset"]:
            self._reset_conversations()

        for definition in CONVERSATIONS:
            self._create_conversation(definition, users)

        self._create_contacts(users)

        self.stdout.write(self.style.SUCCESS("Données de démonstration prêtes."))
        self.stdout.write(
            "Connexion : +223 76 12 34 56, puis une adresse email pour "
            "recevoir le code OTP (en développement, le code est affiché par "
            "le serveur)."
        )

    def _create_users(self, reset_passwords: bool) -> dict[str, User]:
        users: dict[str, User] = {}

        for username, first_name, last_name, phone in USERS:
            user, created = User.objects.get_or_create(username=username)
            changed = False

            if created or not user.first_name:
                user.first_name = first_name
                changed = True
            if created or not user.last_name:
                user.last_name = last_name
                changed = True
            if not user.phone and not User.objects.filter(phone=phone).exists():
                user.phone = phone
                changed = True
            if created or reset_passwords:
                user.set_password(DEMO_PASSWORD)
                changed = True
            if changed:
                user.save()

            users[username] = user

        return users

    def _reset_conversations(self) -> None:
        keys = [item["key"] for item in CONVERSATIONS]
        names = [item["name"] for item in CONVERSATIONS if item["name"]]
        Conversation.objects.filter(name__in=names).delete()
        for definition in CONVERSATIONS:
            if definition["kind"] != "direct":
                continue
            first, second = definition["members"]
            key = direct_key_for(
                User.objects.get(username=first).pk,
                User.objects.get(username=second).pk,
            )
            Conversation.objects.filter(direct_key=key).delete()

        self.stdout.write(f"Conversations réinitialisées ({len(keys)} clés).")

    def _create_contacts(self, users: dict[str, User]) -> None:
        members = list(users.values())
        links = [
            Contact(owner=owner, contact=contact)
            for owner in members
            for contact in members
            if owner.pk != contact.pk
        ]
        Contact.objects.bulk_create(links, ignore_conflicts=True)
        self.stdout.write(
            self.style.SUCCESS(f"Carnets de contacts préparés ({len(links)} liens).")
        )

    def _create_conversation(self, definition: dict, users: dict[str, User]) -> None:
        member_users = [users[username] for username in definition["members"]]

        if definition["kind"] == "direct":
            first, second = member_users
            key = direct_key_for(first.pk, second.pk)
            conversation, created = Conversation.objects.get_or_create(
                direct_key=key,
                defaults={"type": Conversation.ConversationType.PRIVATE},
            )
        else:
            conversation = Conversation.objects.filter(
                type=Conversation.ConversationType.GROUP,
                name=definition["name"],
            ).first()
            created = conversation is None
            if conversation is None:
                conversation = Conversation.objects.create(
                    type=Conversation.ConversationType.GROUP,
                    name=definition["name"],
                )

        if not created:
            self.stdout.write(
                self.style.WARNING(f"Conversation déjà présente : {definition['key']}")
            )
            return

        now = timezone.now()
        ConversationParticipant.objects.bulk_create(
            [
                ConversationParticipant(
                    conversation=conversation,
                    user=member,
                    role=(
                        ConversationParticipant.Role.ADMIN
                        if member == member_users[0]
                        else ConversationParticipant.Role.MEMBER
                    ),
                    last_read_at=now,
                )
                for member in member_users
            ]
        )

        if definition["kind"] == "group":
            system_message = Message.objects.create(
                conversation=conversation,
                sender=member_users[0],
                message_type=Message.MessageType.SYSTEM,
                content=f"Groupe créé par {member_users[0].display_name}",
            )
            created_at = now - timedelta(days=120)
            Message.objects.filter(pk=system_message.pk).update(
                created_at=created_at,
                updated_at=created_at,
            )
            conversation_started_at = created_at
        else:
            conversation_started_at = None

        timestamps: list[tuple[int, str, object]] = []
        for author_username, body, minutes in definition["messages"]:
            timestamp = now - timedelta(minutes=minutes)
            message = Message.objects.create(
                conversation=conversation,
                sender=users[author_username],
                content=body,
                message_type=Message.MessageType.TEXT,
            )
            Message.objects.filter(pk=message.pk).update(
                created_at=timestamp,
                updated_at=timestamp,
            )
            timestamps.append((message.pk, author_username, timestamp))

        if timestamps:
            last_timestamp = max(item[2] for item in timestamps)
            earliest = conversation_started_at or (
                min(item[2] for item in timestamps) - timedelta(minutes=1)
            )
            Conversation.objects.filter(pk=conversation.pk).update(
                created_at=earliest,
                updated_at=last_timestamp,
            )

        unread_user, unread_count = definition["unread_for"]
        unread_user_obj = users[unread_user]
        incoming = [
            timestamp
            for _, author, timestamp in timestamps
            if author != unread_user
        ]
        if unread_count > 0 and incoming:
            cutoff = incoming[-unread_count] - timedelta(seconds=1)
            ConversationParticipant.objects.filter(
                conversation=conversation,
                user=unread_user_obj,
            ).update(last_read_at=cutoff)
        else:
            ConversationParticipant.objects.filter(
                conversation=conversation,
                user=unread_user_obj,
            ).update(last_read_at=now)

        self.stdout.write(self.style.SUCCESS(f"Conversation créée : {definition['key']}"))
