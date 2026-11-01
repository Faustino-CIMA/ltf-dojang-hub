"""Django's reset token, plus a generation so a new link kills the older ones."""

from django.contrib.auth.tokens import PasswordResetTokenGenerator


class ResetTokenGenerator(PasswordResetTokenGenerator):
    def _make_hash_value(self, user, timestamp):
        generation = int(getattr(user, "password_reset_generation", 0) or 0)
        return f"{super()._make_hash_value(user, timestamp)}{generation}"

    def check_token(self, user, token):
        if super().check_token(user, token):
            return True
        # Links emailed before the generation column existed still work until a new link is issued.
        generation = int(getattr(user, "password_reset_generation", 0) or 0)
        if generation == 0:
            return PasswordResetTokenGenerator().check_token(user, token)
        return False
