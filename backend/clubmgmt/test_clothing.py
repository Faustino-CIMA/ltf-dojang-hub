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

from .clothing import ClubClothingItem, MemberClothingValue
from .clothing_presets import PRESET_BY_ID
from .gear import MemberGear


def _size(preset_id, label):
    return next(size for size in PRESET_BY_ID[preset_id]["sizes"] if size["label"] == label)


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class ClothingPresetTests(TestCase):
    def test_charts_keep_only_published_single_centimetres(self):
        youth = _size("thai_club_tee", "YXL")
        self.assertEqual(youth["age"], "9-10")
        self.assertEqual(youth["chest_cm"], 38)
        self.assertEqual(youth["length_cm"], 48)
        adult = _size("thai_club_tee", "XL")
        self.assertEqual((adult["chest_cm"], adult["length_cm"]), (56, 72))
        self.assertEqual(adult["age"], "")
        self.assertEqual(_size("thai_club_tee", "8XL")["length_cm"], 88)

        jako_kid = _size("jako_shirt", "128")
        self.assertEqual((jako_kid["height_min_cm"], jako_kid["height_max_cm"]), (123, 128))
        self.assertIsNone(jako_kid["chest_cm"])
        self.assertIsNone(jako_kid["length_cm"])
        self.assertIsNone(_size("jako_shirt", "S")["chest_cm"])
        self.assertIsNone(_size("jako_shirt", "S")["height_min_cm"])
        self.assertEqual(_size("jako_jacket", "128")["label"], "128")
        self.assertIsNone(next((size for size in PRESET_BY_ID["jako_jacket"]["sizes"] if size["label"] == "104"), None))

        hummel_kid = _size("hummel_shirt", "116")
        self.assertEqual(hummel_kid["age"], "6")
        self.assertEqual(hummel_kid["chest_cm"], 61)
        self.assertEqual(hummel_kid["height_min_cm"], 116)
        self.assertIsNone(hummel_kid["length_cm"])
        hummel_man = _size("hummel_shirt", "M")
        self.assertEqual((hummel_man["height_min_cm"], hummel_man["chest_cm"]), (182, 99))
        self.assertEqual(_size("hummel_jacket", "164")["chest_cm"], 83)

        self.assertIsNone(_size("generic_tee", "98")["chest_cm"])
        self.assertEqual(_size("dobok_height", "160")["height_min_cm"], 160)
        self.assertEqual(_size("dobok_height", "160")["height_max_cm"], 160)


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class ClubClothingApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        today = timezone.localdate()
        self.ltf_admin = User.objects.create_user(username="ltf-cloth", password="pass12345", role=User.Roles.LTF_ADMIN)
        self.club_admin = User.objects.create_user(username="club-cloth", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.coach = User.objects.create_user(username="coach-cloth", password="pass12345", role=User.Roles.COACH)
        self.other_admin = User.objects.create_user(username="other-cloth", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.club = Club.objects.create(name="Cloth Club", created_by=self.ltf_admin)
        self.other = Club.objects.create(name="Other Cloth", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        self.club.trainers.add(self.coach)
        self.other.admins.add(self.other_admin)
        self.athlete = Member.objects.create(
            club=self.club,
            first_name="Lea",
            last_name="Weber",
            sex=Member.Sex.FEMALE,
            date_of_birth=date(today.year - 16, 4, 2),
        )

    def _unlock(self):
        token = sign_payload(build_payload(module_ids=[COMPETITION_MODULE_ID], install_id=install_id_str()))
        redeem_product_code(token)
        set_club_assignment(club=self.club, module_id=COMPETITION_MODULE_ID, enabled=True, user=self.ltf_admin)

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_new_club_gets_dobok_and_tshirt(self):
        names = list(ClubClothingItem.objects.filter(club=self.club).order_by("position", "id").values_list("name", flat=True))
        self.assertEqual(names, ["Dobok", "T-shirt"])
        dobok = ClubClothingItem.objects.get(club=self.club, name="Dobok")
        self.assertEqual(dobok.sizes.get(label="160").height_min_cm, 160)
        shirt = ClubClothingItem.objects.get(club=self.club, name="T-shirt")
        self.assertIsNone(shirt.sizes.get(label="S").chest_cm)

    def test_club_admin_edits_the_list_and_others_cannot(self):
        self._unlock()
        self._auth(self.club_admin)
        listed = self.client.get(f"/api/club-management/clothing/?club={self.club.id}")
        self.assertEqual(listed.status_code, 200, listed.data)
        self.assertEqual([item["name"] for item in listed.data["items"]], ["Dobok", "T-shirt"])
        self.assertIn("jako_shirt", [preset["id"] for preset in listed.data["presets"]])
        jako = next(preset for preset in listed.data["presets"] if preset["id"] == "jako_shirt")

        created = self.client.post(
            "/api/club-management/clothing/",
            {"club": self.club.id, "name": "Hoodie", "note": "Jako", "sizes": jako["sizes"]},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["sizes"][2]["label"], "128")
        self.assertEqual(created.data["sizes"][2]["height_min_cm"], 123)
        self.assertIsNone(created.data["sizes"][2]["chest_cm"])
        self.assertEqual(created.data["member_count"], 0)

        renamed = self.client.patch(
            f"/api/club-management/clothing/{created.data['id']}/",
            {"name": "Club hoodie", "note": "Jako", "sizes": jako["sizes"][:4]},
            format="json",
        )
        self.assertEqual(renamed.status_code, 200, renamed.data)
        self.assertEqual(renamed.data["name"], "Club hoodie")
        self.assertEqual(len(renamed.data["sizes"]), 4)

        order = [created.data["id"], listed.data["items"][0]["id"], listed.data["items"][1]["id"]]
        moved = self.client.post(
            "/api/club-management/clothing/reorder/",
            {"club": self.club.id, "order": order},
            format="json",
        )
        self.assertEqual(moved.status_code, 200, moved.data)
        self.assertEqual([item["name"] for item in moved.data["items"]], ["Club hoodie", "Dobok", "T-shirt"])

        blank = self.client.post(
            "/api/club-management/clothing/",
            {"club": self.club.id, "name": "", "sizes": []},
            format="json",
        )
        self.assertEqual(blank.status_code, 400, blank.data)
        duplicate = self.client.patch(
            f"/api/club-management/clothing/{created.data['id']}/",
            {"sizes": [{"label": "S"}, {"label": "S"}]},
            format="json",
        )
        self.assertEqual(duplicate.status_code, 400, duplicate.data)

        self._auth(self.coach)
        readable = self.client.get(f"/api/club-management/clothing/?club={self.club.id}")
        self.assertEqual(readable.status_code, 200, readable.data)
        denied = self.client.post(
            "/api/club-management/clothing/",
            {"club": self.club.id, "name": "Tracksuit", "sizes": []},
            format="json",
        )
        self.assertEqual(denied.status_code, 403)

        self._auth(self.ltf_admin)
        self.assertEqual(self.client.get(f"/api/club-management/clothing/?club={self.club.id}").status_code, 403)
        self._auth(self.other_admin)
        self.assertEqual(self.client.get(f"/api/club-management/clothing/?club={self.club.id}").status_code, 403)
        self.assertEqual(
            self.client.patch(f"/api/club-management/clothing/{created.data['id']}/", {"name": "Stolen"}, format="json").status_code,
            403,
        )

        self._auth(self.club_admin)
        set_club_assignment(club=self.club, module_id=COMPETITION_MODULE_ID, enabled=False, user=self.ltf_admin)
        self.assertEqual(self.client.get(f"/api/club-management/clothing/?club={self.club.id}").status_code, 403)
        self.assertTrue(ClubClothingItem.objects.filter(club=self.club, name="Club hoodie").exists())

    def test_member_values_survive_a_removed_size_or_item(self):
        self._unlock()
        self._auth(self.club_admin)
        listed = self.client.get(f"/api/club-management/clothing/?club={self.club.id}")
        dobok = next(item for item in listed.data["items"] if item["name"] == "Dobok")
        shirt = next(item for item in listed.data["items"] if item["name"] == "T-shirt")
        saved = self.client.put(
            "/api/club-management/gear/",
            {
                "member": self.athlete.id,
                "daedo_sock": "M",
                "clothing": [
                    {"item": dobok["id"], "label": "160"},
                    {"item": shirt["id"], "label": "S"},
                ],
            },
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertNotIn("dobok", saved.data)
        self.assertEqual(saved.data["clothing"][0]["label"], "160")
        self.assertTrue(saved.data["clothing"][0]["offered"])
        self.assertEqual(saved.data["clothing"][0]["sizes"][0]["height_min_cm"], 100)

        self.assertEqual(self.client.get(f"/api/club-management/clothing/?club={self.club.id}").data["items"][0]["member_count"], 1)

        kept = [size for size in dobok["sizes"] if size["label"] != "160"]
        trimmed = self.client.patch(
            f"/api/club-management/clothing/{dobok['id']}/",
            {"sizes": kept},
            format="json",
        )
        self.assertEqual(trimmed.status_code, 200, trimmed.data)
        self.assertTrue(MemberClothingValue.objects.filter(member=self.athlete, item_id=dobok["id"], label="160").exists())
        again = self.client.get(f"/api/club-management/gear/?member={self.athlete.id}")
        retired = next(row for row in again.data["clothing"] if row["item"] == dobok["id"])
        self.assertFalse(retired["offered"])
        self.assertEqual(retired["label"], "160")
        still = self.client.put(
            "/api/club-management/gear/",
            {"member": self.athlete.id, "clothing": [{"item": dobok["id"], "label": "160"}]},
            format="json",
        )
        self.assertEqual(still.status_code, 200, still.data)
        invented = self.client.put(
            "/api/club-management/gear/",
            {"member": self.athlete.id, "daedo_sock": "L", "clothing": [{"item": dobok["id"], "label": "155"}]},
            format="json",
        )
        self.assertEqual(invented.status_code, 400, invented.data)
        self.assertEqual(MemberGear.objects.get(member=self.athlete).daedo_sock, "M")

        removed = self.client.delete(f"/api/club-management/clothing/{dobok['id']}/")
        self.assertEqual(removed.status_code, 204)
        orphan = MemberClothingValue.objects.get(member=self.athlete, label="160")
        self.assertIsNone(orphan.item_id)
        self.assertEqual(orphan.item_name, "Dobok")
        after = self.client.get(f"/api/club-management/gear/?member={self.athlete.id}")
        gone = next(row for row in after.data["clothing"] if row["name"] == "Dobok")
        self.assertTrue(gone["retired"])
        self.assertIsNone(gone["item"])
        self.assertEqual(gone["label"], "160")
        shirt_row = next(row for row in after.data["clothing"] if row["name"] == "T-shirt")
        self.assertEqual(shirt_row["label"], "S")
