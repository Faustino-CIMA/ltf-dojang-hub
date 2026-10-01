"""Signed product codes. Never store the raw token; verify offline with Ed25519."""

from __future__ import annotations

import base64
import hashlib
import json
import re
import uuid
from datetime import timezone as dt_timezone
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import InstallIdentity
from .registry import KNOWN_MODULE_IDS, canonical_module_ids

TOKEN_PREFIX = "LTF1"
PAYLOAD_VERSION = 1
KEY_SOURCE_ENV = "env"
KEY_SOURCE_INSTALL = "install"
_INSTALL_ID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


class ProductCodeError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    raw = (value or "").strip()
    pad = "=" * ((4 - len(raw) % 4) % 4)
    try:
        return base64.urlsafe_b64decode(raw + pad)
    except Exception as exc:
        raise ProductCodeError("malformed", "Product code is not valid.") from exc


def canonical_json(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True, ensure_ascii=True).encode("utf-8")


def fingerprint_token(token: str) -> str:
    return hashlib.sha256(token.strip().encode("ascii")).hexdigest()


def parse_datetime_utc(value: str | None):
    if not value:
        return None
    parsed = parse_datetime(value)
    if parsed is None:
        raise ProductCodeError("malformed", "Product code expiry is not valid.")
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, dt_timezone.utc)
    return parsed


def get_or_create_install() -> InstallIdentity:
    obj, created = InstallIdentity.objects.get_or_create(
        pk=1,
        defaults={"install_id": uuid.uuid4()},
    )
    if created:
        return obj
    return obj


def _load_private_from_b64(value: str) -> Ed25519PrivateKey:
    raw = _b64decode(value)
    if len(raw) != 32:
        raise ProductCodeError("malformed", "Product-code signing key is not valid.")
    return Ed25519PrivateKey.from_private_bytes(raw)


def _load_public_from_b64(value: str) -> Ed25519PublicKey:
    raw = _b64decode(value)
    if len(raw) != 32:
        raise ProductCodeError("malformed", "Product-code verification key is not valid.")
    return Ed25519PublicKey.from_public_bytes(raw)


def ensure_local_keypair(install: InstallIdentity) -> InstallIdentity:
    updated, _created = _lock_and_ensure_keypair(install)
    return updated


def _lock_and_ensure_keypair(install: InstallIdentity) -> tuple[InstallIdentity, bool]:
    """Create the install keypair once. A second call does not rotate it."""
    if install.local_public_key and install.local_private_key:
        return install, False
    with transaction.atomic():
        locked = InstallIdentity.objects.select_for_update().get(pk=install.pk)
        if locked.local_public_key and locked.local_private_key:
            return locked, False
        key = Ed25519PrivateKey.generate()
        locked.local_private_key = _b64encode(key.private_bytes_raw())
        locked.local_public_key = _b64encode(key.public_key().public_bytes_raw())
        locked.save(update_fields=["local_public_key", "local_private_key", "updated_at"])
        return locked, True


def configured_public_key() -> str:
    return str(getattr(settings, "MODULE_CODE_PUBLIC_KEY", "") or "").strip()


def configured_private_key() -> str:
    return str(getattr(settings, "MODULE_CODE_PRIVATE_KEY", "") or "").strip()


def uses_environment_keys() -> bool:
    return bool(configured_public_key() or configured_private_key())


def ensure_install_keys() -> tuple[str, bool]:
    """Make this install able to verify product codes.

    Environment keys win and are left untouched. Otherwise the Ed25519 pair is
    created once on InstallIdentity and reused. Returns (source, created).
    """
    if uses_environment_keys():
        return KEY_SOURCE_ENV, False
    install = get_or_create_install()
    _locked, created = _lock_and_ensure_keypair(install)
    return KEY_SOURCE_INSTALL, created


def has_verify_key() -> bool:
    if configured_public_key() or configured_private_key():
        return True
    install = InstallIdentity.objects.filter(pk=1).first()
    return bool(install and install.local_public_key)


