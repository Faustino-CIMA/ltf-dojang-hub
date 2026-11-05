"""End every open sign-in for one login.

The app token is the Django session key. Deleting those sessions, and any
legacy API token, means a leftover browser token cannot keep calling the API.
"""

from __future__ import annotations

from django.contrib.auth import SESSION_KEY
from django.contrib.sessions.models import Session


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
