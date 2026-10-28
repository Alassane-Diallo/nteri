from __future__ import annotations


class OtpDeliveryError(RuntimeError):
    """Erreur d'envoi d'un code OTP sans exposer les détails du fournisseur."""
