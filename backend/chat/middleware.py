from __future__ import annotations


class ApiSecurityHeadersMiddleware:
    """En-têtes adaptés à une API JSON consommée par un SPA."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        if request.path.startswith("/api/"):
            response["Cache-Control"] = "no-store"
            response["Pragma"] = "no-cache"
            response["Content-Security-Policy"] = (
                "default-src 'none'; frame-ancestors 'none'; "
                "base-uri 'none'; form-action 'none'"
            )
            response["X-Content-Type-Options"] = "nosniff"

        return response
