"""Cutout jobs. This queue is not the mail or billing worker."""

import base64
import time

from celery import shared_task
from django.core.cache import cache
from django.utils import timezone

from removal.inference import cutout_png

LAST_SUCCESS_KEY = "removal:last_success"


@shared_task(queue="removal", result_expires=60, ignore_result=False)
def cutout_photo(image_b64: str) -> str:
    raw = base64.b64decode(image_b64)
    started = time.monotonic()
    try:
        png = cutout_png(raw)
        cache.set(
            LAST_SUCCESS_KEY,
            {
                "finished_at": timezone.now().isoformat(),
                "duration_ms": round((time.monotonic() - started) * 1000),
            },
            timeout=60 * 60 * 24 * 30,
        )
        return base64.b64encode(png).decode("ascii")
    finally:
        del raw
