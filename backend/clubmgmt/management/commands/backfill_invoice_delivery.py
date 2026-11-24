"""Store post for members the club record import left on the default email.

Dry run is the default. It prints a count per club and nothing about a person.
Pass --apply to write the change. Nothing here runs on deploy.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q

from clubmgmt.models import Family, MemberAddress, MemberEmail, MemberRecord
from members.models import Member
from ops.models import OpsAuditLog


def _members(club_id: int | None):
    one_address = Member.objects.annotate(address_count=Count("club_addresses")).filter(address_count=1)
    if club_id is not None:
        one_address = one_address.filter(club_id=club_id)
    no_invoice_email = (Q(email="") | Q(email__isnull=True)) & ~Exists(
        MemberEmail.objects.filter(member=OuterRef("pk")).exclude(email="")
    )
    still_email = Q(club_record__invoice_delivery=MemberRecord.InvoiceDelivery.EMAIL) | Q(club_record__isnull=True)
    family_post = Exists(
        Family.objects.filter(
            invoice_member=OuterRef("pk"),
            bill_to_delivery=MemberRecord.InvoiceDelivery.POST,
        )
    )
    unmarked = ~Exists(MemberAddress.objects.filter(member=OuterRef("pk"), use_for_invoice=True))
    email_only = one_address.filter(still_email, no_invoice_email)
    family_only = one_address.filter(family_post, unmarked)
    return (email_only | family_only).distinct().order_by("club_id", "id")


def planned_counts(club_id: int | None = None) -> dict[int, int]:
    counts: dict[int, int] = {}
    for row in _members(club_id).values_list("club_id", flat=True):
        counts[row] = counts.get(row, 0) + 1
    return counts


def apply_backfill(club_id: int | None = None) -> dict[int, int]:
    with transaction.atomic():
        chosen = list(_members(club_id).select_related("club_record"))
        counts: dict[int, int] = {}
        for member in chosen:
            address = member.club_addresses.order_by("id").first()
            if address is None:
                continue
            if not address.use_for_invoice:
                address.use_for_invoice = True
                address.save(update_fields=["use_for_invoice"])
            record, created = MemberRecord.objects.get_or_create(
                member=member,
                defaults={"invoice_delivery": MemberRecord.InvoiceDelivery.POST},
            )
            if not created and record.invoice_delivery != MemberRecord.InvoiceDelivery.POST:
                record.invoice_delivery = MemberRecord.InvoiceDelivery.POST
                record.save(update_fields=["invoice_delivery", "updated_at"])
            counts[member.club_id] = counts.get(member.club_id, 0) + 1
        total = sum(counts.values())
        OpsAuditLog.objects.create(
            action="backfill_invoice_delivery",
            target_type="club" if club_id else "",
            target_id="" if club_id is None else str(club_id),
            message=f"Stored post for {total} members.",
            metadata={"total": total, "by_club": {str(key): value for key, value in sorted(counts.items())}},
        )
        return counts


class Command(BaseCommand):
    help = (
        "Store post and tick the only address when delivery is still email with no invoice email, "
        "or when a family sends that member's invoice by post. Dry run unless --apply."
    )

    def add_arguments(self, parser):
        parser.add_argument("--club", type=int, default=None, help="Limit the run to one club id.")
        parser.add_argument("--apply", action="store_true", help="Write the change. Without this, only counts are printed.")

    def handle(self, *args, **options):
        club_id = options["club"]
        if club_id is not None and not Member.objects.filter(club_id=club_id).exists() and not _club_exists(club_id):
            raise CommandError(f"No club {club_id}.")
        if options["apply"]:
            counts = apply_backfill(club_id)
            mode = "applied"
        else:
            counts = planned_counts(club_id)
            mode = "dry run"
        shown = counts
        if club_id is not None and club_id not in shown:
            shown = {club_id: 0, **shown}
        for key in sorted(shown):
            self.stdout.write(f"club {key}: {shown[key]}")
        self.stdout.write(f"total: {sum(counts.values())}")
        self.stdout.write(mode)


def _club_exists(club_id: int) -> bool:
    from clubs.models import Club

    return Club.objects.filter(pk=club_id).exists()
