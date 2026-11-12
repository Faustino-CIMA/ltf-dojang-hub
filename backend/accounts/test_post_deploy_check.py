from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from accounts.models import User


class PostDeployCheckTests(TestCase):
    def test_prints_status_codes_and_no_secret(self):
        User.objects.create_user(
            username="deploy-check",
            email="deploy-check@example.com",
            password="pass12345",
        )
        out = StringIO()
        call_command("post_deploy_check", stdout=out)
        text = out.getvalue()
        self.assertEqual(text, "health 200\nauth 200\n")
        self.assertNotIn("Token", text)
        self.assertNotIn("pass12345", text)

    def test_fails_when_nobody_can_sign_in(self):
        out = StringIO()
        with self.assertRaises(SystemExit) as raised:
            call_command("post_deploy_check", stdout=out)
        self.assertEqual(raised.exception.code, 1)
        self.assertEqual(out.getvalue(), "health 200\nauth 0\n")
