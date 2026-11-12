from django.conf import settings
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ("clubs", "0017_federationprofile_country"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("members", "0023_member_pending_picture"),
    ]

    operations = [
        migrations.CreateModel(
            name="AdminNotice",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("picture_review", "Picture review")], max_length=40)),
                ("opened_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("decision", models.CharField(blank=True, max_length=20)),
                ("reason", models.TextField(blank=True)),
                (
                    "club",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.CASCADE,
                        related_name="admin_notices",
                        to="clubs.club",
                    ),
                ),
                (
                    "member",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.CASCADE,
                        related_name="admin_notices",
                        to="members.member",
                    ),
                ),
                (
                    "resolved_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="admin_notices_resolved",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-opened_at", "-id"]},
        ),
        migrations.AddConstraint(
            model_name="adminnotice",
            constraint=models.UniqueConstraint(
                condition=models.Q(("resolved_at__isnull", True)),
                fields=("member", "kind"),
                name="one_open_admin_notice_per_member_kind",
            ),
        ),
    ]
