from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings

from accounts.management.commands.post_deploy_check import deploy_check_host
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

    def test_prefers_an_api_host_and_honours_an_override(self):
        self.assertEqual(
            deploy_check_host(["app.example.org", "*.example.org", "api.example.org"]),
            "api.example.org",
        )
        self.assertEqual(deploy_check_host(["*"]), "")
        self.assertEqual(
            deploy_check_host(["api.example.org"], "app.example.org"),
            "app.example.org",
        )

    @override_settings(
        ALLOWED_HOSTS=["api.example.org"],
        DEBUG=False,
        SECURE_SSL_REDIRECT=True,
        SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https"),
    )
    def test_prod_like_host_returns_200(self):
        User.objects.create_user(
            username="deploy-check-prod",
            email="deploy-check-prod@example.com",
            password="pass12345",
        )
        out = StringIO()
        call_command("post_deploy_check", stdout=out)
        text = out.getvalue()
        self.assertEqual(text, "health 200\nauth 200\n")
        self.assertNotIn("api.example.org", text)
        self.assertNotIn("pass12345", text)

    @override_settings(
        ALLOWED_HOSTS=["api.example.org"],
        DEBUG=False,
        SECURE_SSL_REDIRECT=True,
    )
    def test_a_disallowed_host_is_a_hint_and_not_the_name(self):
        User.objects.create_user(
            username="deploy-check-bad-host",
            email="deploy-check-bad-host@example.com",
            password="pass12345",
        )
        out = StringIO()
        with self.assertRaises(SystemExit):
            call_command("post_deploy_check", "--host=not-listed.example", stdout=out)
        text = out.getvalue()
        self.assertEqual(text, "health 400 (host)\nauth 400 (host)\n")
        self.assertNotIn("not-listed.example", text)
