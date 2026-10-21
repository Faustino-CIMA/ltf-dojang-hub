from datetime import date

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club
from members.models import Member
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
from modules.registry import COMPETITION_MODULE_ID


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class TeamGearSheetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        today = timezone.localdate()
        self.ltf_admin = User.objects.create_user(username="ltf-pss", password="pass12345", role=User.Roles.LTF_ADMIN)
        self.club_admin = User.objects.create_user(username="club-pss", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.club = Club.objects.create(name="PSS Club", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        self.athlete = Member.objects.create(
            club=self.club,
            first_name="Lea",
            last_name="Weber",
            sex=Member.Sex.FEMALE,
            date_of_birth=date(today.year - 16, 4, 2),
        )
        token = sign_payload(build_payload(module_ids=[COMPETITION_MODULE_ID], install_id=install_id_str()))
        redeem_product_code(token)
        set_club_assignment(club=self.club, module_id=COMPETITION_MODULE_ID, enabled=True, user=self.ltf_admin)
        self.client.force_authenticate(user=self.club_admin)

    def test_kyorugi_sheet_follows_the_team_pss_and_skips_clothing(self):
        created = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": "Cadets", "discipline": "kyorugi", "pss_system": "daedo"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        team_id = created.data["id"]
        self.assertEqual(created.data["pss_system"], "daedo")
        added = self.client.post(
            f"/api/club-management/teams/{team_id}/members/",
            {"member": self.athlete.id, "role": "athlete"},
            format="json",
        )
        self.assertEqual(added.status_code, 200, added.data)
        sized = self.client.put(
            "/api/club-management/gear/",
            {
                "member": self.athlete.id,
                "daedo_sock": "M",
                "daedo_glove": "S",
                "kpnp_sock": "6",
                "shin": "L",
                "mouthguard": "youth",
                "dobok": "160",
                "tshirt": "S",
            },
            format="json",
        )
        self.assertEqual(sized.status_code, 200, sized.data)

        roster = self.client.get(f"/api/club-management/teams/{team_id}/")
        athlete = next(row for row in roster.data["members"] if row["id"] == self.athlete.id)
        self.assertEqual(athlete["gear"]["daedo_sock"], "M")
        self.assertEqual(athlete["gear"]["dobok"], "160")

        sheet = self.client.get(f"/api/club-management/teams/{team_id}/sheet.csv?lang=en")
        self.assertEqual(sheet.status_code, 200, sheet.content)
        text = sheet.content.decode("utf-8-sig")
        self.assertIn("Daedo socks", text)
        self.assertNotIn("KPNP socks", text)
        self.assertIn("Youth", text)
        self.assertNotIn("Dobok", text)
        self.assertNotIn("T-shirt", text)
        self.assertIn("WEBER Lea", text)

        blank = self.client.patch(
            f"/api/club-management/teams/{team_id}/",
            {"pss_system": ""},
            format="json",
        )
        self.assertEqual(blank.status_code, 200, blank.data)
        both = self.client.get(f"/api/club-management/teams/{team_id}/sheet.csv?lang=fr").content.decode("utf-8-sig")
        self.assertIn("Chaussettes Daedo", both)
        self.assertIn("Chaussettes KPNP", both)
        self.assertNotIn("Dobok", both)

        copied = self.client.post(
            f"/api/club-management/teams/{team_id}/duplicate/",
            {"name": "Cadets copy"},
            format="json",
        )
        self.assertEqual(copied.status_code, 201, copied.data)
        self.client.patch(f"/api/club-management/teams/{team_id}/", {"pss_system": "kpnp"}, format="json")
        copied = self.client.post(
            f"/api/club-management/teams/{team_id}/duplicate/",
            {"name": "Cadets KPNP"},
            format="json",
        )
        self.assertEqual(copied.data["team"]["pss_system"], "kpnp")
        kpnp_sheet = self.client.get(f"/api/club-management/teams/{copied.data['team']['id']}/sheet.csv?lang=en")
        kpnp_text = kpnp_sheet.content.decode("utf-8-sig")
        self.assertIn("KPNP socks", kpnp_text)
        self.assertNotIn("Daedo socks", kpnp_text)

        poomsae = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": "Poomsae A", "discipline": "poomsae"},
            format="json",
        )
        self.client.post(f"/api/club-management/teams/{poomsae.data['id']}/members/", {"member": self.athlete.id}, format="json")
        poomsae_sheet = self.client.get(f"/api/club-management/teams/{poomsae.data['id']}/sheet.csv?lang=en")
        poomsae_text = poomsae_sheet.content.decode("utf-8-sig")
        self.assertNotIn("Daedo socks", poomsae_text)
        self.assertNotIn("Dobok", poomsae_text)

        invalid = self.client.patch(
            f"/api/club-management/teams/{team_id}/",
            {"pss_system": "adidas"},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)

        self.client.force_authenticate(user=self.ltf_admin)
        hidden = self.client.get(f"/api/club-management/teams/{team_id}/sheet.csv")
        self.assertEqual(hidden.status_code, 403)
