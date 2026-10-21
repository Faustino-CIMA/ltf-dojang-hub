from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0019_ltf_staff_medic_and_media"),
        ("clubmgmt", "0032_team_membership_history"),
    ]

    operations = [
        migrations.CreateModel(
            name="MemberGear",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("daedo_sock", models.CharField(blank=True, max_length=8)),
                ("daedo_glove", models.CharField(blank=True, max_length=8)),
                ("daedo_hogu", models.CharField(blank=True, max_length=8)),
                ("daedo_head", models.CharField(blank=True, max_length=8)),
                ("kpnp_sock", models.CharField(blank=True, max_length=8)),
                ("kpnp_glove", models.CharField(blank=True, max_length=8)),
                ("kpnp_hogu", models.CharField(blank=True, max_length=8)),
                ("kpnp_head", models.CharField(blank=True, max_length=8)),
                ("chest", models.CharField(blank=True, max_length=8)),
                ("headgear", models.CharField(blank=True, max_length=8)),
                ("shin", models.CharField(blank=True, max_length=8)),
                ("forearm", models.CharField(blank=True, max_length=8)),
                ("groin", models.CharField(blank=True, max_length=8)),
                ("mouthguard", models.CharField(blank=True, max_length=8)),
                ("dobok", models.CharField(blank=True, max_length=8)),
                ("tshirt", models.CharField(blank=True, max_length=8)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "member",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="gear",
                        to="members.member",
                    ),
                ),
            ],
        ),
    ]
