from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clubmgmt", "0007_shop_variant_prices"),
    ]

    operations = [
        migrations.AlterField(
            model_name="shopitem",
            name="category",
            field=models.CharField(
                choices=[
                    ("dobok", "Dobok"),
                    ("belt", "Belt"),
                    ("protector", "Protector"),
                    ("sparring", "Sparring"),
                    ("footwear", "Footwear"),
                    ("tshirt", "Club T-shirt"),
                    ("merchandise", "Merchandise"),
                    ("other", "Other"),
                ],
                default="other",
                max_length=20,
            ),
        ),
    ]
