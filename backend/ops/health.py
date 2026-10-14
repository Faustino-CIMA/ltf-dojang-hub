from __future__ import annotations

import json
import os
import socket
import time
from pathlib import Path

from decouple import config
from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone


def _status(ok: bool | None, detail: str, extra: dict | None = None) -> dict:
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


DEFAULT_DOCKER_SOCKETS = ("/var/run/docker.sock", "/run/docker.sock")
DOCKER_NOT_CONFIGURED = (
    "Docker socket is not configured. Mount /var/run/docker.sock into the backend container, "
    "or set DOCKER_HOST (for example unix:///var/run/docker.sock) or OPS_DOCKER_SOCKET."
)


class DockerEndpoint:
    def __init__(self, kind: str, target: str, port: int | None = None, tls: bool = False):
        self.kind = kind
        self.target = target
        self.port = port
        self.tls = tls


def _configured_docker_host() -> str:
    return str(config("DOCKER_HOST", default="") or "").strip()


def _tcp_endpoint(hostport: str, *, tls: bool) -> DockerEndpoint:
    hostport = hostport.split("/", 1)[0].strip()
    default_port = 2376 if tls else 2375
    if hostport.startswith("["):
        end = hostport.find("]")
        if end < 0:
            raise ValueError(f"invalid DOCKER_HOST address {hostport}")
        host = hostport[1:end]
        remainder = hostport[end + 1 :]
        port = int(remainder[1:]) if remainder.startswith(":") and remainder[1:] else default_port
        return DockerEndpoint("tcp", host, port, tls)
    if hostport.count(":") == 1:
        host, port_text = hostport.split(":", 1)
        return DockerEndpoint("tcp", host, int(port_text), tls)
    return DockerEndpoint("tcp", hostport, default_port, tls)


def _endpoint_from_docker_host(raw: str) -> DockerEndpoint:
    value = raw.strip()
    if value.lower().startswith("npipe:"):
        raise ValueError("DOCKER_HOST uses a Windows named pipe, which this check cannot open")
    if value.startswith("unix://"):
        path = value[len("unix://") :]
        if not path.startswith("/"):
            path = f"/{path}"
        return DockerEndpoint("unix", path)
    if value.startswith("/"):
        return DockerEndpoint("unix", value)
    if value.startswith("tcp://"):
        return _tcp_endpoint(value[len("tcp://") :], tls=False)
    if value.startswith("http://"):
        return _tcp_endpoint(value[len("http://") :], tls=False)
    if value.startswith("https://"):
        return _tcp_endpoint(value[len("https://") :], tls=True)
    raise ValueError(f"unsupported DOCKER_HOST {value}")


def _resolve_docker_endpoint() -> tuple[DockerEndpoint | None, str | None]:
    explicit = str(getattr(settings, "OPS_DOCKER_SOCKET", "") or "").strip()
    if explicit:
        return DockerEndpoint("unix", explicit), None
    host = _configured_docker_host()
    if host:
        try:
            return _endpoint_from_docker_host(host), None
        except (ValueError, TypeError) as exc:
            return None, str(exc)
    for path in DEFAULT_DOCKER_SOCKETS:
        if os.path.exists(path):
            return DockerEndpoint("unix", path), None
    return None, None


def _docker_failure_detail(exc: BaseException) -> str:
    message = str(exc).strip() or exc.__class__.__name__
    lowered = message.lower()
    if isinstance(exc, PermissionError) or "permission denied" in lowered or "operation not permitted" in lowered:
        message = (
            f"{message}. The backend process needs the Docker socket's group "
            "(docker-compose adds the app user to that group when the socket is mounted)."
        )
    return message[:300]


def probe_docker() -> dict:
    endpoint, resolve_error = _resolve_docker_endpoint()
    if resolve_error:
        return _status(False, resolve_error[:300], {"configured": True, "state": "down"})
    if endpoint is None:
        return _status(None, DOCKER_NOT_CONFIGURED, {"configured": False, "state": "unknown"})
    if endpoint.tls:
        return _status(
            False,
            "DOCKER_HOST uses TLS, which this check does not speak. Set OPS_DOCKER_SOCKET to a unix socket instead.",
            {"configured": True, "state": "down"},
        )
    try:
        payload = _docker_get(endpoint, "/containers/json?all=1")
        if not isinstance(payload, list):
            return _status(
                False,
                "Docker API returned an unexpected payload",
                {"configured": True, "state": "down"},
            )
        containers = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            names = item.get("Names") or []
            raw_name = names[0] if names else str(item.get("Id") or "")[:12]
            name = raw_name.lstrip("/") if isinstance(raw_name, str) else str(raw_name)
            state = item.get("State") or ""
            status = item.get("Status") or ""
            containers.append(
                {
                    "name": name,
                    "state": state if isinstance(state, str) else str(state),
                    "status": status if isinstance(status, str) else str(status),
                }
            )
        running = sum(1 for row in containers if str(row["state"]).lower() == "running")
        return _status(
            True,
            f"{running} running, {len(containers)} containers",
            {"containers": containers, "configured": True, "state": "up"},
        )
    except Exception as exc:
        return _status(False, _docker_failure_detail(exc), {"configured": True, "state": "down"})


