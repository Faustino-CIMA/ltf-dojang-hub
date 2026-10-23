from django.core.management.base import BaseCommand

from accounts.demo_guard import assert_demo_seed_allowed
from accounts.demo_seed import ensure_demo_accounts, seed_demo_world


class Command(BaseCommand):
    help = (
        "Create or update the fictional demo logins. Refuses to run unless "
        "DEMO_MODE=true. Without --with-data it only attaches those logins to "
        "demo clubs that already exist. Passwords come from DEMO_*_PASSWORD "
        "when set; otherwise a new account gets a random password printed once."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--with-data",
            action="store_true",
            help="Also create the fictional clubs, members, licences, teams, invoices, and events.",
        )
        parser.add_argument(
            "--force-demo",
            action="store_true",
            help=(
                "With DEMO_MODE=true, continue when this database also contains "
                "clubs or members that are not demo data. Those rows are not modified."
            ),
        )

    def handle(self, *args, **options):
        assert_demo_seed_allowed(force=options["force_demo"])
        if options["with_data"]:
            seed_demo_world(self)
            return
        ensure_demo_accounts(self)
