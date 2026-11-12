"""The only call into allauth's session-token helper.

allauth 65.22 returns an object with ``user`` and ``session``. Earlier
releases return ``(user, session)``. Callers of this module see one shape.
"""

from __future__ import annotations


def user_and_session(found):
    if found is None:
        return None, None
    if isinstance(found, tuple):
        if len(found) != 2:
            return None, None
        return found[0], found[1]
    return getattr(found, "user", None), getattr(found, "session", None)


def authenticate_session_token(key: str):
    from allauth.headless.internal.sessionkit import authenticate_by_x_session_token

    return user_and_session(authenticate_by_x_session_token(key))
