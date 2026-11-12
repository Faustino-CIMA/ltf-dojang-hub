from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User

from .models import CardFormatPreset, CardTemplate, CardTemplateVersion, PaperProfile


class PrintTemplateListTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="print-template-admin",
            email="print-template-admin@example.com",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.client.force_authenticate(self.admin)
        self.card_format = CardFormatPreset.objects.get(code="3c")
        self.paper = PaperProfile.objects.get(code="sigel-lp798")

    def _version(self, template, number, status_value, label):
        return CardTemplateVersion.objects.create(
            template=template,
            version_number=number,
            label=label,
            status=status_value,
            card_format=self.card_format,
            paper_profile=self.paper,
            design_payload={"elements": []},
            created_by=self.admin,
            published_by=self.admin if status_value == CardTemplateVersion.Status.PUBLISHED else None,
            published_at=timezone.now() if status_value == CardTemplateVersion.Status.PUBLISHED else None,
        )

    def test_published_default_is_listed_ahead_of_a_newer_draft(self):
        current = CardTemplate.objects.create(
            name="Standard 3C Card V3",
            is_default=True,
            is_active=True,
            created_by=self.admin,
            updated_by=self.admin,
        )
        published = self._version(current, 3, CardTemplateVersion.Status.PUBLISHED, "V3")
        self._version(current, 4, CardTemplateVersion.Status.DRAFT, "Draft from v2")
        older = CardTemplate.objects.create(
            name="Standard 3C Card",
            is_default=False,
            is_active=True,
            created_by=self.admin,
            updated_by=self.admin,
        )
        self._version(older, 2, CardTemplateVersion.Status.DRAFT, "Draft from v2")

        response = self.client.get("/api/card-templates/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        by_name = {row["name"]: row for row in rows}
        self.assertIn("Standard 3C Card V3", by_name)
        chosen = by_name["Standard 3C Card V3"]["latest_published_version"]
        self.assertIsNotNone(chosen)
        self.assertEqual(chosen["id"], published.id)
        self.assertEqual(chosen["status"], "published")
        self.assertNotEqual(chosen["label"], "Draft from v2")
        draft_only = by_name["Standard 3C Card"]
        self.assertIsNone(draft_only["latest_published_version"])
