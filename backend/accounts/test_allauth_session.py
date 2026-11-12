from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from accounts.allauth_session import authenticate_session_token, user_and_session


class AllauthSessionAdapterTests(SimpleTestCase):
    def test_tuple_object_and_empty_results(self):
        user = object()
        session = object()
        self.assertEqual(user_and_session((user, session)), (user, session))
        self.assertEqual(user_and_session(SimpleNamespace(user=user, session=session)), (user, session))
        self.assertEqual(user_and_session(None), (None, None))
        self.assertEqual(user_and_session(("only-one",)), (None, None))

    def test_authenticate_session_token_calls_allauth_once(self):
        user = object()
        session = object()
        with patch(
            "allauth.headless.internal.sessionkit.authenticate_by_x_session_token",
            return_value=SimpleNamespace(user=user, session=session),
        ) as found:
            self.assertEqual(authenticate_session_token("session-key"), (user, session))
        found.assert_called_once_with("session-key")
