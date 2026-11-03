from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from clubmgmt.caclr import refresh_luxembourg_register


class Command(BaseCommand):
    help = "Download the public CACLR address register and refresh the Luxembourg lookup cache."

    def handle(self, *args, **options):
        try:
            stats = refresh_luxembourg_register()
        except Exception as exc:
            raise CommandError(f"Luxembourg address register was not updated: {exc}") from exc
        self.stdout.write(
            f"Luxembourg address register refreshed: {stats['streets']} streets, {stats['houses']} house numbers."
        )
