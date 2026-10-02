from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("clubs", "0011_club_website"),
        ("clubmgmt", "0017_family_bill_to_and_primary_contact"),
    ]

    operations = [
        migrations.CreateModel(
            name="MembershipBilling",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("year", models.PositiveIntegerField()),
                ("sequence", models.PositiveSmallIntegerField()),
                ("label", models.CharField(blank=True, max_length=80)),
                (
                    "club",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="membership_billings",
                        to="clubs.club",
                    ),
                ),
            ],
            options={"ordering": ["year", "sequence", "id"]},
        ),
        migrations.AddConstraint(
            model_name="membershipbilling",
            constraint=models.UniqueConstraint(fields=("club", "year", "sequence"), name="clubmgmt_billing_seq_uniq"),
        ),
        migrations.CreateModel(
            name="ClubLicenseFee",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(default="License fee", max_length=120)),
                ("amount", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                (
                    "club",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="license_fee",
                        to="clubs.club",
                    ),
                ),
            ],
            options={"ordering": ["club_id"]},
        ),
        migrations.CreateModel(
            name="ClubLicenseFeePrice",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("amount", models.DecimalField(decimal_places=2, max_digits=10)),
                ("effective_from", models.DateField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "fee",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="prices",
                        to="clubmgmt.clublicensefee",
                    ),
                ),
            ],
            options={"ordering": ["-effective_from", "-id"]},
        ),
        migrations.RemoveConstraint(
            model_name="membershipyearconfirmation",
            name="clubmgmt_year_confirm_uniq",
        ),
        migrations.AddField(
            model_name="membershipyearconfirmation",
            name="installment",
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AddConstraint(
            model_name="membershipyearconfirmation",
            constraint=models.UniqueConstraint(
                fields=("club", "year", "installment", "household_key"),
                name="clubmgmt_year_confirm_uniq",
            ),
        ),
    ]
