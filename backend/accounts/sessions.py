"""End every open sign-in for one login.

The app token is the Django session key. Deleting those sessions, and any
legacy API token, means a leftover browser token cannot keep calling the API.
"""

from __future__ import annotations

from django.contrib.auth import SESSION_KEY
from django.contrib.sessions.models import Session
from django.utils import timezone


def open_sign_ins() -> list[dict]:
    """One row per sign-in that has not expired.

    The session key stays on the server. Two devices are two rows.
    """
    from accounts.models import User

    now = timezone.now()
    found: list[int] = []
    for session in Session.objects.filter(expire_date__gte=now).iterator():
        try:
            data = session.get_decoded()
        except Exception:
            continue
        raw = data.get(SESSION_KEY) or data.get("ltf_email_mfa_user")
        try:
            user_id = int(raw)
        except (TypeError, ValueError):
            continue
        found.append(user_id)
    users = User.objects.in_bulk(found)
    counts: dict[int, int] = {}
    rows = []
    for user_id in found:
        user = users.get(user_id)
        if user is None or not user.is_active:
            continue
        counts[user_id] = counts.get(user_id, 0) + 1
        rows.append(
            {
                "id": f"{user_id}-{counts[user_id]}",
                "user_id": user.id,
                "username": user.username,
                "role": user.role,
                "is_superuser": user.is_superuser,
                "last_used_at": None,
                "last_ip": None,
                "user_agent": "",
                "created": None,
                "token_key_suffix": "",
            }
        )
    return rows


def end_open_sessions(user) -> int:
    from rest_framework.authtoken.models import Token

    Token.objects.filter(user_id=user.pk).delete()
    user_id = str(user.pk)
    ended = 0
    for session in Session.objects.iterator():
        try:
            data = session.get_decoded()
        except Exception:
            continue
        if str(data.get(SESSION_KEY) or "") == user_id or str(data.get("ltf_email_mfa_user") or "") == user_id:
            session.delete()
            ended += 1
    return ended
