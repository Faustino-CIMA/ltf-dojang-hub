import csv
import io
import json
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AccountSetupInvite
from accounts.setup_invites import NEUTRAL_DETAIL, hash_setup_token
from clubs.models import Club
from licenses.models import License
from members.models import LtfStaffFunction, Member
from ops.models import OpsAuditLog
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

    def test_supplied_mapping_is_honoured_and_email_stays_unmapped(self):
        preview = self._preview(
            {
                "mapping": {
                    "ltf_licenseid": "Member ID",
                    "first_name": "Preferred Last Name",
                    "last_name": "Preferred First Name",
                    "club_name": "Club Name",
                    "sex": "Gender",
                    "email": "Preferred First Name",
                }
            }
        )
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertNotIn("email", preview.data["mapping"])
        self.assertNotIn("date_of_birth", preview.data["mapping"])
        self.assertEqual(preview.data["mapping"]["first_name"], "Preferred Last Name")
        erika = next(row for row in preview.data["rows"] if row["member_id"] == "LUX-1001")
        self.assertEqual(erika["first_name"], "Musterfrau")
        self.assertEqual(erika["last_name"], "Erika")
        self.assertTrue(preview.data["email_ignored"])

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


def _member_import_payload():
    crane = Club.objects.get(name="Silver Crane Academy")
    return {
        "sex_overrides": {"6": "F", "7": "skip"},
        "active_overrides": {"15": True},
        "club_name_overrides": {
            "tkd musterstadt": {"club_id": crane.id},
            "luxembourg taekwondo federation": {"staff": True},
        },
        "club_choices": {"LUX-4001": crane.id},
        "allow_missing_id": [13],
    }


