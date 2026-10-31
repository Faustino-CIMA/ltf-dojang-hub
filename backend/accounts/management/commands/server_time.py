from datetime import timezone as datetime_timezone

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Print this server's current UTC time so it can be compared with a phone."

    def handle(self, *args, **options):
        stamp = timezone.now().astimezone(datetime_timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        self.stdout.write(stamp)
