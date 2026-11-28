import secrets

from django.db import migrations, models
import django.db.models.deletion


def fill_link_tokens(apps, schema_editor):
    settings = apps.get_model("clubmgmt", "ClubOnboardingSettings")
    for row in settings.objects.filter(link_token=""):
        row.link_token = secrets.token_urlsafe(32)
        row.save(update_fields=["link_token"])


class Migration(migrations.Migration):
    dependencies = [
        ("clubmgmt", "0046_onboarding_settings"),
    ]

    operations = [
        migrations.AddField(
            model_name="clubonboardingsettings",
            name="link_token",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.RunPython(fill_link_tokens, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="clubonboardingsettings",
            name="link_token",
            field=models.CharField(blank=True, max_length=64, unique=True),
        ),
        migrations.CreateModel(
            name="JoinEmailCode",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(max_length=254)),
                ("code_hash", models.CharField(max_length=64)),
                ("expires_at", models.DateTimeField()),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "club",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="join_email_codes",
                        to="clubs.club",
                    ),
                ),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
        migrations.CreateModel(
            name="JoinEmailProof",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(max_length=254)),
                ("token_hash", models.CharField(max_length=64, unique=True)),
                ("expires_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "club",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="join_email_proofs",
                        to="clubs.club",
                    ),
                ),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
    ]