@override_settings(DEMO_MODE=False)
class SetupAdminStepTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superuser = User.objects.create_superuser(username="setup-admins", password="pass12345", email="")
        self.client.force_authenticate(user=self.superuser)
        self.client.post("/api/setup/start/")
        self.client.post("/api/setup/clubs/confirm/", {"file": csv_file("fake_clubs.csv")}, format="multipart")
        self.today = patch("setup.members_step.timezone.localdate", return_value=date(2026, 10, 25))
        self.today.start()
        self.addCleanup(self.today.stop)
        confirmed = self.client.post(
            "/api/setup/members/confirm/",
            {"file": csv_file("fake_members.csv"), "payload": json.dumps(_member_import_payload())},
            format="multipart",
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        crane = Club.objects.get(name="Silver Crane Academy")
        crane.max_admins = 2
        crane.save(update_fields=["max_admins"])

    def _admins(self, path, extra=None):
        data = {"file": csv_file("fake_admins.csv")}
        if extra:
            data.update(extra)
        return self.client.post(path, data, format="multipart")

    def test_preview_skips_ltf_and_lux_10_and_flags_rows(self):
        preview = self._admins("/api/setup/admins/preview/")
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data["ltf_rows_ignored"], 1)
        self.assertEqual(preview.data["skipped_admin_ids"], 1)
        self.assertGreaterEqual(preview.data["blank_rows_ignored"], 1)
        self.assertTrue(preview.data["can_confirm"])
        rows = {(row["admin_id"], row["organization"]): row for row in preview.data["rows"]}
        self.assertNotIn(("LUX-2001", "LTF"), rows)
        self.assertNotIn(("LUX-10", "Silver Crane Academy"), rows)
        self.assertEqual(rows[("LUX-1001", "Silver Crane Academy")]["status"], "ok")
        self.assertEqual(rows[("LUX-1002", "Silver Crane Academy")]["status"], "likely_swapped")
        self.assertEqual(rows[("LUX-1002", "Taekwon-Do Beispielhausen")]["status"], "ok")
        self.assertEqual(rows[("LUX-1003", "Silver Crane Academy")]["status"], "club_admin_limit")
        self.assertEqual(rows[("LUX-1003", "Taekwon-Do Beispielhausen")]["status"], "name_mismatch")
        self.assertEqual(rows[("LUX-9000", "Taekwondo Club Musterstadt")]["status"], "member_not_found")
        self.assertEqual(rows[("LUX-1001", "No Such Club")]["status"], "club_not_found")
        self.assertEqual(
            preview.data["not_imported"],
            ["Not imported: no member with ID LUX-9000 (Erika MUSTERFRAU, Taekwondo Club Musterstadt)"],
        )

    def test_confirm_links_one_user_per_person_and_setup_links_are_one_time(self):
        confirmed = self._admins("/api/setup/admins/confirm/")
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.assertEqual(
            confirmed.data["not_imported"],
            ["Not imported: no member with ID LUX-9000 (Erika MUSTERFRAU, Taekwondo Club Musterstadt)"],
        )
        erika = Member.objects.get(ltf_licenseid="LUX-1001")
        max_member = Member.objects.get(ltf_licenseid="LUX-1002")
        jan = Member.objects.get(ltf_licenseid="LUX-1003")
        kim = Member.objects.get(ltf_licenseid="LUX-2001")
        self.assertIsNone(kim.user_id)
        self.assertFalse(AccountSetupInvite.objects.filter(user__member_profile=kim).exists())
        self.assertFalse(erika.user.has_usable_password())
        self.assertEqual(erika.user.role, User.Roles.CLUB_ADMIN)
        self.assertEqual(erika.user.email, "")
        self.assertEqual(erika.user.username, "emusterfra")
        self.assertEqual(max_member.user_id, User.objects.get(username="mmusterman").id)
        crane = Club.objects.get(name="Silver Crane Academy")
        beispiel = Club.objects.get(name="Taekwon-Do Beispielhausen")
        self.assertEqual(set(crane.admins.values_list("id", flat=True)), {erika.user_id, max_member.user_id})
        self.assertEqual(set(beispiel.admins.values_list("id", flat=True)), {max_member.user_id, jan.user_id})
        self.assertFalse(User.objects.filter(username="kbeispiel").exists())
        again = self._admins("/api/setup/admins/confirm/")
        self.assertEqual(again.status_code, 200, again.data)
        self.assertEqual(User.objects.filter(username="emusterfra").count(), 1)
        self.assertTrue(any(row["status"] == "already_admin" for row in again.data["rows"]))

        issued = self.client.post(f"/api/setup/admins/{erika.user_id}/setup-link/", {"locale": "en"}, format="json")
        self.assertEqual(issued.status_code, 200, issued.data)
        raw = issued.data["setup_link"].split("token=", 1)[1]
        invite = AccountSetupInvite.objects.get(user=erika.user)
        self.assertNotEqual(invite.token_hash, raw)
        self.assertGreater(invite.expires_at, timezone.now() + timedelta(days=6))
        self.assertLess(invite.expires_at, timezone.now() + timedelta(days=8))
        public = APIClient()
        looked = public.get("/api/auth/account-setup/", {"token": raw})
        self.assertEqual(looked.status_code, 200, looked.data)
        self.assertEqual(looked.data["username"], "emusterfra")
        self.assertEqual(
            looked.data["assignments"],
            [{"role": "club_admin", "organisation": "Silver Crane Academy"}],
        )
        weak = public.post(
            "/api/auth/account-setup/",
            {"token": raw, "email": "erika@example.com", "password": "short", "password_confirm": "short"},
            format="json",
        )
        self.assertEqual(weak.status_code, 400)
        ready = public.post(
            "/api/auth/account-setup/",
            {
                "token": raw,
                "email": "erika@example.com",
                "password": "Wizard-setup-pass-1",
                "password_confirm": "Wizard-setup-pass-1",
            },
            format="json",
        )
        self.assertEqual(ready.status_code, 200, ready.data)
        erika.user.refresh_from_db()
        erika.refresh_from_db()
        self.assertEqual(erika.user.email, "erika@example.com")
        self.assertEqual(erika.email, "erika@example.com")
        self.assertTrue(erika.user.is_email_verified)
        self.assertTrue(EmailAddress.objects.filter(user=erika.user, email="erika@example.com", verified=True, primary=True).exists())
        invite.refresh_from_db()
        self.assertIsNotNone(invite.used_at)
        reused = public.get("/api/auth/account-setup/", {"token": raw})
        self.assertEqual(reused.status_code, 400)
        self.assertEqual(reused.data["detail"], NEUTRAL_DETAIL)
        self.assertEqual(set(reused.data.keys()), {"detail"})
        logged = public.post("/api/auth/login/", {"username": "emusterfra", "password": "Wizard-setup-pass-1"}, format="json")
        self.assertEqual(logged.status_code, 200, logged.data)

        first = self.client.post(f"/api/setup/admins/{max_member.user_id}/setup-link/", {"locale": "en"}, format="json")
        first_raw = first.data["setup_link"].split("token=", 1)[1]
        second = self.client.post(f"/api/setup/admins/{max_member.user_id}/setup-link/", {"locale": "en"}, format="json")
        self.assertNotEqual(first.data["setup_link"], second.data["setup_link"])
        self.assertIsNotNone(AccountSetupInvite.objects.get(token_hash=hash_setup_token(first_raw)).revoked_at)
        max_view = public.get("/api/auth/account-setup/", {"token": second.data["setup_link"].split("token=", 1)[1]})
        self.assertEqual(
            max_view.data["assignments"],
            [
                {"role": "club_admin", "organisation": "Silver Crane Academy"},
                {"role": "club_admin", "organisation": "Taekwon-Do Beispielhausen"},
            ],
        )
        stale = public.get("/api/auth/account-setup/", {"token": first_raw})
        self.assertEqual(stale.data["detail"], NEUTRAL_DETAIL)
        self.assertNotIn("assignments", stale.data)
        self.assertNotIn("organisation", str(stale.data))

        csv_one = self.client.post("/api/setup/admins/setup-links.csv", {"locale": "en"}, format="json")
        self.assertEqual(csv_one.status_code, 200, csv_one.content)
        self.assertIn("setup-links-CONFIDENTIAL-", csv_one["Content-Disposition"])
        parsed = list(csv.DictReader(io.StringIO(csv_one.content.decode())))
        by_user = {row["username"]: row for row in parsed}
        self.assertEqual(by_user["emusterfra"]["setup_link"], "")
        self.assertTrue(by_user["mmusterman"]["setup_link"])
        self.assertTrue(by_user["jjanssen"]["setup_link"])
        audit = OpsAuditLog.objects.filter(action="setup_links_download").order_by("id").first()
        self.assertEqual(audit.actor_id, self.superuser.id)
        self.assertEqual(audit.metadata["count"], 2)
        max_token = by_user["mmusterman"]["setup_link"].split("token=", 1)[1]
        jan_token = by_user["jjanssen"]["setup_link"].split("token=", 1)[1]
        csv_two = self.client.post("/api/setup/admins/setup-links.csv", {"locale": "en"}, format="json")
        parsed_two = {row["username"]: row for row in csv.DictReader(io.StringIO(csv_two.content.decode()))}
        self.assertNotEqual(parsed_two["mmusterman"]["setup_link"], by_user["mmusterman"]["setup_link"])
        self.assertEqual(public.get("/api/auth/account-setup/", {"token": max_token}).data["detail"], NEUTRAL_DETAIL)
        self.assertEqual(public.get("/api/auth/account-setup/", {"token": jan_token}).status_code, 400)
        fresh_jan = parsed_two["jjanssen"]["setup_link"].split("token=", 1)[1]
        finished = self.client.post("/api/setup/finish/")
        self.assertEqual(finished.status_code, 200, finished.data)
        self.assertEqual(self.client.post("/api/setup/admins/setup-links.csv", {}, format="json").status_code, 410)
        done = public.post(
            "/api/auth/account-setup/",
            {
                "token": fresh_jan,
                "email": "jan@example.com",
                "password": "Wizard-setup-pass-1",
                "password_confirm": "Wizard-setup-pass-1",
            },
            format="json",
        )
        self.assertEqual(done.status_code, 200, done.data)
        jan.refresh_from_db()
        self.assertEqual(jan.email, "jan@example.com")

    def test_ltf_admin_link_names_the_federation_and_a_bad_token_stays_neutral(self):
        from accounts.setup_invites import issue_setup_invite
        from clubs.models import FederationProfile

        FederationProfile.objects.create(name="Luxembourg Taekwondo Federation")
        admin = User.objects.create_superuser(username="ltf-grant", password="pass12345", email="")
        admin.role = User.Roles.LTF_ADMIN
        admin.set_unusable_password()
        admin.save()
        club = Club.objects.get(name="Silver Crane Academy")
        club.admins.add(admin)
        _invite, raw = issue_setup_invite(admin, self.superuser)
        public = APIClient()
        looked = public.get("/api/auth/account-setup/", {"token": raw})
        self.assertEqual(looked.status_code, 200, looked.data)
        self.assertEqual(
            looked.data["assignments"],
            [
                {"role": "ltf_admin", "organisation": "Luxembourg Taekwondo Federation"},
                {"role": "club_admin", "organisation": "Silver Crane Academy"},
            ],
        )
        missing = public.get("/api/auth/account-setup/", {"token": "not-a-real-token"})
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(missing.data, {"detail": NEUTRAL_DETAIL})


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
