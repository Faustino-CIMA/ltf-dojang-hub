from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("clubmgmt", "0016_rebate_amount_off"),
    ]

    operations = [
        migrations.AddField(
            model_name="membercontact",
            name="is_primary",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="family",
            name="bill_to_delivery",
            field=models.CharField(
                blank=True,
                choices=[("email", "Email"), ("post", "Post"), ("hand", "In person")],
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="family",
            name="bill_to_person",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="families_billed",
                to="clubmgmt.person",
            ),
        ),
        migrations.AddConstraint(
            model_name="membercontact",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_primary", True)),
                fields=("member",),
                name="clubmgmt_one_primary_contact",
            ),
        ),
    ]
