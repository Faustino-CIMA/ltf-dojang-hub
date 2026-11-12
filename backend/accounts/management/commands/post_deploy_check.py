"""One-line post-deploy check. Prints status codes only, never a session key."""

from django.conf import settings
from django.contrib.auth import BACKEND_SESSION_KEY, HASH_SESSION_KEY, SESSION_KEY
from django.contrib.sessions.backends.db import SessionStore
from django.core.exceptions import DisallowedHost
from django.core.management.base import BaseCommand
from django.http.request import validate_host
from django.test import Client

from accounts.models import User


class Command(BaseCommand):
    help = "Print status codes for /api/health/ and a signed-in /api/auth/me/. Never prints secrets."

    def add_arguments(self, parser):
        parser.add_argument(
            "--host",
            default="",
            help="Host header to send. Defaults to an allowed host that starts with api.",
        )

    def handle(self, *args, **options):
        host = deploy_check_host(settings.ALLOWED_HOSTS, options.get("host") or "")
        client = Client(raise_request_exception=True)
        health = _get(client, "/api/health/", host)
        self.stdout.write(_line("health", health, host))
        auth = _signed_in_status(client, host)
        self.stdout.write(_line("auth", auth, host))
        if _code(health) != 200 or _code(auth) != 200:
            raise SystemExit(1)


def deploy_check_host(allowed_hosts, override: str = "") -> str:
    """First concrete host, preferring one that starts with api."""
    chosen = str(override or "").strip()
    if chosen:
        return chosen
    concrete = []
    for item in allowed_hosts or []:
        host = str(item or "").strip()
        if not host or host == "*" or host.startswith(".") or "*" in host:
            continue
        concrete.append(host)
    for host in concrete:
        if host.startswith("api."):
            return host
    return concrete[0] if concrete else ""


def _request_extra(host: str) -> dict:
    extra = {}
    if host:
        extra["HTTP_HOST"] = host
    header = getattr(settings, "SECURE_PROXY_SSL_HEADER", None)
    if isinstance(header, (tuple, list)) and len(header) == 2:
        extra[str(header[0])] = str(header[1])
    return extra


def _get(client: Client, path: str, host: str, **extra):
    kwargs = _request_extra(host)
    kwargs.update(extra)
    try:
        return client.get(path, secure=True, **kwargs)
    except DisallowedHost:
        return None


def _signed_in_status(client: Client, host: str):
    if not validate_host(host or "testserver", settings.ALLOWED_HOSTS):
        return None
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
        return _get(
            client,
            "/api/auth/me/",
            host,
            HTTP_AUTHORIZATION="Token " + session.session_key,
        )
    except Exception:
        if not validate_host(host or "testserver", settings.ALLOWED_HOSTS):
            return None
        return 0
    finally:
        session.delete()


def _code(response) -> int:
    if isinstance(response, int):
        return response
    if response is None:
        return 400
    return int(getattr(response, "status_code", 0) or 0)


def _line(label: str, response, host: str) -> str:
    code = _code(response)
    sent = host or "testserver"
    if code == 400 and not validate_host(sent, settings.ALLOWED_HOSTS):
        return f"{label} 400 (host)"
    return f"{label} {code}"
