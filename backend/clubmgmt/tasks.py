from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="clubmgmt.tasks.refresh_luxembourg_addresses")
def refresh_luxembourg_addresses():
    """Monthly refresh of the public CACLR address register. Keeps the old cache on failure."""
    from clubmgmt.caclr import refresh_luxembourg_register

    try:
        return refresh_luxembourg_register()
    except Exception:
        logger.exception("Luxembourg address register refresh failed")
        raise
