from rest_framework.authentication import TokenAuthentication, get_authorization_header
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import AuthenticationFailed

from accounts.allauth_session import authenticate_session_token
from accounts.mfa import legacy_tokens_open

from .request_utils import touch_token_meta


class TokenAuthenticationWithMeta(TokenAuthentication):
    """Accept an allauth session token, or a DRF token until the sunset date."""

    def authenticate(self, request):
        key = self._key_from_header(request)
        if not key:
            key = request.headers.get("X-Session-Token") or None
        if not key:
            return None
        token = Token.objects.select_related("user").filter(key=key).first()
        if token is not None:
            if not legacy_tokens_open():
                raise AuthenticationFailed("token_sunset")
            if not token.user.is_active:
                raise AuthenticationFailed("account_unavailable")
            touch_token_meta(token, request)
            return (token.user, token)
        user, session = authenticate_session_token(key)
        if user is None or session is None:
            raise AuthenticationFailed("account_unavailable")
        if not user.is_active:
            raise AuthenticationFailed("account_unavailable")
        django_request = getattr(request, "_request", request)
        django_request._allauth_token_session = session
        django_request.session = session
        return (user, session)

    def _key_from_header(self, request):
        auth = get_authorization_header(request).split()
        if not auth:
            return None
        if auth[0].lower() != self.keyword.lower().encode():
            return None
        if len(auth) == 1:
            raise AuthenticationFailed("Invalid token header. No credentials provided.")
        if len(auth) > 2:
            raise AuthenticationFailed("Invalid token header. Token string should not contain spaces.")
        try:
            return auth[1].decode()
        except UnicodeError as exc:
            raise AuthenticationFailed("Invalid token header. Token string should not contain invalid characters.") from exc
