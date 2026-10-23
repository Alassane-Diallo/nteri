from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import AuthAttempt, Conversation, ConversationParticipant, Message, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("username", "display_name", "phone", "is_active", "last_seen")
    search_fields = ("username", "first_name", "last_name", "phone")
    list_filter = ("is_active", "is_staff")
    ordering = ("username",)
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("N’Teri", {"fields": ("phone", "avatar", "last_seen")}),
    )
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        ("N’Teri", {"fields": ("phone",)}),
    )


class ParticipantInline(admin.TabularInline):
    model = ConversationParticipant
    extra = 0
    readonly_fields = ("joined_at", "last_read_at")


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "type", "name", "updated_at")
    list_filter = ("type",)
    search_fields = ("name", "participants__username")
    inlines = (ParticipantInline,)
    readonly_fields = ("direct_key", "created_at", "updated_at")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "sender", "message_type", "created_at")
    list_filter = ("message_type",)
    search_fields = ("content", "sender__username")
    readonly_fields = ("created_at", "updated_at")


@admin.register(AuthAttempt)
class AuthAttemptAdmin(admin.ModelAdmin):
    list_display = ("key", "failures", "blocked_until", "updated_at")
    readonly_fields = (
        "key",
        "failures",
        "window_started_at",
        "blocked_until",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False
