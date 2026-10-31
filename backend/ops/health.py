from __future__ import annotations

import os
import socket
import time
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone


def _status(ok: bool, detail: str, extra: dict | None = None) -> dict:
    payload = {"ok": ok, "detail": detail}
    if extra:
        payload.update(extra)
    return payload


def probe_postgres() -> dict:
    started = time.monotonic()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return _status(True, "connected", {"latency_ms": round((time.monotonic() - started) * 1000)})
    except Exception as exc:
        return _status(False, str(exc)[:300])


def probe_redis() -> dict:
    location = ""
    try:
        caches = getattr(settings, "CACHES", {})
        location = str((caches.get("default") or {}).get("LOCATION") or "")
        cache.set("ops:health:ping", "1", timeout=10)
        value = cache.get("ops:health:ping")
        if value != "1":
            return _status(False, "cache round-trip failed", {"backend": location or "locmem"})
        return _status(True, "reachable", {"backend": location or "locmem"})
    except Exception as exc:
        return _status(False, str(exc)[:300], {"backend": location or "locmem"})


def probe_celery() -> dict:
    try:
        from config.celery import app

        inspector = app.control.inspect(timeout=2)
        ping = inspector.ping() or {}
        stats = inspector.stats() or {}
        workers = sorted(ping.keys())
        return _status(
            bool(workers),
            "workers responded" if workers else "no workers responded",
            {"workers": workers, "worker_count": len(workers), "has_stats": bool(stats)},
        )
    except Exception as exc:
        return _status(False, str(exc)[:300])


def probe_smtp() -> dict:
    host = str(getattr(settings, "EMAIL_HOST", "") or "").strip()
    port = int(getattr(settings, "EMAIL_PORT", 0) or 0)
    if not host:
        resend = str(getattr(settings, "RESEND_API_KEY", "") or "").strip()
        if resend and resend.lower() not in {"", "replace-me", "changeme", "change-me"}:
            return _status(True, "resend configured (no SMTP host)")
        return _status(False, "no EMAIL_HOST and Resend is not configured")
    try:
        with socket.create_connection((host, port or 25), timeout=3):
            return _status(True, f"tcp {host}:{port or 25} open")
    except Exception as exc:
        return _status(False, str(exc)[:300], {"host": host, "port": port})


def probe_media() -> dict:
    root = Path(getattr(settings, "MEDIA_ROOT", "") or ".")
    try:
        root.mkdir(parents=True, exist_ok=True)
        probe = root / ".ops-health-write"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        usage = os.statvfs(root) if hasattr(os, "statvfs") else None
        extra = {"path": str(root)}
        if usage:
            extra["free_bytes"] = usage.f_bavail * usage.f_frsize
            extra["total_bytes"] = usage.f_blocks * usage.f_frsize
        return _status(True, "writable", extra)
    except Exception as exc:
        return _status(False, str(exc)[:300], {"path": str(root)})


def probe_migrations() -> dict:
    try:
        executor = MigrationExecutor(connection)
        plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
        pending = [f"{mig.app_label}.{mig.name}" for mig, _backwards in plan]
        return _status(not pending, "up to date" if not pending else f"{len(pending)} pending", {"pending": pending})
    except Exception as exc:
        return _status(False, str(exc)[:300])


def _secret_present(value: str) -> bool:
    return str(value or "").strip().lower() not in {"", "replace-me", "changeme", "change-me"}


def probe_env_keys() -> dict:
    checks = {
        "DJANGO_SECRET_KEY": _secret_present(getattr(settings, "SECRET_KEY", "")),
        "POSTGRES_DB": bool(settings.DATABASES.get("default", {}).get("NAME")),
        "REDIS_URL": bool(getattr(settings, "CELERY_BROKER_URL", "")),
        "STRIPE_SECRET_KEY": _secret_present(getattr(settings, "STRIPE_SECRET_KEY", "")),
        "STRIPE_WEBHOOK_SECRET": _secret_present(getattr(settings, "STRIPE_WEBHOOK_SECRET", "")),
        "PAYCONIQ_API_KEY": _secret_present(getattr(settings, "PAYCONIQ_API_KEY", "")),
        "RESEND_API_KEY": _secret_present(getattr(settings, "RESEND_API_KEY", "")),
        "EMAIL_HOST": bool(str(getattr(settings, "EMAIL_HOST", "") or "").strip()),
    }
    missing = [key for key, present in checks.items() if not present]
    return _status(True, "presence only, values are never returned", {"configured": checks, "missing": missing})


def probe_clock() -> dict:
    """UTC time of this server, so a phone clock can be compared with it."""
    from datetime import timezone as datetime_timezone

    stamp = timezone.now().astimezone(datetime_timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    return _status(True, stamp)


def collect_health() -> dict:
    checks = {
        "postgres": probe_postgres(),
        "redis": probe_redis(),
        "celery": probe_celery(),
        "smtp": probe_smtp(),
        "media": probe_media(),
        "migrations": probe_migrations(),
        "env_keys": probe_env_keys(),
        "clock": probe_clock(),
    }
    overall = all(item.get("ok") for key, item in checks.items() if key != "env_keys")
    return {
        "ok": overall,
        "generated_at": timezone.now().isoformat(),
        "app_version": getattr(settings, "LTF_APP_VERSION", ""),
        "django_version": __import__("django").get_version(),
        "debug": bool(settings.DEBUG),
        "checks": checks,
    }
