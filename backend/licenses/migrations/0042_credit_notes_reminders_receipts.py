from decimal import Decimal

from django.conf import settings
from django.db import migrations, models
import django.core.validators
import django.db.models.deletion

import licenses.models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("licenses", "0041_club_books_ledger"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoice",
            name="last_reminded_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="expense",
            name="receipt",
            field=models.FileField(blank=True, upload_to="finance/receipts/expenses/"),
        ),
        migrations.AddField(
            model_name="income",
            name="receipt",
            field=models.FileField(blank=True, upload_to="finance/receipts/incomes/"),
        ),
        migrations.CreateModel(
            name="CreditNote",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "credit_number",
                    models.CharField(
                        default=licenses.models.generate_credit_note_number,
                        editable=False,
                        max_length=20,
                        unique=True,
                    ),
                ),
                (
                    "amount",
                    models.DecimalField(
                        decimal_places=2,
                        max_digits=10,
                        validators=[django.core.validators.MinValueValidator(Decimal("0.01"))],
                    ),
                ),
                ("reason", models.CharField(max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="credit_notes_recorded",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "invoice",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="credit_notes",
                        to="licenses.invoice",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
