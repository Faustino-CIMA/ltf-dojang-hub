"""One-line post-deploy check. Prints status codes only, never a session key."""

from django.contrib.auth import BACKEND_SESSION_KEY, HASH_SESSION_KEY, SESSION_KEY
from django.contrib.sessions.backends.db import SessionStore
from django.core.management.base import BaseCommand
from django.test import Client

from accounts.models import User


class Command(BaseCommand):
    help = "Print status codes for /api/health/ and a signed-in /api/auth/me/. Never prints secrets."

    def handle(self, *args, **options):
        client = Client()
        health = client.get("/api/health/")
        self.stdout.write(f"health {health.status_code}")
        auth_code = _signed_in_status(client)
        self.stdout.write(f"auth {auth_code}")
        if health.status_code != 200 or auth_code != 200:
            raise SystemExit(1)


def _signed_in_status(client: Client) -> int:
    user = (
        User.objects.filter(is_active=True, is_superuser=True).order_by("id").first()
        or User.objects.filter(is_active=True).order_by("id").first()
    )
    if user is None:
        return 0
    session = SessionStore()
    session[SESSION_KEY] = str(user.pk)
    session[BACKEND_SESSION_KEY] = "django.contrib.auth.backends.ModelBackend"
    session[HASH_SESSION_KEY] = user.get_session_auth_hash()
    session.save()
    try:
        response = client.get(
            "/api/auth/me/",
            HTTP_AUTHORIZATION="Token " + session.session_key,
        )
        return response.status_code
    except Exception:
        return 0
    finally:
        session.delete()
