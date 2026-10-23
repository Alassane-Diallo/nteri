from __future__ import annotations

from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    """Rend l'absence de session explicite en 401 plutôt qu'en 403.

    DRF transforme ``NotAuthenticated`` en 403 quand l'authentificateur
    n'expose pas d'en-tête ``WWW-Authenticate``. Le frontend peut ainsi
    distinguer « non connecté » d'un refus d'autorisation.
    """

    response = exception_handler(exc, context)
    request = context.get("request")

    if response is None or request is None or response.status_code != 403:
        return response

    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated:
        return response

    detail = ""
    if isinstance(response.data, dict):
        detail = str(response.data.get("detail", ""))
    if "CSRF" in detail:
        return response

    response.status_code = 401
    response.data = {"detail": "Authentification requise."}

    return response
