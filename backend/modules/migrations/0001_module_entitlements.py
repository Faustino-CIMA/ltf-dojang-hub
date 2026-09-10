import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("clubs", "0009_club_active_and_language"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="InstallIdentity",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("install_id", models.UUIDField(unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("local_public_key", models.CharField(blank=True, max_length=128)),
                ("local_private_key", models.CharField(blank=True, max_length=128)),
            ],
            options={
                "verbose_name": "Install identity",
                "verbose_name_plural": "Install identity",
            },
        ),
        migrations.CreateModel(
            name="ProductCodeRedemption",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("jti", models.CharField(max_length=64, unique=True)),
                ("fingerprint", models.CharField(max_length=64, unique=True)),
                ("modules", models.JSONField(default=list)),
                ("caps", models.JSONField(blank=True, default=dict)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("issued_at", models.DateTimeField(blank=True, null=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("active", "Active"),
                            ("superseded", "Superseded"),
                            ("revoked", "Revoked"),
                            ("expired", "Expired"),
                            ("invalid", "Invalid"),
                        ],
                        default="active",
                        max_length=16,
                    ),
                ),
                ("redeemed_at", models.DateTimeField(auto_now_add=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                (
                    "redeemed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="product_code_redemptions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "revoked_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="revoked_product_codes",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-redeemed_at"],
            },
        ),
        migrations.CreateModel(
            name="InstallEntitlement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("module_id", models.CharField(max_length=64, unique=True)),
                ("active", models.BooleanField(default=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("caps", models.JSONField(blank=True, default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "source",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="entitlements",
                        to="modules.productcoderedemption",
                    ),
                ),
            ],
            options={
                "ordering": ["module_id"],
            },
        ),
        migrations.CreateModel(
            name="ClubModuleAssignment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("module_id", models.CharField(max_length=64)),
                ("enabled", models.BooleanField(default=True)),
                ("assigned_at", models.DateTimeField(auto_now=True)),
                (
                    "assigned_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="club_module_assignments",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "club",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="module_assignments",
                        to="clubs.club",
                    ),
                ),
            ],
            options={
                "ordering": ["club_id", "module_id"],
            },
        ),
        migrations.AddIndex(
            model_name="productcoderedemption",
            index=models.Index(fields=["status", "-redeemed_at"], name="mod_redeem_status_idx"),
        ),
        migrations.AddIndex(
            model_name="clubmoduleassignment",
            index=models.Index(fields=["module_id", "enabled"], name="mod_club_mod_enabled_idx"),
        ),
        migrations.AddConstraint(
            model_name="clubmoduleassignment",
            constraint=models.UniqueConstraint(fields=("club", "module_id"), name="mod_club_module_uniq"),
        ),
    ]
