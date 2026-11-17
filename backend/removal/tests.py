import io
import shutil
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

import removal.inference as inference
from removal.inference import RemovalUnavailable
from removal.tasks import cutout_photo
from removal.views import RemovalRateThrottle

PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
    b"\x00\x00\x00\x03\x00\x01\x00\x05\xfe\x02\xfe\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _photo() -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), (180, 140, 120)).save(buffer, format="PNG")
    return SimpleUploadedFile("face.png", buffer.getvalue(), content_type="image/png")


@override_settings(
    REMOVAL_INLINE=True,
    REMOVAL_MAX_BYTES=12 * 1024 * 1024,
    REST_FRAMEWORK={
        "DEFAULT_AUTHENTICATION_CLASSES": [
            "rest_framework.authentication.SessionAuthentication",
            "ops.authentication.TokenAuthenticationWithMeta",
        ],
        "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
        "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.UserRateThrottle"],
        "DEFAULT_THROTTLE_RATES": {"user": "6000/hour", "removal": "2/hour"},
    },
)
class ServerCutoutTests(TestCase):
    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media)
        self.settings_override = self.settings(MEDIA_ROOT=self.media)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        user = get_user_model().objects.create_user(username="cutout-user", password="pass12345")
        token = Token.objects.create(user=user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    def test_requires_a_signed_in_user(self):
        anonymous = APIClient()
        response = anonymous.post("/api/photos/cutout/", {"image": _photo()}, format="multipart")
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_rejects_an_oversized_photo_and_does_not_keep_it(self):
        huge = SimpleUploadedFile("big.png", b"x" * 64, content_type="image/png")
        with self.settings(REMOVAL_MAX_BYTES=32):
            response = self.client.post("/api/photos/cutout/", {"image": huge}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        self.assertEqual(list(Path(self.media).rglob("*")), [])

    def test_rate_limit_and_discards_the_original(self):
        def fake(image: bytes) -> bytes:
            self.assertTrue(image.startswith(b"\x89PNG"))
            return PNG

        RemovalRateThrottle.rate = "2/hour"
        self.addCleanup(lambda: setattr(RemovalRateThrottle, "rate", None))
        with self.settings(REMOVAL_INLINE=True):
            from unittest.mock import patch

            with patch("removal.views.cutout_png", side_effect=fake):
                with self.assertLogs("removal", level="INFO") as logs:
                    first = self.client.post("/api/photos/cutout/", {"image": _photo()}, format="multipart")
                second = self.client.post("/api/photos/cutout/", {"image": _photo()}, format="multipart")
                third = self.client.post("/api/photos/cutout/", {"image": _photo()}, format="multipart")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first["Content-Type"], "image/png")
        self.assertTrue(first.content.startswith(b"\x89PNG"))
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(list(Path(self.media).rglob("*")), [])
        written = " ".join(logs.output)
        self.assertNotIn("iVBORw0KGgo", written)
        self.assertIn("bytes_out=", written)

    def test_a_stopped_worker_answers_unavailable(self):
        from unittest.mock import MagicMock, patch

        job = MagicMock()
        job.get.side_effect = TimeoutError("worker gone")
        with self.settings(REMOVAL_INLINE=False):
            with patch("removal.views.cutout_photo.apply_async", return_value=job) as queued:
                with patch("removal.views.cutout_png") as inline:
                    response = self.client.post("/api/photos/cutout/", {"image": _photo()}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        queued.assert_called_once()
        self.assertEqual(queued.call_args.kwargs["queue"], "removal")
        inline.assert_not_called()
        job.forget.assert_called_once()
        self.assertEqual(list(Path(self.media).rglob("*")), [])

    def test_unavailable_model_is_a_quiet_failure(self):
        from unittest.mock import patch

        with patch("removal.views.cutout_png", side_effect=RemovalUnavailable("weights missing")):
            response = self.client.post("/api/photos/cutout/", {"image": _photo()}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(list(Path(self.media).rglob("*")), [])

    def test_the_job_is_not_on_the_mail_queue(self):
        self.assertEqual(cutout_photo.queue, "removal")

    def test_the_model_is_dropped_after_the_photo(self):
        from unittest.mock import patch

        inference._loaded = object()
        photo = _photo().read()

        def fake_alpha(image):
            self.assertIsNotNone(inference._loaded)
            return Image.new("L", image.size, 255)

        with patch.object(inference, "_alpha", fake_alpha):
            png = inference.cutout_png(photo)
        self.assertTrue(png.startswith(b"\x89PNG"))
        self.assertIsNone(inference._loaded)

    def test_the_worker_exits_after_one_photo(self):
        from django.conf import settings

        compose = Path(__file__).resolve().parents[2] / "docker-compose.yml"
        text = compose.read_text()
        block = text.split("removal-worker:", 1)[1].split("\n  beat:", 1)[0]
        self.assertIn("--pool=prefork", block)
        self.assertIn("--concurrency=1", block)
        self.assertIn("--max-tasks-per-child=1", block)
        self.assertIn("-Q removal", block)
        self.assertNotIn("profiles:", block)
        self.assertIn("mem_limit: 5g", block)
        self.assertIn("memswap_limit: 5g", block)
        self.assertNotIn("celery,removal", block)
        self.assertGreaterEqual(settings.REMOVAL_WAIT_SECONDS, 100)
        worker = text.split("\n  worker:", 1)[1].split("\n  removal-worker:", 1)[0]
        self.assertIn("-Q celery,", worker)
        self.assertIn("print_jobs", worker)
        self.assertNotIn("removal", worker)
        backend = text.split("\n  backend:", 1)[1].split("\n  worker:", 1)[0]
        self.assertNotIn("removal-worker", backend)
