import json
from datetime import date
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from clubs.models import Club
from licenses.models import License
from members.models import LtfStaffFunction, Member
from setup.dates import detect_column_format, parse_with_format
from setup.models import SetupState
from setup.names import normalize_club_name

FIXTURES = Path(__file__).resolve().parent / "fixtures"
User = get_user_model()


def csv_file(name):
    return SimpleUploadedFile(name, (FIXTURES / name).read_bytes(), content_type="text/csv")


@override_settings(DEMO_MODE=False)
class SetupAvailabilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superuser = User.objects.create_superuser(username="setup-root", password="pass12345", email="")
        self.superuser.role = User.Roles.MEMBER
        self.superuser.save(update_fields=["role"])
        self.other = User.objects.create_user(username="setup-other", password="pass12345", role=User.Roles.LTF_ADMIN)

    def test_status_is_closed_for_non_superusers(self):
        self.client.force_authenticate(user=self.other)
        response = self.client.get("/api/setup/status/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["available"])

    def test_start_snapshot_and_finish_sets_ltf_admin(self):
        self.client.force_authenticate(user=self.superuser)
        started = self.client.post("/api/setup/start/")
        self.assertEqual(started.status_code, 200, started.data)
        self.assertTrue(started.data["available"])
        self.assertEqual(started.data["current_step"], "clubs")
        finished = self.client.post("/api/setup/finish/")
        self.assertEqual(finished.status_code, 200, finished.data)
        self.assertFalse(finished.data["available"])
        self.superuser.refresh_from_db()
        self.assertEqual(self.superuser.role, User.Roles.LTF_ADMIN)
        self.assertTrue(self.superuser.is_superuser)
        locked = self.client.post("/api/setup/start/")
        self.assertEqual(locked.status_code, 410)

    def test_start_refuses_when_data_exists(self):
        Club.objects.create(name="Already There", created_by=self.superuser)
        self.client.force_authenticate(user=self.superuser)
        response = self.client.post("/api/setup/start/")
        self.assertEqual(response.status_code, 409)

    @override_settings(DEMO_MODE=True)
    def test_demo_instance_is_never_available(self):
        self.client.force_authenticate(user=self.superuser)
        status = self.client.get("/api/setup/status/")
        self.assertFalse(status.data["available"])
        started = self.client.post("/api/setup/start/")
        self.assertEqual(started.status_code, 403)


@override_settings(DEMO_MODE=False)
class SetupClubStepTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superuser = User.objects.create_superuser(username="setup-clubs", password="pass12345", email="")
        self.client.force_authenticate(user=self.superuser)
        self.client.post("/api/setup/start/")

    def test_federation_dedup_and_no_ltf_club(self):
        preview = self.client.post("/api/setup/clubs/preview/", {"file": csv_file("fake_clubs.csv")}, format="multipart")
        self.assertEqual(preview.status_code, 200, preview.data)
        names = {row["name"]: row for row in preview.data["rows"]}
        self.assertNotIn("LTF", names)
        self.assertEqual(names["Taekwondo Club Musterstadt"]["federation"], "WT")
        self.assertEqual(names["Taekwon-Do Beispielhausen"]["federation"], "ITF")
        self.assertEqual(names["Taekwon Do Academy"]["federation"], "ITF")
        self.assertEqual(names["Silver Crane Academy"]["federation"], "WT")
        self.assertGreaterEqual(preview.data["blank_rows_ignored"], 1)
        self.assertEqual(preview.data["ltf_rows_ignored"], 1)
        self.assertNotIn("Taekwondo Club Musterstadt a.s.b.l.", names)
        confirmed = self.client.post(
            "/api/setup/clubs/confirm/",
            {
                "file": csv_file("fake_clubs.csv"),
                "payload": json.dumps({"rows": {"2": {"rcs_number": "b 42", "federation": "ITF"}}}),
            },
            format="multipart",
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.assertFalse(Club.objects.filter(name__iexact="LTF").exists())
        muster = Club.objects.get(external_ref=normalize_club_name("Taekwondo Club Musterstadt"))
        self.assertEqual(muster.federation, Club.Federation.WT)
        self.assertEqual(Club.objects.filter(external_ref=muster.external_ref).count(), 1)
        beispiel = Club.objects.get(name="Taekwon-Do Beispielhausen")
        self.assertEqual(beispiel.rcs_number, "B42")
        self.assertEqual(beispiel.federation, "ITF")
        again = self.client.post("/api/setup/clubs/confirm/", {"file": csv_file("fake_clubs.csv")}, format="multipart")
        self.assertEqual(again.status_code, 200, again.data)
        self.assertEqual(again.data["created"], 0)
        self.assertEqual(Club.objects.filter(name="Taekwondo Club Musterstadt").count(), 1)

    def test_invalid_rcs_blocks_confirm(self):
        response = self.client.post(
            "/api/setup/clubs/confirm/",
            {"file": csv_file("fake_clubs.csv"), "payload": json.dumps({"rows": {"1": {"rcs_number": "12B"}}})},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Club.objects.filter(name="Taekwondo Club Musterstadt").exists())


@override_settings(DEMO_MODE=False)
class SetupMemberStepTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superuser = User.objects.create_superuser(username="setup-members", password="pass12345", email="root@example.com")
        self.client.force_authenticate(user=self.superuser)
        self.client.post("/api/setup/start/")
        self.client.post("/api/setup/clubs/confirm/", {"file": csv_file("fake_clubs.csv")}, format="multipart")
        self.today = patch("setup.members_step.timezone.localdate", return_value=date(2026, 10, 25))
        self.today.start()
        self.addCleanup(self.today.stop)

    def _preview(self, payload=None):
        data = {"file": csv_file("fake_members.csv")}
        if payload is not None:
            data["payload"] = json.dumps(payload)
        return self.client.post("/api/setup/members/preview/", data, format="multipart")

    def _confirm(self, payload):
        return self.client.post(
            "/api/setup/members/confirm/",
            {"file": csv_file("fake_members.csv"), "payload": json.dumps(payload)},
            format="multipart",
        )

    def test_unresolved_gender_blocks_confirm(self):
        preview = self._preview()
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertFalse(preview.data["can_confirm"])
        self.assertTrue(preview.data["email_ignored"])
        mapped = {item["value"]: item["mapped"] for item in preview.data["role_summary"]}
        self.assertEqual(mapped["Coach"], "Coach")
        self.assertIsNone(mapped["Trainer"])
        self.assertIsNone(mapped["MNA President"])
        blocked = self._confirm({})
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(blocked.data["error"], "sex_required")
        self.assertFalse(Member.objects.exists())

    def test_import_creates_club_members_and_staff_without_licences_or_trainer_role(self):
        payload = {
            "sex_overrides": {"6": "F", "7": "skip"},
            "active_overrides": {"15": True},
            "club_name_overrides": {"tkd musterstadt": {"club_id": Club.objects.get(name="Silver Crane Academy").id}},
            "club_choices": {"LUX-4001": Club.objects.get(name="Silver Crane Academy").id},
            "allow_missing_id": [13],
            "club_name_overrides_near": True,
        }
        payload["club_name_overrides"]["luxembourg taekwondo federation"] = {"staff": True}
        preview = self._preview(payload)
        self.assertTrue(preview.data["can_confirm"], preview.data)
        confirmed = self._confirm(payload)
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.assertEqual(License.objects.count(), 0)
        erika = Member.objects.get(ltf_licenseid="LUX-1001")
        self.assertEqual(erika.club.name, "Silver Crane Academy")
        self.assertEqual(erika.first_name, "Erika")
        self.assertEqual(erika.last_name, "MUSTERFRAU")
        self.assertTrue(erika.is_active)
        self.assertTrue(erika.ltf_staff_functions.filter(function=LtfStaffFunction.Function.MEDIA, ended_on=None).exists())
        coach = Member.objects.get(ltf_licenseid="LUX-1002")
        self.assertEqual(coach.primary_license_role, "Coach")
        self.assertEqual(coach.secondary_license_role, "")
        self.assertFalse(coach.is_active)
        self.assertFalse(coach.club.trainers.exists())
        self.assertFalse(User.objects.filter(role=User.Roles.COACH).exists())
        jan = Member.objects.get(ltf_licenseid="LUX-1003")
        self.assertEqual(jan.primary_license_role, "Athlete")
        self.assertTrue(jan.is_active)
        self.assertFalse(Member.objects.filter(ltf_licenseid="LUX-1005").exists())
        kim = Member.objects.get(ltf_licenseid="LUX-2001")
        self.assertIsNone(kim.club_id)
        self.assertEqual(kim.primary_license_role, "Coach")
        self.assertTrue(kim.ltf_staff_functions.filter(function="coach", ended_on=None).exists())
        self.assertFalse(kim.ltf_staff_functions.filter(function="secretary").exists())
        self.assertIsNone(kim.user_id)
        noa = Member.objects.get(ltf_licenseid="LUX-2002")
        self.assertTrue(noa.ltf_staff_functions.filter(function="medic").exists())
        self.assertEqual(noa.email, "")
        self.assertEqual(Member.objects.filter(ltf_licenseid="LUX-1001").count(), 1)
        again = self._confirm(payload)
        self.assertEqual(again.status_code, 200, again.data)
        self.assertEqual(again.data["created"], 0)
        self.assertEqual(Member.objects.filter(ltf_licenseid="LUX-1001").count(), 1)


class SetupParsingTests(TestCase):
    def test_ambiguous_dates_default_to_day_first(self):
        detected = detect_column_format(["03/04/2010", "05/06/2011"])
        self.assertTrue(detected["ambiguous"])
        self.assertEqual(detected["format"], "DD/MM/YYYY")
        self.assertEqual(parse_with_format("03/04/2010", "DD/MM/YYYY"), date(2010, 4, 3))
        forced = detect_column_format(["15/04/2010", "03/04/2010"])
        self.assertFalse(forced["ambiguous"])
        self.assertEqual(forced["format"], "DD/MM/YYYY")
        serial = detect_column_format(["40179"])
        self.assertEqual(serial["format"], "EXCEL")
        self.assertEqual(parse_with_format("40179", "EXCEL"), date(1899, 12, 30) + __import__("datetime").timedelta(days=40179))

    def test_name_normalisation_ignores_asbl(self):
        self.assertEqual(
            normalize_club_name("Taekwondo Club Musterstadt a.s.b.l."),
            normalize_club_name("taekwondo club musterstadt"),
        )
