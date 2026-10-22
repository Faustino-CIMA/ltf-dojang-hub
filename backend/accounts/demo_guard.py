"""Shared refusal rules for every demo seed command."""

from django.conf import settings
from django.core.management.base import CommandError


def assert_demo_seed_allowed(*, force: bool) -> None:
    """Stop before any write unless this process is the separate demo app.

    DEMO_MODE alone is not enough when the database already holds clubs or
    members that were not marked as demo data. --force-demo is ignored unless
    DEMO_MODE is also on, and even then the seeders only touch demo rows.
    """

    if not getattr(settings, "DEMO_MODE", False):
        raise CommandError(
            "Refusing to seed demo data. Set DEMO_MODE=true on a separate empty "
            "demo database. This command must not be run against the live "
            "federation database. Nothing was changed."
        )
    if force:
        return
    from clubs.models import Club
    from members.models import Member

    if Club.objects.filter(is_demo=False).exists() or Member.objects.filter(is_demo=False).exists():
        raise CommandError(
            "Refusing to seed: this database already has clubs or members that "
            "are not demo data. Use an empty database for the demo app. "
            "--force-demo is only valid together with DEMO_MODE, and it still "
            "does not modify rows that are not marked as demo data. Nothing was changed."
        )
