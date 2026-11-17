import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("members", "0026_admin_notice_picture_rejected"),
    ]

    operations = [
        migrations.AddField(
            model_name="member",
            name="usual_name",
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.CreateModel(
            name="MemberVerification",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[("unverified", "Unverified"), ("verified", "Verified")],
                        default="unverified",
                        max_length=20,
                    ),
                ),
                ("verified_at", models.DateTimeField(blank=True, null=True)),
                ("method", models.CharField(blank=True, max_length=20)),
                ("locked_fields", models.JSONField(blank=True, default=list)),
                (
                    "member",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="verification",
                        to="members.member",
                    ),
                ),
                (
                    "verified_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="member_verifications",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="MemberVerificationEvent",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "action",
                    models.CharField(
                        choices=[("verify", "Verify"), ("unlock", "Unlock")],
                        max_length=20,
                    ),
                ),
                ("reason", models.TextField(blank=True)),
                ("fields", models.JSONField(blank=True, default=list)),
                ("old_first_name", models.CharField(blank=True, max_length=150)),
                ("new_first_name", models.CharField(blank=True, max_length=150)),
                ("old_last_name", models.CharField(blank=True, max_length=150)),
                ("new_last_name", models.CharField(blank=True, max_length=150)),
                ("old_date_of_birth", models.DateField(blank=True, null=True)),
                ("new_date_of_birth", models.DateField(blank=True, null=True)),
                ("old_sex", models.CharField(blank=True, max_length=1)),
                ("new_sex", models.CharField(blank=True, max_length=1)),
                ("ssn_changed", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="member_verification_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "member",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="verification_events",
                        to="members.member",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at", "-id"],
                "indexes": [
                    models.Index(
                        fields=["member", "-created_at"],
                        name="member_verif_event_member",
                    )
                ],
            },
        ),
    ]