def _connect_docker(endpoint: DockerEndpoint) -> socket.socket:
    if endpoint.kind == "unix":
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(3)
        try:
            sock.connect(endpoint.target)
        except OSError:
            sock.close()
            raise
        return sock
    port = endpoint.port or 2375
    last_error: OSError | None = None
    addresses = socket.getaddrinfo(endpoint.target, port, type=socket.SOCK_STREAM)
    for family, socktype, proto, _canon, address in addresses:
        sock = socket.socket(family, socktype, proto)
        sock.settimeout(3)
        try:
            sock.connect(address)
            return sock
        except OSError as exc:
            last_error = exc
            sock.close()
    raise last_error or OSError(f"could not connect to {endpoint.target}:{port}")


def _read_http(sock: socket.socket) -> tuple[int, bytes]:
    buffer = bytearray()
    while b"\r\n\r\n" not in buffer:
        chunk = sock.recv(65536)
        if not chunk:
            break
        buffer.extend(chunk)
        if len(buffer) > 1024 * 1024:
            raise RuntimeError("Docker API response headers are too large")
    header_blob, separator, rest = bytes(buffer).partition(b"\r\n\r\n")
    if not header_blob or not separator:
        raise RuntimeError("Docker API returned an empty response")
    lines = header_blob.decode("iso-8859-1", errors="replace").split("\r\n")
    status_parts = lines[0].split(" ", 2)
    status = int(status_parts[1]) if len(status_parts) > 1 and status_parts[1].isdigit() else 0
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if ":" not in line:
            continue
        name, value = line.split(":", 1)
        headers[name.strip().lower()] = value.strip()
    if "chunked" in headers.get("transfer-encoding", "").lower():
        body = _read_chunked(sock, rest)
    elif "content-length" in headers:
        length = int(headers["content-length"])
        body = bytearray(rest)
        while len(body) < length:
            chunk = sock.recv(65536)
            if not chunk:
                break
            body.extend(chunk)
        body = bytes(body[:length])
    else:
        body_parts = bytearray(rest)
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            body_parts.extend(chunk)
        body = bytes(body_parts)
    return status, body


def _read_chunked(sock: socket.socket, pending: bytes) -> bytes:
    data = bytearray(pending)
    body = bytearray()
    while True:
        while b"\r\n" not in data:
            chunk = sock.recv(65536)
            if not chunk:
                raise RuntimeError("truncated chunked Docker API response")
            data.extend(chunk)
        line, _, remainder = bytes(data).partition(b"\r\n")
        data = bytearray(remainder)
        size_token = line.split(b";", 1)[0].strip()
        try:
            size = int(size_token or b"0", 16)
        except ValueError as exc:
            raise RuntimeError("invalid chunk size in Docker API response") from exc
        if size == 0:
            return bytes(body)
        while len(data) < size + 2:
            chunk = sock.recv(65536)
            if not chunk:
                raise RuntimeError("truncated chunked Docker API response")
            data.extend(chunk)
        body.extend(data[:size])
        data = data[size + 2 :]


def _docker_get(endpoint: DockerEndpoint, path: str):
    sock = _connect_docker(endpoint)
    try:
        if endpoint.kind == "unix":
            host_header = "docker"
        else:
            host_header = f"{endpoint.target}:{endpoint.port or 2375}"
        request = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host_header}\r\n"
            "Accept: application/json\r\n"
            "Connection: close\r\n\r\n"
        )
        sock.sendall(request.encode("ascii"))
        status, body = _read_http(sock)
    finally:
        sock.close()
    if status != 200:
        snippet = body.decode("utf-8", errors="replace").strip().replace("\n", " ")[:180]
        raise RuntimeError(f"Docker API HTTP {status}: {snippet}".strip())
    text = body.decode("utf-8") if body else "[]"
    return json.loads(text)


def collect_health() -> dict:
    checks = {
        "postgres": probe_postgres(),
        "redis": probe_redis(),
        "celery": probe_celery(),
        "smtp": probe_smtp(),
        "media": probe_media(),
        "migrations": probe_migrations(),
        "env_keys": probe_env_keys(),
    }
    docker = probe_docker()
    checks["docker"] = docker
    skipped = {"env_keys"}
    if docker.get("configured") is False or docker.get("ok") is None:
        skipped.add("docker")
    overall = all(item.get("ok") for key, item in checks.items() if key not in skipped)
    return {
        "ok": overall,
        "generated_at": timezone.now().isoformat(),
        "app_version": getattr(settings, "LTF_APP_VERSION", ""),
        "django_version": __import__("django").get_version(),
        "debug": bool(settings.DEBUG),
        "checks": checks,
    }
