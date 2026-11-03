import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0019_ltf_staff_medic_and_media"),
        ("clubmgmt", "0025_committee_term_audit"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="BodyMeasurement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("measured_on", models.DateField()),
                ("weight_kg", models.DecimalField(blank=True, decimal_places=1, max_digits=5, null=True)),
                ("height_cm", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("note", models.CharField(blank=True, max_length=240)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "member",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="body_measurements",
                        to="members.member",
                    ),
                ),
                (
                    "recorded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="recorded_body_measurements",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-measured_on", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="bodymeasurement",
            index=models.Index(fields=["member", "measured_on"], name="body_measure_member_date_idx"),
        ),
    ]
