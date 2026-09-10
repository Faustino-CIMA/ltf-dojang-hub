from django.core.management.base import BaseCommand, CommandError
from django.utils.dateparse import parse_datetime

from modules.codes import ProductCodeError, build_payload, sign_payload
from modules.entitlements import install_id_str
from modules.registry import KNOWN_MODULE_IDS


class Command(BaseCommand):
    help = "Mint a signed product code for this install. Paste it on the ops Modules page."

    def add_arguments(self, parser):
        parser.add_argument(
            "--modules",
            required=True,
            help="Comma-separated module ids, for example preview or preview,club_management",
        )
        parser.add_argument(
            "--expires",
            default="",
            help="Optional ISO datetime, for example 2027-12-31T23:59:59Z",
        )

    def handle(self, *args, **options):
        module_ids = [item.strip() for item in str(options["modules"]).split(",") if item.strip()]
        unknown = [mid for mid in module_ids if mid not in KNOWN_MODULE_IDS]
        if unknown:
            raise CommandError(f"Unknown module id: {', '.join(unknown)}")
        expires_at = None
        expires_raw = str(options.get("expires") or "").strip()
        if expires_raw:
            expires_at = parse_datetime(expires_raw)
            if expires_at is None:
                raise CommandError("Could not parse --expires.")
        try:
            payload = build_payload(
                module_ids=module_ids,
                install_id=install_id_str(),
                expires_at=expires_at,
            )
            token = sign_payload(payload)
        except ProductCodeError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(token)
        self.stdout.write(self.style.NOTICE(f"jti={payload['jti']} modules={','.join(payload['modules'])}"))
