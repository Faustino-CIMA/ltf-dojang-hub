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
        catalog = self.client.get(f"/api/club-management/clothing/?club={self.club.id}")
        dobok = next(item for item in catalog.data["items"] if item["name"] == "Dobok")
        shirt = next(item for item in catalog.data["items"] if item["name"] == "T-shirt")
        sized = self.client.put(
            "/api/club-management/gear/",
            {
                "member": self.athlete.id,
                "daedo_sock": "M",
                "daedo_glove": "S",
                "kpnp_sock": "6",
                "chest": "XXL",
                "headgear": "S",
                "shin": "L",
                "mouthguard": "youth",
                "clothing": [
                    {"item": dobok["id"], "label": "160"},
                    {"item": shirt["id"], "label": "S"},
                ],
            },
            format="json",
        )
        self.assertEqual(sized.status_code, 200, sized.data)

        roster = self.client.get(f"/api/club-management/teams/{team_id}/")
        athlete = next(row for row in roster.data["members"] if row["id"] == self.athlete.id)
        self.assertEqual(athlete["gear"]["daedo_sock"], "M")
        self.assertNotIn("dobok", athlete["gear"])
        self.assertNotIn("tshirt", athlete["gear"])
        self.assertEqual(next(row["label"] for row in athlete["clothing"] if row["name"] == "Dobok"), "160")
        self.assertEqual(athlete["gear"]["chest"], "XXL")

        sheet = self.client.get(f"/api/club-management/teams/{team_id}/sheet.csv?lang=en")
        self.assertEqual(sheet.status_code, 200, sheet.content)
        text = sheet.content.decode("utf-8-sig")
        self.assertIn("Daedo socks", text)
        self.assertNotIn("KPNP socks", text)
        self.assertIn("Youth", text)
        self.assertIn("Chest protector", text)
        self.assertIn("XXL", text)
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
        self.assertNotIn("Chest protector", poomsae_text)
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

    def test_switched_off_brand_stays_stored_and_leaves_the_sheet(self):
        created = self.client.post(
            "/api/club-management/teams/",
            {"club": self.club.id, "name": "Juniors", "discipline": "kyorugi", "pss_system": ""},
            format="json",
        )
        team_id = created.data["id"]
        self.assertTrue(created.data["egear_daedo"])
        self.assertTrue(created.data["egear_kpnp"])
        self.client.post(f"/api/club-management/teams/{team_id}/members/", {"member": self.athlete.id}, format="json")
        self.client.put(
            "/api/club-management/gear/",
            {"member": self.athlete.id, "daedo_sock": "M", "kpnp_sock": "6", "chest": "S"},
            format="json",
        )
        switched = self.client.put(
            "/api/club-management/egear-brands/",
            {"club": self.club.id, "kpnp": False},
            format="json",
        )
        self.assertEqual(switched.status_code, 200, switched.data)

        one_brand = self.client.get(f"/api/club-management/teams/{team_id}/sheet.csv?lang=en").content.decode("utf-8-sig")
        self.assertIn("Daedo socks", one_brand)
        self.assertNotIn("KPNP socks", one_brand)
        self.assertIn("Chest protector", one_brand)

        self.client.patch(f"/api/club-management/teams/{team_id}/", {"pss_system": "kpnp"}, format="json")
        named = self.client.get(f"/api/club-management/teams/{team_id}/")
        self.assertEqual(named.data["pss_system"], "kpnp")
        self.assertFalse(named.data["egear_kpnp"])
        named_sheet = self.client.get(f"/api/club-management/teams/{team_id}/sheet.csv?lang=en").content.decode("utf-8-sig")
        self.assertNotIn("Daedo socks", named_sheet)
        self.assertNotIn("KPNP socks", named_sheet)
        self.assertIn("Chest protector", named_sheet)
        self.assertIn("KPNP", named_sheet)

        copied = self.client.post(f"/api/club-management/teams/{team_id}/duplicate/", {"name": "Juniors copy"}, format="json")
        self.assertEqual(copied.data["team"]["pss_system"], "kpnp")

        self.client.put("/api/club-management/egear-brands/", {"club": self.club.id, "daedo": False}, format="json")
        both_off = self.client.get(f"/api/club-management/teams/{team_id}/sheet.csv?lang=en").content.decode("utf-8-sig")
        self.assertNotIn("Daedo socks", both_off)
        self.assertNotIn("KPNP socks", both_off)
        self.assertIn("Chest protector", both_off)
        self.assertEqual(self.client.get(f"/api/club-management/gear/?member={self.athlete.id}").data["kpnp_sock"], "6")
