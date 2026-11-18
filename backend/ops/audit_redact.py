"""Drop secrets from an ops audit payload before it leaves the server."""

from __future__ import annotations

import re

_SECRET_PART = re.compile(
    r"password|secret|api_key|authorization|cookie|session|social_security|token|photo|image",
    re.IGNORECASE,
)


def _drop_key(key: str) -> bool:
    folded = str(key).lower()
    if folded == "ssn_changed":
        return False
    if folded in {"ssn", "token", "password", "secret", "photo", "image"}:
        return True
    return _SECRET_PART.search(folded) is not None


def redact_audit_value(value):
    if isinstance(value, dict):
        cleaned = {}
        for key, item in value.items():
            if _drop_key(str(key)):
                continue
            cleaned[str(key)] = redact_audit_value(item)
        return cleaned
    if isinstance(value, list):
        return [redact_audit_value(item) for item in value]
    return value
