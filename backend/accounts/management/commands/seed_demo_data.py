from django.core.management.base import BaseCommand

from accounts.demo_guard import assert_demo_seed_allowed
from accounts.demo_seed import seed_demo_world


class Command(BaseCommand):
    help = (
        "Create or update fictional Luxembourg-style demo clubs, members, "
        "licenses, teams, equipment sizes, club invoices, calendar events, and "
        "the demo logins. Refuses to run unless DEMO_MODE=true. Safe to run again."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--force-demo",
            action="store_true",
            help=(
                "With DEMO_MODE=true, continue when this database also contains "
                "clubs or members that are not demo data. Those rows are not modified, "
                "and install-wide modules are left unchanged."
            ),
        )

    def handle(self, *args, **options):
        assert_demo_seed_allowed(force=options["force_demo"])
        seed_demo_world(self)
