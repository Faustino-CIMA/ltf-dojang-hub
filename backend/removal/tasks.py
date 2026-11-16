"""Cutout jobs. This queue is not the mail or billing worker."""

import base64

from celery import shared_task

from removal.inference import cutout_png


@shared_task(queue="removal", result_expires=60, ignore_result=False)
def cutout_photo(image_b64: str) -> str:
    raw = base64.b64decode(image_b64)
    try:
        png = cutout_png(raw)
        return base64.b64encode(png).decode("ascii")
    finally:
        del raw
