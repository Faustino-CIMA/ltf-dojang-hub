import django.db.models.deletion
from django.core.validators import FileExtensionValidator
from django.db import migrations, models


def backfill_case_year(apps, schema_editor):
    Case = apps.get_model("clubmgmt", "ExtraordinarySubsidy")
    for row in Case.objects.all():
        if row.starts_on:
            row.year = row.starts_on.year
        elif row.created_at:
            row.year = row.created_at.year
        else:
            row.year = 2026
        row.save(update_fields=["year"])


class Migration(migrations.Migration):
    dependencies = [
        ("licenses", "0044_invoice_delivery_and_billing"),
        ("clubmgmt", "0009_subsidies"),
    ]

    operations = [
        migrations.AddField(
            model_name="subsidyseason",
            name="rib_file",
            field=models.FileField(
                blank=True,
                upload_to="club-subsidies/rib/%Y/",
                validators=[FileExtensionValidator(["pdf", "jpg", "jpeg", "png", "webp"])],
            ),
        ),
        migrations.AddField(
            model_name="subsidyseason",
            name="income",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="subsidy_seasons",
                to="licenses.income",
            ),
        ),
        migrations.AddField(
            model_name="coachqualification",
            name="diploma_file",
            field=models.FileField(
                blank=True,
                upload_to="club-subsidies/diplomas/%Y/",
                validators=[FileExtensionValidator(["pdf", "jpg", "jpeg", "png", "webp"])],
            ),
        ),
        migrations.AddField(
            model_name="extraordinarysubsidy",
            name="year",
            field=models.PositiveIntegerField(null=True),
        ),
        migrations.AddField(
            model_name="extraordinarysubsidy",
            name="entry_fee",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="extraordinarysubsidy",
            name="medical_fee",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="extraordinarysubsidy",
            name="supplies_fee",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.RunPython(backfill_case_year, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="extraordinarysubsidy",
            name="year",
            field=models.PositiveIntegerField(),
        ),
        migrations.AlterField(
            model_name="extraordinarysubsidy",
            name="travel_mode",
            field=models.CharField(
                blank=True,
                choices=[("train", "Train"), ("car", "Car"), ("plane", "Plane")],
                max_length=20,
            ),
        ),
    ]
