import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0022_license_fee_billing"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CoachPayRate",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "basis",
                    models.CharField(
                        choices=[("hourly", "Per hour"), ("unit", "Per training unit")],
                        default="hourly",
                        max_length=20,
                    ),
                ),
                ("rate", models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "club",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="coach_pay_rates",
                        to="clubs.club",
                    ),
                ),
                (
                    "coach",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="coach_pay_rates",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["coach_id"], "unique_together": {("club", "coach")}},
        ),
        migrations.CreateModel(
            name="CoachOuting",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("held_on", models.DateField()),
                ("name", models.CharField(max_length=160)),
                ("quantity", models.DecimalField(decimal_places=2, default=0, max_digits=6)),
                ("coaching_amount", models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ("fuel_amount", models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ("hotel_amount", models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "club",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="coach_outings",
                        to="clubs.club",
                    ),
                ),
                (
                    "coach",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="coach_outings",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["held_on", "id"]},
        ),
    ]
