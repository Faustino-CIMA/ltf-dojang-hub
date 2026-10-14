import json
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from accounts.models import User
from allauth.account.models import EmailAddress

from .health import DockerEndpoint, _read_http, collect_health, probe_docker
from .i18n import flatten_messages, unflatten_messages
from .models import AuthEvent, OpsAuditLog, SecurityAlert, TranslationOverride


class OpsAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.member = User.objects.create_user(
            username="clubmember",
            email="member@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        EmailAddress.objects.create(
            user=self.member, email=self.member.email, verified=True, primary=True
        )
        self.ltf_admin = User.objects.create_user(
            username="ltfadmin",
            email="ltf@example.com",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        EmailAddress.objects.create(
            user=self.ltf_admin, email=self.ltf_admin.email, verified=True, primary=True
        )
        self.superuser = User.objects.create_superuser(
            username="opsroot",
            email="ops@example.com",
            password="pass12345",
        )

    def _login(self, username, password="pass12345"):
        return self.client.post(
            "/api/auth/login/",
            {"username": username, "password": password},
            format="json",
        )

    def test_superuser_can_login_without_verified_email(self):
        response = self._login("opsroot")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["user"]["is_superuser"])
        self.assertTrue(
            AuthEvent.objects.filter(
                event_type=AuthEvent.EventType.LOGIN_SUCCESS, username_attempted="opsroot"
            ).exists()
        )

    def test_me_includes_is_superuser(self):
        token = Token.objects.create(user=self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_superuser"])

    def test_failed_login_writes_event(self):
        response = self._login("clubmember", password="wrong-password")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(
            AuthEvent.objects.filter(
                event_type=AuthEvent.EventType.LOGIN_FAILURE, username_attempted="clubmember"
            ).exists()
        )

    @override_settings(OPS_LOCKOUT_FAILURES=3, OPS_LOCKOUT_WINDOW_MINUTES=15)
    def test_lockout_after_repeated_failures(self):
        for _ in range(3):
            self._login("clubmember", password="wrong-password")
        self.assertTrue(
            SecurityAlert.objects.filter(code="brute_force_username", status=SecurityAlert.Status.OPEN).exists()
        )
        locked = self._login("clubmember", password="pass12345")
        self.assertEqual(locked.status_code, 400)
        self.assertTrue(
            AuthEvent.objects.filter(event_type=AuthEvent.EventType.LOCKOUT).exists()
        )

    def test_ltf_admin_cannot_access_ops(self):
        token = Token.objects.create(user=self.ltf_admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.get("/api/ops/overview/")
        self.assertEqual(response.status_code, 403)

    def test_superuser_can_access_ops(self):
        token = Token.objects.create(user=self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.get("/api/ops/overview/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("health", response.data)

    def test_logout_deletes_token_and_records_event(self):
        login = self._login("opsroot")
        token_key = login.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token_key}")
        response = self.client.post("/api/auth/logout/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Token.objects.filter(key=token_key).exists())
        self.assertTrue(
            AuthEvent.objects.filter(
                event_type=AuthEvent.EventType.LOGOUT, username_attempted="opsroot"
            ).exists()
        )

    def test_cannot_revoke_last_superuser(self):
        token = Token.objects.create(user=self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.post(
            f"/api/ops/users/{self.superuser.id}/",
            {"action": "revoke_superuser"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.superuser.refresh_from_db()
        self.assertTrue(self.superuser.is_superuser)

    def test_unknown_query_404(self):
        token = Token.objects.create(user=self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.post("/api/ops/queries/not-a-query/run/", {"params": {}}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_catalog_query_runs_and_audits(self):
        token = Token.objects.create(user=self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.post(
            "/api/ops/queries/accounts_hygiene/run/",
            {"params": {}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("columns", response.data)
        self.assertTrue(OpsAuditLog.objects.filter(action="query_run", target_id="accounts_hygiene").exists())

    def test_translation_page_returns_full_namespace_in_source_order(self):
        token = Token.objects.create(user=self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.get("/api/ops/translations/?namespace=Auth")
        self.assertEqual(response.status_code, 200)
        keys = [row["key"] for row in response.data["results"]]
        self.assertIn("Auth.loginTitle", keys)
        self.assertLess(keys.index("Auth.loginTitle"), keys.index("Auth.loginSubtitle"))
        self.assertTrue(all(row["namespace"] == "Auth" for row in response.data["results"]))
        self.assertGreaterEqual(response.data["count"], 10)

    def test_translation_meta_lists_pages(self):
        token = Token.objects.create(user=self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.get("/api/ops/translations/meta/")
        self.assertEqual(response.status_code, 200)
        ids = [page["id"] for page in response.data["pages"]]
        self.assertIn("ClubAdmin", ids)
        self.assertIn("Auth", ids)

    def test_translation_batch_save(self):
        token = Token.objects.create(user=self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.post(
            "/api/ops/translations/batch/",
            {
                "namespace": "Auth",
                "changes": [
                    {"locale": "lb", "key": "Auth.loginTitle", "value": "Aloggen (ops)"},
                    {"locale": "en", "key": "Auth.loginSubtitle", "value": "Ops subtitle"},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["saved"], 2)
        export = self.client.get("/api/ops/translations/export/lb/")
        self.assertIn("Aloggen (ops)", export.content.decode("utf-8"))

    def test_translation_override_export(self):
        token = Token.objects.create(user=self.superuser)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        TranslationOverride.objects.create(locale="lb", key="Auth.loginTitle", value="OPS LOGIN")
        response = self.client.get("/api/ops/translations/export/lb/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("OPS LOGIN", response.content.decode("utf-8"))

    def test_public_i18n_allows_anonymous(self):
        from django.core.cache import cache

        TranslationOverride.objects.create(locale="en", key="Auth.loginTitle", value="Ops Sign in")
        cache.delete("ops:i18n:en")
        response = self.client.get("/api/i18n/en/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get("Auth", {}).get("loginTitle"), "Ops Sign in")


class DockerHealthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.club_admin = User.objects.create_user(
            username="clubsuper",
            email="clubsuper@example.com",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.club_admin.is_superuser = True
        self.club_admin.is_staff = True
        self.club_admin.save(update_fields=["is_superuser", "is_staff"])

    @override_settings(OPS_DOCKER_SOCKET="")
    @patch("ops.health._configured_docker_host", return_value="")
    @patch("ops.health.os.path.exists", return_value=False)
    def test_unset_socket_is_unknown_not_down(self, _exists, _host):
        result = probe_docker()
        self.assertIsNone(result["ok"])
        self.assertFalse(result["configured"])
        self.assertEqual(result["state"], "unknown")
        self.assertIn("not configured", result["detail"].lower())
        health = collect_health()
        self.assertIn("docker", health["checks"])
        self.assertIsNone(health["checks"]["docker"]["ok"])
        self.assertEqual(health["checks"]["docker"]["detail"], result["detail"])

    @override_settings(OPS_DOCKER_SOCKET="/tmp/ltf-missing-docker.sock")
    def test_explicit_missing_socket_is_down(self):
        result = probe_docker()
        self.assertIs(result["ok"], False)
        self.assertTrue(result["configured"])
        self.assertEqual(result["state"], "down")

    @override_settings(OPS_DOCKER_SOCKET="")
    @patch("ops.health._docker_get", return_value=[])
    @patch("ops.health._configured_docker_host", return_value="unix:///custom/docker.sock")
    def test_docker_host_unix_socket(self, _host, docker_get):
        result = probe_docker()
        endpoint, path = docker_get.call_args[0]
        self.assertIsInstance(endpoint, DockerEndpoint)
        self.assertEqual(endpoint.kind, "unix")
        self.assertEqual(endpoint.target, "/custom/docker.sock")
        self.assertEqual(path, "/containers/json?all=1")
        self.assertTrue(result["ok"])
        self.assertEqual(result["state"], "up")
        self.assertEqual(result["detail"], "0 running, 0 containers")

    @override_settings(OPS_DOCKER_SOCKET="")
    @patch("ops.health._docker_get")
    @patch("ops.health._configured_docker_host", return_value="")
    def test_default_socket_when_present(self, _host, docker_get):
        docker_get.return_value = [
            {"Names": ["/ltf-backend"], "State": "running", "Status": "Up 2 hours"},
            {"Names": ["/ltf-db"], "State": "exited", "Status": "Exited"},
        ]

        def exists(path):
            return path == "/var/run/docker.sock"

        with patch("ops.health.os.path.exists", side_effect=exists):
            result = probe_docker()
        endpoint = docker_get.call_args[0][0]
        self.assertEqual(endpoint.target, "/var/run/docker.sock")
        self.assertTrue(result["ok"])
        self.assertEqual(result["detail"], "1 running, 2 containers")

    @override_settings(OPS_DOCKER_SOCKET="")
    @patch("ops.health._docker_get", return_value=[])
    @patch("ops.health._configured_docker_host", return_value="tcp://127.0.0.1:2375")
    def test_docker_host_tcp(self, _host, docker_get):
        result = probe_docker()
        endpoint = docker_get.call_args[0][0]
        self.assertEqual(endpoint.kind, "tcp")
        self.assertEqual(endpoint.target, "127.0.0.1")
        self.assertEqual(endpoint.port, 2375)
        self.assertTrue(result["ok"])

    @override_settings(OPS_DOCKER_SOCKET="")
    @patch("ops.health._configured_docker_host", return_value="https://127.0.0.1:2376")
    def test_tls_docker_host_is_down(self, _host):
        result = probe_docker()
        self.assertIs(result["ok"], False)
        self.assertIn("TLS", result["detail"])

    @override_settings(OPS_DOCKER_SOCKET="")
    @patch("ops.health._configured_docker_host", return_value="npipe:////./pipe/docker_engine")
    def test_named_pipe_host_is_down(self, _host):
        result = probe_docker()
        self.assertIs(result["ok"], False)
        self.assertTrue(result["configured"])
        self.assertIn("named pipe", result["detail"].lower())

    @override_settings(OPS_DOCKER_SOCKET="")
    @patch("ops.health._docker_get", side_effect=PermissionError("[Errno 13] Permission denied"))
    @patch("ops.health._configured_docker_host", return_value="")
    @patch("ops.health.os.path.exists", return_value=True)
    def test_permission_denied_mentions_socket_group(self, _exists, _host, _docker_get):
        result = probe_docker()
        self.assertIs(result["ok"], False)
        self.assertIn("permission denied", result["detail"].lower())
        self.assertIn("group", result["detail"].lower())

    def test_chunked_docker_http_body_is_decoded(self):
        payload = b'[{"Names":["/api"],"State":"running"}]'
        raw = (
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n"
            + format(len(payload), "x").encode()
            + b"\r\n"
            + payload
            + b"\r\n0\r\n\r\n"
        )
        status, body = _read_http(_ChunkReader(raw, size=7))
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)[0]["Names"], ["/api"])

    def test_content_length_docker_http_body_is_decoded(self):
        payload = b"[]"
        raw = b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n[]TRAILING"
        status, body = _read_http(_ChunkReader(raw, size=5))
        self.assertEqual(status, 200)
        self.assertEqual(body, payload)

    @override_settings(OPS_DOCKER_SOCKET="/var/run/docker.sock")
    @patch("ops.health._docker_get")
    def test_completed_docker_probe_stays_in_the_payload(self, docker_get):
        docker_get.return_value = [
            {"Names": ["/ltf-backend"], "State": "running", "Status": "Up 2 hours"},
        ]
        result = probe_docker()
        self.assertTrue(result["ok"])
        self.assertEqual(result["state"], "up")
        self.assertEqual(result["detail"], "1 running, 1 containers")
        self.assertEqual(result["containers"][0]["name"], "ltf-backend")

    @override_settings(OPS_DOCKER_SOCKET="")
    @patch("ops.health._configured_docker_host", return_value="")
    @patch("ops.health.os.path.exists", return_value=False)
    def test_club_admin_superuser_overview_includes_docker(self, _exists, _host):
        token = Token.objects.create(user=self.club_admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.get("/api/ops/overview/")
        self.assertEqual(response.status_code, 200)
        docker = response.data["health"]["checks"]["docker"]
        self.assertIn("detail", docker)
        self.assertIn("ok", docker)
        self.assertIsNone(docker["ok"])
        self.assertFalse(docker["configured"])

    @patch("ops.health.probe_postgres", return_value={"ok": True, "detail": "connected"})
    @patch("ops.health.probe_redis", return_value={"ok": True, "detail": "reachable"})
    @patch("ops.health.probe_celery", return_value={"ok": True, "detail": "workers responded"})
    @patch("ops.health.probe_smtp", return_value={"ok": True, "detail": "open"})
    @patch("ops.health.probe_media", return_value={"ok": True, "detail": "writable"})
    @patch("ops.health.probe_migrations", return_value={"ok": True, "detail": "up to date"})
    @patch("ops.health.probe_env_keys", return_value={"ok": True, "detail": "presence only"})
    @patch(
        "ops.health.probe_docker",
        return_value={"ok": None, "detail": "not configured", "configured": False, "state": "unknown"},
    )
    def test_unknown_docker_does_not_fail_overall_health(self, *_mocks):
        health = collect_health()
        self.assertTrue(health["ok"])
        self.assertIsNone(health["checks"]["docker"]["ok"])


class _ChunkReader:
    def __init__(self, payload: bytes, size: int = 8):
        self.payload = payload
        self.size = size
        self.offset = 0

    def recv(self, count: int) -> bytes:
        if self.offset >= len(self.payload):
            return b""
        take = min(self.size, count, len(self.payload) - self.offset)
        chunk = self.payload[self.offset : self.offset + take]
        self.offset += take
        return chunk


class I18nHelperTests(TestCase):
    def test_flatten_roundtrip(self):
        nested = {"Auth": {"loginTitle": "Sign in"}, "Home": {"title": "LTF"}}
        flat = flatten_messages(nested)
        self.assertEqual(flat["Auth.loginTitle"], "Sign in")
        self.assertEqual(unflatten_messages(flat)["Home"]["title"], "LTF")
