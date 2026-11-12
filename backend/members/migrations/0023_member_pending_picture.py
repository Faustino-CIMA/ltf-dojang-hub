from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("members", "0022_alter_member_managers"),
    ]

    operations = [
        migrations.AddField(
            model_name="member",
            name="profile_picture_pending_processed",
            field=models.ImageField(blank=True, null=True, upload_to="members/profile_pictures/pending/"),
        ),
        migrations.AddField(
            model_name="member",
            name="profile_picture_pending_thumbnail",
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to="members/profile_pictures/pending_thumbnails/",
            ),
        ),
    ]