def can_mint_locally() -> bool:
    """True when this process holds a private key (env or the install row)."""
    if configured_private_key():
        return True
    if configured_public_key():
        return False
    return True


def get_verify_key() -> Ed25519PublicKey:
    configured = configured_public_key()
    if configured:
        return _load_public_from_b64(configured)
    private = configured_private_key()
    if private:
        return _load_private_from_b64(private).public_key()
    install = ensure_local_keypair(get_or_create_install())
    return _load_public_from_b64(install.local_public_key)


def get_signing_key() -> Ed25519PrivateKey:
    configured = configured_private_key()
    if configured:
        return _load_private_from_b64(configured)
    if configured_public_key():
        raise ProductCodeError(
            "no_signing_key",
            "This install verifies product codes signed elsewhere and cannot mint them.",
        )
    install = ensure_local_keypair(get_or_create_install())
    return _load_private_from_b64(install.local_private_key)


def build_payload(
    *,
    module_ids: list[str],
    install_id: str,
    expires_at=None,
    caps: dict | None = None,
) -> dict[str, Any]:
    module_ids = canonical_module_ids(list(module_ids))
    unknown = [mid for mid in module_ids if mid not in KNOWN_MODULE_IDS]
    if unknown:
        raise ProductCodeError("unknown_module", f"Unknown module id: {', '.join(unknown)}.")
    if not module_ids:
        raise ProductCodeError("malformed", "A product code must list at least one module.")
    now = timezone.now().astimezone(dt_timezone.utc)
    payload: dict[str, Any] = {
        "v": PAYLOAD_VERSION,
        "jti": str(uuid.uuid4()),
        "install_id": str(install_id),
        "modules": sorted(set(module_ids)),
        "iat": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "caps": caps or {},
    }
    if expires_at is not None:
        if timezone.is_naive(expires_at):
            expires_at = timezone.make_aware(expires_at, dt_timezone.utc)
        payload["exp"] = expires_at.astimezone(dt_timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return payload


def sign_payload(payload: dict[str, Any], private_key: Ed25519PrivateKey | None = None) -> str:
    key = private_key or get_signing_key()
    body = canonical_json(payload)
    signature = key.sign(body)
    return f"{TOKEN_PREFIX}.{_b64encode(body)}.{_b64encode(signature)}"


def parse_and_verify(token: str) -> dict[str, Any]:
    raw = (token or "").strip()
    if _INSTALL_ID_RE.match(raw):
        raise ProductCodeError(
            "install_id",
            "That is the install id. Paste a product code that starts with LTF1.",
        )
    parts = raw.split(".")
    if len(parts) != 3 or parts[0] != TOKEN_PREFIX:
        raise ProductCodeError("malformed", "Product code is not valid.")
    body = _b64decode(parts[1])
    signature = _b64decode(parts[2])
    try:
        get_verify_key().verify(signature, body)
    except ProductCodeError:
        raise
    except Exception as exc:
        raise ProductCodeError("invalid_signature", "Product code signature is not valid.") from exc
    try:
        payload = json.loads(body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ProductCodeError("malformed", "Product code is not valid.") from exc
    if not isinstance(payload, dict):
        raise ProductCodeError("malformed", "Product code is not valid.")
    if payload.get("v") != PAYLOAD_VERSION:
        raise ProductCodeError("malformed", "Product code version is not supported.")
    modules = payload.get("modules")
    if not isinstance(modules, list) or not modules or not all(isinstance(m, str) for m in modules):
        raise ProductCodeError("malformed", "Product code modules are not valid.")
    modules = canonical_module_ids(list(modules))
    unknown = [mid for mid in modules if mid not in KNOWN_MODULE_IDS]
    if unknown:
        raise ProductCodeError("unknown_module", f"Unknown module id: {', '.join(unknown)}.")
    payload["modules"] = sorted(set(modules))
    return payload
