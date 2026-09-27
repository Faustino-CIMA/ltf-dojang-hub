from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def settle_zero_invoices(apps, schema_editor):
    from clubmgmt.billing import settle_zero_euro_membership_invoices

    settle_zero_euro_membership_invoices()


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
