from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("clubs", "0009_club_active_and_language"),
        ("licenses", "0040_order_ledger"),
    ]

    operations = [
        migrations.AlterField(
            model_name="expensecategory",
            name="name",
            field=models.CharField(max_length=100),
        ),
        migrations.AlterField(
            model_name="expensecategory",
            name="code",
            field=models.SlugField(max_length=50),
        ),
        migrations.AddField(
            model_name="expensecategory",
            name="club",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="expense_categories",
                to="clubs.club",
            ),
        ),
        migrations.AddConstraint(
            model_name="expensecategory",
            constraint=models.UniqueConstraint(
                condition=models.Q(("club__isnull", True)),
                fields=("code",),
                name="expcat_fed_code_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="expensecategory",
            constraint=models.UniqueConstraint(
                condition=models.Q(("club__isnull", False)),
                fields=("club", "code"),
                name="expcat_club_code_uniq",
            ),
        ),
        migrations.AddField(
            model_name="expense",
            name="ledger",
            field=models.CharField(
                choices=[("federation", "Federation"), ("club", "Club")],
                db_index=True,
                default="federation",
                max_length=20,
            ),
        ),
        migrations.AddIndex(
            model_name="expense",
            index=models.Index(fields=["ledger", "-expense_date"], name="exp_ledger_date_idx"),
        ),
        migrations.AlterField(
            model_name="incomecategory",
            name="name",
            field=models.CharField(max_length=100),
        ),
        migrations.AlterField(
            model_name="incomecategory",
            name="code",
            field=models.SlugField(max_length=50),
        ),
        migrations.AddField(
            model_name="incomecategory",
            name="club",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="income_categories",
                to="clubs.club",
            ),
        ),
        migrations.AddConstraint(
            model_name="incomecategory",
            constraint=models.UniqueConstraint(
                condition=models.Q(("club__isnull", True)),
                fields=("code",),
                name="inccat_fed_code_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="incomecategory",
            constraint=models.UniqueConstraint(
                condition=models.Q(("club__isnull", False)),
                fields=("club", "code"),
                name="inccat_club_code_uniq",
            ),
        ),
        migrations.AddField(
            model_name="income",
            name="ledger",
            field=models.CharField(
                choices=[("federation", "Federation"), ("club", "Club")],
                db_index=True,
                default="federation",
                max_length=20,
            ),
        ),
        migrations.AddIndex(
            model_name="income",
            index=models.Index(fields=["ledger", "-income_date"], name="inc_ledger_date_idx"),
        ),
        migrations.CreateModel(
            name="ClubFinanceYearOpening",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("year", models.PositiveSmallIntegerField()),
                (
                    "opening_cash",
                    models.DecimalField(decimal_places=2, default="0.00", max_digits=12),
                ),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "club",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="finance_year_openings",
                        to="clubs.club",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="club_finance_year_openings_updated",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-year"]},
        ),
        migrations.AddConstraint(
            model_name="clubfinanceyearopening",
            constraint=models.UniqueConstraint(fields=("club", "year"), name="club_fin_opening_year_uniq"),
        ),
    ]
