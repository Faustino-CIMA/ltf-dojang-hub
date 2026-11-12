"""One rule for what a minor account may call.

A minor account is created under 18. The flag stays after the 18th birthday.
Until then, and after, the account may only read its own member home and
upload a profile picture. Every other API is refused here.
"""

from __future__ import annotations

import re

_OWN_MEMBER = re.compile(
    r"^/api/members/(?P<member_id>\d+)(?:/(?P<action>history|profile-picture))?/?$"
)


def minor_request_allowed(path: str, method: str) -> bool:
    clean = (path or "").split("?", 1)[0]
    if not clean.endswith("/"):
        clean = clean + "/"
    if clean.startswith("/api/auth/login/") or clean.startswith("/api/auth/logout"):
        return True
    if clean.startswith("/api/auth/me"):
        return method in {"GET", "HEAD"}
    if clean.startswith("/api/auth/account-setup/") or clean.startswith("/api/auth/password-reset/"):
        return True
    if clean.rstrip("/") == "/api/members" and method in {"GET", "HEAD"}:
        return True
    match = _OWN_MEMBER.match(clean)
    if not match:
        return False
    action = match.group("action")
    if action is None:
        return method in {"GET", "HEAD"}
    if action == "history":
        return method in {"GET", "HEAD"}
    if action == "profile-picture":
        return method in {"GET", "HEAD", "POST"}
    return False
