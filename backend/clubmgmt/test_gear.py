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

from .gear import MemberGear


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class MemberGearApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        self.ltf_admin = User.objects.create_user(username="ltf-gear", password="pass12345", role=User.Roles.LTF_ADMIN)
        self.club_admin = User.objects.create_user(username="club-gear", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.coach = User.objects.create_user(username="coach-gear", password="pass12345", role=User.Roles.COACH)
        self.other_admin = User.objects.create_user(username="other-gear", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.member_user = User.objects.create_user(username="member-gear", password="pass12345", role=User.Roles.MEMBER)
        self.club = Club.objects.create(name="Gear Club", created_by=self.ltf_admin)
        self.other = Club.objects.create(name="Other Gear", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        self.club.trainers.add(self.coach)
        self.other.admins.add(self.other_admin)
        self.athlete = Member.objects.create(
            club=self.club,
            first_name="Lea",
            last_name="Weber",
            sex=Member.Sex.FEMALE,
            date_of_birth=date(self.today.year - 16, 4, 2),
            user=self.member_user,
        )

    def _unlock(self):
        token = sign_payload(build_payload(module_ids=[COMPETITION_MODULE_ID], install_id=install_id_str()))
        redeem_product_code(token)
        set_club_assignment(club=self.club, module_id=COMPETITION_MODULE_ID, enabled=True, user=self.ltf_admin)

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_club_admin_and_coach_save_current_sizes(self):
        self._unlock()
        self._auth(self.club_admin)
        empty = self.client.get(f"/api/club-management/gear/?member={self.athlete.id}")
        self.assertEqual(empty.status_code, 200, empty.data)
        self.assertEqual(empty.data["daedo_sock"], "")
        self.assertEqual(empty.data["dobok"], "")
        self.assertIsNone(empty.data["updated_at"])

        saved = self.client.put(
            "/api/club-management/gear/",
            {
                "member": self.athlete.id,
                "daedo_sock": "M",
                "daedo_glove": "S",
                "kpnp_sock": "6",
                "kpnp_hogu": "0",
                "mouthguard": "youth",
                "dobok": "160",
                "tshirt": "104",
            },
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(saved.data["daedo_sock"], "M")
        self.assertEqual(saved.data["kpnp_sock"], "6")
        self.assertEqual(saved.data["dobok"], "160")
        self.assertEqual(saved.data["tshirt"], "104")
        self.assertEqual(saved.data["updated_at"], self.today.isoformat())
        self.assertEqual(MemberGear.objects.get(member=self.athlete).daedo_glove, "S")

        self._auth(self.coach)
        cleared = self.client.put(
            "/api/club-management/gear/",
            {"member": self.athlete.id, "daedo_sock": "", "tshirt": "3XL"},
            format="json",
        )
        self.assertEqual(cleared.status_code, 200, cleared.data)
        self.assertEqual(cleared.data["daedo_sock"], "")
        self.assertEqual(cleared.data["daedo_glove"], "S")
        self.assertEqual(cleared.data["tshirt"], "3XL")

    def test_rejects_unknown_labels_and_hides_the_record(self):
        self._unlock()
        self._auth(self.club_admin)
        invalid = self.client.put(
            "/api/club-management/gear/",
            {"member": self.athlete.id, "daedo_sock": "EU39", "dobok": "165", "kpnp_sock": "M"},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400, invalid.data)
        self.assertIn("daedo_sock", invalid.data)
        self.assertIn("dobok", invalid.data)
        self.assertIn("kpnp_sock", invalid.data)
        self.assertFalse(MemberGear.objects.filter(member=self.athlete).exists())

        self._auth(self.ltf_admin)
        ltf = self.client.get(f"/api/club-management/gear/?member={self.athlete.id}")
        self.assertEqual(ltf.status_code, 403)

        self._auth(self.member_user)
        own = self.client.get(f"/api/club-management/gear/?member={self.athlete.id}")
        self.assertEqual(own.status_code, 403)

        self._auth(self.other_admin)
        other = self.client.put(
            "/api/club-management/gear/",
            {"member": self.athlete.id, "daedo_sock": "L"},
            format="json",
        )
        self.assertEqual(other.status_code, 403)

        set_club_assignment(club=self.club, module_id=COMPETITION_MODULE_ID, enabled=False, user=self.ltf_admin)
        self._auth(self.club_admin)
        hidden = self.client.get(f"/api/club-management/gear/?member={self.athlete.id}")
        self.assertEqual(hidden.status_code, 403)
