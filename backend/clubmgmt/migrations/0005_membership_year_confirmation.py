from django.conf import settings
from django.db import migrations, models
from django.utils import timezone
import django.db.models.deletion


def settle_zero_invoices(apps, schema_editor):
    # The live Invoice model includes bill_to_* columns from licenses.0045.
    # That migration is applied later, so this step must not query through it.
    FamilyMember = apps.get_model("clubmgmt", "FamilyMember")
    Confirmation = apps.get_model("clubmgmt", "MembershipYearConfirmation")
    now = timezone.now()
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT i.id, i.club_id, o.id, o.member_id, item.billing_year
            FROM licenses_invoice AS i
            INNER JOIN licenses_order AS o ON o.id = i.order_id
            INNER JOIN licenses_orderitem AS item ON item.order_id = o.id
            WHERE i.status = %s
              AND i.total = 0
              AND o.ledger = %s
              AND item.fee_type_id IS NULL
              AND item.license_id IS NULL
              AND (
                    item.billing_year IS NOT NULL
                    OR item.description ILIKE %s
                  )
            """,
            ["issued", "club", "%membership%"],
        )
        invoices = {}
        for invoice_id, club_id, order_id, member_id, billing_year in cursor.fetchall():
            row = invoices.setdefault(
                invoice_id,
                {"club_id": club_id, "order_id": order_id, "member_id": member_id, "year": None},
            )
            if row["year"] is None and billing_year is not None:
                row["year"] = billing_year
        for invoice_id, row in invoices.items():
            cursor.execute(
                "UPDATE licenses_invoice SET status = %s, updated_at = %s WHERE id = %s",
                ["void", now, invoice_id],
            )
            cursor.execute(
                "UPDATE licenses_order SET status = %s, updated_at = %s WHERE id = %s",
                ["cancelled", now, row["order_id"]],
            )
            cursor.execute(
                "UPDATE licenses_orderitem SET charge_active = %s WHERE order_id = %s AND charge_active = %s",
                [False, row["order_id"], True],
            )
            cursor.execute(
                "UPDATE licenses_payment SET status = %s WHERE invoice_id = %s AND status = %s",
                ["cancelled", invoice_id, "pending"],
            )
            if row["year"] is None or row["member_id"] is None:
                continue
            link = FamilyMember.objects.filter(member_id=row["member_id"]).order_by("id").first()
            household_key = (
                f"family-{link.family_id}" if link is not None else f"member-{row['member_id']}"
            )
            Confirmation.objects.get_or_create(
                club_id=row["club_id"],
                year=row["year"],
                household_key=household_key,
            )


def noop(apps, schema_editor):
    return None


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("clubmgmt", "0004_member_membership_fee"),
    ]

    operations = [
        migrations.CreateModel(
            name="MembershipYearConfirmation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("year", models.PositiveIntegerField()),
                ("household_key", models.CharField(max_length=40)),
                ("confirmed_at", models.DateTimeField(auto_now_add=True)),
                (
                    "club",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="membership_year_confirmations",
                        to="clubs.club",
                    ),
                ),
                (
                    "confirmed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="membership_year_confirmations",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-year", "household_key"],
            },
        ),
        migrations.AddConstraint(
            model_name="membershipyearconfirmation",
            constraint=models.UniqueConstraint(
                fields=("club", "year", "household_key"),
                name="clubmgmt_year_confirm_uniq",
            ),
        ),
        migrations.RunPython(settle_zero_invoices, noop),
    ]
