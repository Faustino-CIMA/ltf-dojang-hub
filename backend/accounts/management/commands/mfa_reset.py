from django.core.management.base import BaseCommand, CommandError

from accounts.mfa import RESET_GRACE_DAYS, reset_totp_from_command
from accounts.models import User


class Command(BaseCommand):
    help = (
        "Remove one user's authenticator app so they can sign in and set it up again. "
        f"Passkeys and recovery codes stay. They get {RESET_GRACE_DAYS} days of enrolment grace. "
        "The reset is written to the ops audit log. Email codes are not turned on."
    )

    def add_arguments(self, parser):
        parser.add_argument("username")

    def handle(self, *args, **options):
        username = str(options["username"])
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist as exc:
            raise CommandError(f"No user named {username}.") from exc
        until = reset_totp_from_command(user)
        self.stdout.write(
            f"Removed the authenticator app for {username}. Enrolment grace runs until {until}."
        )
