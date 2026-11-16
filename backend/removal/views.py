"""Signed-in cutout. The original is not stored and is not written to the log."""

import base64
import logging

from django.conf import settings
from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from removal.inference import RemovalUnavailable, cutout_png
from removal.tasks import cutout_photo

logger = logging.getLogger("removal")


class RemovalRateThrottle(UserRateThrottle):
    scope = "removal"


def run_cutout(image: bytes) -> bytes:
    if getattr(settings, "REMOVAL_INLINE", False):
        return cutout_png(image)
    encoded = base64.b64encode(image).decode("ascii")
    job = cutout_photo.apply_async(args=(encoded,), queue="removal")
    del encoded
    try:
        payload = job.get(
            timeout=getattr(settings, "REMOVAL_WAIT_SECONDS", 45),
            disable_sync_subtasks=True,
        )
    except Exception as exc:
        raise RemovalUnavailable("server cutout failed") from exc
    finally:
        job.forget()
    return base64.b64decode(payload)


class ServerCutoutView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [RemovalRateThrottle]

    def post(self, request):
        upload = request.FILES.get("image")
        if upload is None:
            return Response({"detail": "A photo is required."}, status=status.HTTP_400_BAD_REQUEST)
        limit = int(getattr(settings, "REMOVAL_MAX_BYTES", 12 * 1024 * 1024))
        if getattr(upload, "size", 0) > limit:
            return Response({"detail": "The photo is too large."}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        image = upload.read()
        if len(image) > limit:
            del image
            return Response({"detail": "The photo is too large."}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        try:
            png = run_cutout(image)
        except RemovalUnavailable:
            logger.info("removal.unavailable user_id=%s bytes=%s", request.user.pk, len(image))
            return Response({"detail": "Removal is unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        finally:
            del image
        logger.info("removal.ready user_id=%s bytes_out=%s", request.user.pk, len(png))
        return HttpResponse(png, content_type="image/png")
