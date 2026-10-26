from django.urls import path

from .views import (
    ContactDetailView,
    ContactListView,
    ConversationDetailView,
    ConversationListCreateView,
    ConversationMessagesView,
    ConversationReadView,
    CsrfTokenView,
    HealthView,
    LogoutView,
    MeView,
    OtpRequestView,
    OtpVerifyView,
    PushConfigView,
    PushSubscribeView,
    PushUnsubscribeView,
)

app_name = "chat"

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("auth/csrf/", CsrfTokenView.as_view(), name="csrf"),
    path("auth/otp/request/", OtpRequestView.as_view(), name="otp-request"),
    path("auth/otp/verify/", OtpVerifyView.as_view(), name="otp-verify"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("contacts/", ContactListView.as_view(), name="contacts"),
    path(
        "contacts/<int:contact_id>/",
        ContactDetailView.as_view(),
        name="contact",
    ),
    path("push/config/", PushConfigView.as_view(), name="push-config"),
    path(
        "push/subscribe/",
        PushSubscribeView.as_view(),
        name="push-subscribe",
    ),
    path(
        "push/unsubscribe/",
        PushUnsubscribeView.as_view(),
        name="push-unsubscribe",
    ),
    path(
        "conversations/",
        ConversationListCreateView.as_view(),
        name="conversations",
    ),
    path(
        "conversations/<int:conversation_id>/",
        ConversationDetailView.as_view(),
        name="conversation",
    ),
    path(
        "conversations/<int:conversation_id>/messages/",
        ConversationMessagesView.as_view(),
        name="messages",
    ),
    path(
        "conversations/<int:conversation_id>/read/",
        ConversationReadView.as_view(),
        name="read",
    ),
]
