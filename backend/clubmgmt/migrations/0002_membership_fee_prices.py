import datetime

from django.db import migrations, models
import django.db.models.deletion


def copy_amounts(apps, schema_editor):
    MembershipFee = apps.get_model("clubmgmt", "MembershipFee")
    MembershipFeePrice = apps.get_model("clubmgmt", "MembershipFeePrice")
    for fee in MembershipFee.objects.all():
        year = fee.year or datetime.date.today().year
        MembershipFeePrice.objects.create(
            fee=fee,
            amount=fee.amount,
            effective_from=datetime.date(year, 1, 1),
        )


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0001_club_management"),
    ]

    operations = [
        migrations.AddField(
            model_name="membershipfee",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
        migrations.AlterField(
            model_name="membershipfee",
            name="year",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="MembershipFeePrice",
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
                        to="clubmgmt.membershipfee",
                    ),
                ),
            ],
            options={"ordering": ["-effective_from", "-id"]},
        ),
        migrations.RunPython(copy_amounts, migrations.RunPython.noop),
    ]
