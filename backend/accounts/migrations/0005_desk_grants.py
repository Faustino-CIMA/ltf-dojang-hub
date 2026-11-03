import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_accountsetupinvite"),
        ("clubs", "0015_federationprofile_rcs_number"),
    ]

    operations = [
        migrations.CreateModel(
            name="DeskGrant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("desk", models.CharField(choices=[("ltf_finance", "LTF Finance"), ("ltf_admin", "LTF Admin"), ("club_admin", "Club Admin"), ("coach", "Coach"), ("member", "Member")], max_length=20)),
                ("level", models.CharField(choices=[("full", "Full"), ("read_only", "Read only")], default="full", max_length=20)),
                ("source", models.CharField(choices=[("manual", "Manual"), ("office", "Office"), ("legacy", "Legacy")], default="legacy", max_length=20)),
                ("valid_from", models.DateField()),
                ("valid_until", models.DateField(blank=True, null=True)),
                ("reason", models.CharField(blank=True, max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("club", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="desk_grants", to="clubs.club")),
                ("granted_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="desk_grants_given", to=settings.AUTH_USER_MODEL)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="desk_grants", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="DeskPreference",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("desk", models.CharField(choices=[("ltf_finance", "LTF Finance"), ("ltf_admin", "LTF Admin"), ("club_admin", "Club Admin"), ("coach", "Coach"), ("member", "Member")], max_length=20)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("club", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to="clubs.club")),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="desk_preference", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddIndex(
            model_name="deskgrant",
            index=models.Index(fields=["user", "desk", "valid_until"], name="desk_grant_user_desk_until"),
        ),
        migrations.AddConstraint(
            model_name="deskgrant",
            constraint=models.UniqueConstraint(condition=models.Q(source="legacy"), fields=("user", "desk", "club", "level", "source"), name="desk_grant_legacy_uniq", nulls_distinct=False),
        ),
        migrations.AddConstraint(
            model_name="deskgrant",
            constraint=models.CheckConstraint(condition=~models.Q(source="manual", level="read_only", valid_until__isnull=True), name="desk_grant_manual_readonly_end"),
        ),
        migrations.AddConstraint(
            model_name="deskgrant",
            constraint=models.CheckConstraint(condition=models.Q(desk__in=["ltf_finance", "ltf_admin", "member"]) | models.Q(club__isnull=False) | models.Q(source="legacy"), name="desk_grant_club_when_needed"),
        ),
    ]
