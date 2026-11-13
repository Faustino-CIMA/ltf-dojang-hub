from datetime import datetime
from types import SimpleNamespace

from django.test import SimpleTestCase

from licenses.card_preview_image import preview_cache_key


class CardPreviewImageTests(SimpleTestCase):
    def test_cache_key_changes_when_the_approved_photo_changes(self):
        stamp = datetime(2026, 11, 13, 12, 0, 0)
        member = SimpleNamespace(
            id=4,
            updated_at=stamp,
            profile_picture_processed=SimpleNamespace(name="photos/mia-current.jpg"),
        )
        license_record = SimpleNamespace(id=9, updated_at=stamp)
        version = SimpleNamespace(id=2, updated_at=stamp)
        before = preview_cache_key(
            member=member,
            license_record=license_record,
            template_version=version,
            side="front",
        )
        member.profile_picture_processed = SimpleNamespace(name="photos/mia-approved.jpg")
        after = preview_cache_key(
            member=member,
            license_record=license_record,
            template_version=version,
            side="front",
        )
        self.assertNotEqual(before, after)
        self.assertIn("photos/mia-approved.jpg", after)
