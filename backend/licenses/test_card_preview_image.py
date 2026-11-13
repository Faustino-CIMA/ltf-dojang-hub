from datetime import datetime

from django.test import SimpleTestCase

from licenses.card_preview_image import preview_cache_key


def _preview(*, grade: str, photo: str) -> dict:
    return {
        "template_version_id": 2,
        "active_side": "front",
        "context": {
            "member.current_grade": grade,
            "member.profile_picture_processed": photo,
            "member.first_name": "Mia",
        },
    }


class CardPreviewImageTests(SimpleTestCase):
    def test_cache_key_changes_when_the_approved_photo_changes(self):
        stamp = datetime(2026, 11, 13, 12, 0, 0)
        before = preview_cache_key(
            preview_data=_preview(grade="8th Kup", photo="/photos/mia-current.jpg"),
            template_updated_at=stamp,
        )
        after = preview_cache_key(
            preview_data=_preview(grade="8th Kup", photo="/photos/mia-approved.jpg"),
            template_updated_at=stamp,
        )
        self.assertNotEqual(before, after)

    def test_cache_key_changes_when_the_grade_changes(self):
        stamp = datetime(2026, 11, 13, 12, 0, 0)
        before = preview_cache_key(
            preview_data=_preview(grade="8th Kup", photo="/photos/mia.jpg"),
            template_updated_at=stamp,
        )
        after = preview_cache_key(
            preview_data=_preview(grade="7th Kup", photo="/photos/mia.jpg"),
            template_updated_at=stamp,
        )
        self.assertNotEqual(before, after)
