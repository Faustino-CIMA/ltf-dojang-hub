from django.core.management.base import BaseCommand

from modules.codes import KEY_SOURCE_ENV, ensure_install_keys
from modules.entitlements import install_id_str


class Command(BaseCommand):
    help = (
        "Create this install's product-code signing key once. "
        "Safe to run on every startup. Does not print the key."
    )

    def handle(self, *args, **options):
        source, created = ensure_install_keys()
        install_id = install_id_str()
        if source == KEY_SOURCE_ENV:
            self.stdout.write(
                "Product-code keys come from MODULE_CODE_PUBLIC_KEY / "
                "MODULE_CODE_PRIVATE_KEY. The database key was not changed."
            )
            return
        if created:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Created a product-code signing key for install {install_id}. "
                    "It is stored in the database. Back up the database to keep it."
                )
            )
            return
        self.stdout.write(
            self.style.SUCCESS(
                f"Product-code signing key is already stored for install {install_id}."
            )
        )
