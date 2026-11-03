"""Parked import rows stay on the member record until an LTF admin reviews them."""

import json
from datetime import date
from io import BytesIO
from unittest.mock import patch

from django.db import IntegrityError, transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club
from clubs.public_stats import public_stats_payload
from licenses.club_fee_billing import _quantity_for_fee
from licenses.models import ClubFeeType
from members.models import LtfStaffFunction, Member
from members.parking import NO_CLUB, decode_reasons
from ops.models import OpsAuditLog
from setup.availability import app_is_empty
from setup.members_step import apply_members, preview_members

HEADERS = ["Member ID", "First", "Last", "Club", "Gender", "End", "Role"]
MAPPING = {
    "wt_licenseid": "Member ID",
    "ltf_licenseid": "Member ID",
    "first_name": "First",
    "last_name": "Last",
    "club_name": "Club",
    "sex": "Gender",
    "membership_end_date": "End",
    "primary_license_role": "Role",
}


def _cells(*values):
    return list(values)


@override_settings(DEMO_MODE=False)
class SetupParkingTests(TestCase):
    def setUp(self):
        self.actor = User.objects.create_superuser(username="park-setup", password="pass12345", email="")
        self.crane = Club.objects.create(name="Silver Crane Academy", federation=Club.Federation.WT, created_by=self.actor)
        self.river = Club.objects.create(name="River Dojang", federation=Club.Federation.WT, created_by=self.actor)
        Club.objects.create(name="Dualtown Dojang", federation=Club.Federation.WT, created_by=self.actor)
        Club.objects.create(name="Dualtown Dojang a.s.b.l.", federation=Club.Federation.ITF, created_by=self.actor)
        Member.objects.create(
            club=self.crane,
            first_name="Existing",
            last_name="Member",
            sex=Member.Sex.FEMALE,
            ltf_licenseid="LUX-7777",
            wt_licenseid="LUX-7777",
            is_active=True,
        )

    def _preview(self, data_rows, **options):
        return preview_members(HEADERS, data_rows, {"mapping": MAPPING, **options}, rewrite_enabled=False)

    def _apply(self, data_rows, **options):
        with patch("setup.members_step.timezone.localdate", return_value=date(2026, 10, 25)):
            return apply_members(
                HEADERS,
                data_rows,
                {"mapping": MAPPING, **options},
                rewrite_enabled=False,
                actor=self.actor,
            )

    def _by_id(self, preview, licence):
        return [row for row in preview["rows"] if row["member_id"] == licence]

    def test_empty_club_is_its_own_reason_and_other_gaps_stay_distinct(self):
        preview = self._preview(
            [
                _cells("LUX-1", "Erika", "Musterfrau", "", "Female", "", "Athlete"),
                _cells("LUX-2", "Max", "Mustermann", "Nowhere Dojang", "Male", "", "Athlete"),
                _cells("LUX-3", "Sam", "Beispiel", "Silver Crane Academy", "Robot", "", "Athlete"),
                _cells("LUX-4", "Noa", "Beispiel", "Silver Crane Academy", "", "not-a-date", "Athlete"),
                _cells("LUX-5", "Kim", "Beispiel", "Dualtown Dojang", "Female", "", "Athlete"),
                _cells("LUX-6", "Jan", "Janssen", "Silver Crane Academy", "Male", "", "Athlete"),
                _cells("LUX-6", "Jan", "Janssen", "River Dojang", "Male", "", "Athlete"),
                _cells("", "Lea", "Beispiel", "Silver Crane Academy", "Female", "", "Athlete"),
                _cells("LUX-8", "", "Beispiel", "Silver Crane Academy", "Female", "", "Athlete"),
                _cells("LUX-9", "Kim", "Staff", "LTF", "Female", "", "Coach"),
                _cells("LUX-10", "Rio", "Trainer", "Silver Crane Academy", "Male", "", "Trainer"),
                _cells("LUX-7777", "Existing", "Member", "Nowhere Dojang", "Female", "", "Athlete"),
                _cells("LUX-11", "Ada", "Beispiel", "Luxembourg Taekwondo Federation", "Female", "", "Athlete"),
            ]
        )
        empty = self._by_id(preview, "LUX-1")[0]
        self.assertEqual(empty["resolution"]["kind"], "no_club")
        self.assertEqual(empty["park_reasons"], [NO_CLUB])
        self.assertTrue(empty["parkable"])
        missing = self._by_id(preview, "LUX-2")[0]
        self.assertEqual(missing["park_reasons"], ["club_not_found"])
        self.assertNotIn(NO_CLUB, missing["park_reasons"])
        robot = self._by_id(preview, "LUX-3")[0]
        self.assertEqual(robot["park_reasons"], ["gender_value"])
        blank_gender = self._by_id(preview, "LUX-4")[0]
        self.assertEqual(blank_gender["park_reasons"], ["gender_blank", "end_date"])
        ambiguous = self._by_id(preview, "LUX-5")[0]
        self.assertEqual(ambiguous["park_reasons"], ["ambiguous_club"])
        duplicates = self._by_id(preview, "LUX-6")
        self.assertTrue(all(row["park_reasons"] == ["duplicate_clubs"] and row["parkable"] for row in duplicates))
        no_id = next(row for row in preview["rows"] if row["first_name"] == "Lea")
        self.assertFalse(no_id["parkable"])
        self.assertTrue(no_id["member_id"] == "")
        nameless = next(row for row in preview["rows"] if row["row_index"] and row["last_name"] == "Beispiel" and not row["first_name"])
        self.assertTrue(nameless["skipped"])
        self.assertFalse(nameless["parkable"])
        staff = self._by_id(preview, "LUX-9")[0]
        self.assertEqual(staff["resolution"]["kind"], "staff")
        self.assertEqual(staff["park_reasons"], [])
        self.assertFalse(staff["parkable"])
        trainer = self._by_id(preview, "LUX-10")[0]
        self.assertEqual(trainer["park_reasons"], [])
        self.assertFalse(trainer["parkable"])
        self.assertEqual(trainer["primary_license_role"], "")
        existing = self._by_id(preview, "LUX-7777")[0]
        self.assertIn("club_not_found", existing["park_reasons"])
        self.assertFalse(existing["parkable"])
        near = self._by_id(preview, "LUX-11")[0]
        self.assertEqual(near["park_reasons"], ["near_ltf"])

    def test_park_all_saves_one_inactive_person_and_a_later_file_updates_that_row(self):
        missing_id = [
            _cells("", "Lea", "Beispiel", "Silver Crane Academy", "Female", "", "Athlete"),
        ]
        blocked = self._apply(missing_id, parked_rows=[1])
        self.assertFalse(blocked["confirmed"])
        self.assertEqual(blocked["error"], "unresolved_rows")
        self.assertEqual(Member.all_objects.exclude(ltf_licenseid="LUX-7777").count(), 0)
        rows = [
            _cells("LUX-1", "Erika", "Musterfrau", "", "", "", "Athlete"),
            _cells("LUX-2", "Max", "Mustermann", "Nowhere Dojang", "Male", "", "Athlete"),
            _cells("LUX-6", "Jan", "Janssen", "Silver Crane Academy", "Male", "", "Athlete"),
            _cells("LUX-6", "Jan", "Janssen", "River Dojang", "Male", "", "Coach"),
            _cells("LUX-8", "", "Beispiel", "Silver Crane Academy", "Female", "", "Athlete"),
            _cells("LUX-10", "Rio", "Trainer", "Silver Crane Academy", "Male", "", "Trainer"),
        ]

        preview = self._preview(rows)
        parkable = [row["row_index"] for row in preview["rows"] if row["parkable"]]
        confirmed = self._apply(rows, parked_rows=parkable)
        self.assertTrue(confirmed["confirmed"], confirmed)
        self.assertEqual(confirmed["parked"], 3)
        self.assertGreaterEqual(confirmed["created"], 1)
        erika = Member.all_objects.get(ltf_licenseid="LUX-1")
        self.assertEqual(erika.import_status, Member.ImportStatus.PARKED)
        self.assertEqual(erika.wt_licenseid, "LUX-1")
        self.assertEqual(decode_reasons(erika.park_reason), ["no_club", "gender_blank"])
        self.assertEqual(erika.park_club_text, "")
        self.assertEqual(erika.sex, "")
        self.assertFalse(erika.is_active)
        self.assertIsNone(erika.club_id)
        self.assertFalse(Member.objects.filter(pk=erika.pk).exists())
        self.assertFalse(self.crane.members.filter(pk=erika.pk).exists())
        missing = Member.all_objects.get(ltf_licenseid="LUX-2")
        self.assertEqual(decode_reasons(missing.park_reason), ["club_not_found"])
        self.assertEqual(missing.park_club_text, "Nowhere Dojang")
        jan = Member.all_objects.get(ltf_licenseid="LUX-6")
        self.assertEqual(Member.all_objects.filter(ltf_licenseid="LUX-6").count(), 1)
        self.assertIn("Silver Crane Academy", jan.park_club_text)
        self.assertIn("River Dojang", jan.park_club_text)
        self.assertIsNone(jan.club_id)
        self.assertEqual(OpsAuditLog.objects.filter(action="member_parked", target_id=str(erika.pk)).count(), 1)
        audit = OpsAuditLog.objects.get(action="member_parked", target_id=str(erika.pk))
        self.assertEqual(audit.actor_id, self.actor.id)
        self.assertIn("no_club", audit.metadata["reasons"])
        rio = Member.objects.get(ltf_licenseid="LUX-10")
        self.assertEqual(rio.import_status, Member.ImportStatus.ACTIVE)
        self.assertEqual(rio.primary_license_role, "")
        self.assertEqual(rio.email, "")

        again = self._apply(
            [_cells("LUX-1", "Erika", "Musterfrau", "Silver Crane Academy", "Female", "", "Athlete")]
        )
        self.assertTrue(again["confirmed"], again)
        self.assertEqual(again["parked"], 0)
        self.assertEqual(again["created"], 0)
        self.assertEqual(Member.all_objects.filter(ltf_licenseid="LUX-1").count(), 1)
        erika.refresh_from_db()
        self.assertEqual(erika.import_status, Member.ImportStatus.ACTIVE)
        self.assertEqual(erika.sex, Member.Sex.FEMALE)
        self.assertEqual(erika.club_id, self.crane.id)
        self.assertTrue(erika.is_active)
        self.assertTrue(Member.objects.filter(pk=erika.pk).exists())
        self.assertTrue(
            OpsAuditLog.objects.filter(action="member_park_resolved", target_id=str(erika.pk), metadata__source="setup").exists()
        )

    def test_a_second_park_replaces_the_reason_from_the_new_file(self):
        first = [
            _cells("LUX-1", "Erika", "Musterfrau", "", "", "", "Athlete"),
        ]
        self._apply(first, parked_rows=[1])
        second = self._apply(
            [_cells("LUX-1", "Erika", "Musterfrau", "", "Female", "", "Coach")],
            parked_rows=[1],
        )
        self.assertEqual(second["parked"], 1)
        self.assertEqual(Member.all_objects.filter(ltf_licenseid="LUX-1").count(), 1)
        erika = Member.all_objects.get(ltf_licenseid="LUX-1")
        self.assertEqual(decode_reasons(erika.park_reason), [NO_CLUB])
        self.assertEqual(erika.sex, Member.Sex.FEMALE)
        self.assertEqual(erika.primary_license_role, "Coach")


class ParkedConstraintTests(TestCase):
    def test_sex_may_be_blank_only_while_parked_and_parked_stays_inactive(self):
        parked = Member(
            first_name="Erika",
            last_name="Musterfrau",
            sex="",
            import_status=Member.ImportStatus.PARKED,
            is_active=False,
            ltf_licenseid="LUX-1",
            wt_licenseid="LUX-1",
        )
        parked.save()
        self.assertEqual(parked.sex, "")
        active = Member(
            first_name="Max",
            last_name="Mustermann",
            sex="",
            import_status=Member.ImportStatus.ACTIVE,
            is_active=True,
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                active.save()
        awake = Member(
            first_name="Sam",
            last_name="Beispiel",
            sex=Member.Sex.MALE,
            import_status=Member.ImportStatus.PARKED,
            is_active=True,
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                awake.save()


class RegularImportParkingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ltf_admin = User.objects.create_user(username="park-ltf", password="pass12345", role=User.Roles.LTF_ADMIN)
        self.club = Club.objects.create(name="North Club", created_by=self.ltf_admin)
        self.client.force_authenticate(user=self.ltf_admin)

    def _post(self, path, csv_data, mapping, **extra):
        file_obj = BytesIO(csv_data.encode("utf-8"))
        file_obj.name = "members.csv"
        payload = {"file": file_obj, "mapping": json.dumps(mapping), "club_id": self.club.id, **extra}
        return self.client.post(path, payload, format="multipart")

    def test_blank_or_bad_gender_and_an_empty_club_can_be_parked_without_guessing_male(self):
        csv_data = "first_name,last_name,sex,ltf_id,club,end\nErika,Musterfrau,Robot,LUX-1,North Club,\nMax,Mustermann,,LUX-2,,not-a-date\n"
        mapping = {
            "first_name": "first_name",
            "last_name": "last_name",
            "sex": "sex",
            "ltf_licenseid": "ltf_id",
            "wt_licenseid": "ltf_id",
            "club_name": "club",
            "membership_end_date": "end",
        }
        preview = self._post("/api/imports/members/preview/", csv_data, mapping)
        self.assertEqual(preview.status_code, 200, preview.data)
        erika, max_row = preview.data["rows"]
        self.assertEqual(erika["errors"], ["sex must be Male or Female"])
        self.assertTrue(erika["parkable"])
        self.assertIn("gender_value", erika["park_reasons"])
        self.assertEqual(max_row["errors"], ["sex must be Male or Female", "club is empty", "membership end date could not be read"])
        self.assertEqual(max_row["park_reasons"], ["no_club", "gender_blank", "end_date"])
        self.assertTrue(max_row["parkable"])
        self.assertNotIn("club_not_found", max_row["park_reasons"])

        confirmed = self._post(
            "/api/imports/members/confirm/",
            csv_data,
            mapping,
            actions=json.dumps([{"row_index": 1, "action": "park"}, {"row_index": 2, "action": "park"}]),
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.assertEqual(confirmed.data["parked"], 2)
        self.assertEqual(confirmed.data["created"], 0)
        self.assertEqual(Member.objects.count(), 0)
        stored = Member.all_objects.get(ltf_licenseid="LUX-1")
        self.assertEqual(stored.sex, "")
        self.assertFalse(stored.is_active)
        self.assertEqual(stored.wt_licenseid, "LUX-1")
        self.assertEqual(stored.email, "")
        empty = Member.all_objects.get(ltf_licenseid="LUX-2")
        self.assertIsNone(empty.club_id)
        self.assertEqual(decode_reasons(empty.park_reason), ["no_club", "gender_blank", "end_date"])
        self.assertEqual(OpsAuditLog.objects.filter(action="member_parked").count(), 2)

        Member.objects.create(
            club=self.club,
            first_name="Existing",
            last_name="Member",
            sex=Member.Sex.MALE,
            ltf_licenseid="LUX-9",
            wt_licenseid="LUX-9",
        )
        taken = "first_name,last_name,sex,ltf_id\nExisting,Member,Robot,LUX-9\n"
        taken_map = {"first_name": "first_name", "last_name": "last_name", "sex": "sex", "ltf_licenseid": "ltf_id"}
        taken_preview = self._post("/api/imports/members/preview/", taken, taken_map)
        self.assertFalse(taken_preview.data["rows"][0]["parkable"])
        refused = self._post(
            "/api/imports/members/confirm/",
            taken,
            taken_map,
            actions=json.dumps([{"row_index": 1, "action": "park"}]),
        )
        self.assertEqual(refused.data["parked"], 0)
        self.assertEqual(refused.data["errors"][0]["errors"], ["This row cannot be parked."])
        self.assertEqual(Member.objects.get(ltf_licenseid="LUX-9").sex, Member.Sex.MALE)

    def test_reimport_updates_the_parked_person_and_a_clean_file_clears_the_flag(self):
        csv_data = "first_name,last_name,sex,ltf_id,club\nErika,Musterfrau,,LUX-1,\n"
        mapping = {
            "first_name": "first_name",
            "last_name": "last_name",
            "sex": "sex",
            "ltf_licenseid": "ltf_id",
            "wt_licenseid": "ltf_id",
            "club_name": "club",
        }
        self._post(
            "/api/imports/members/confirm/",
            csv_data,
            mapping,
            actions=json.dumps([{"row_index": 1, "action": "park"}]),
        )
        again = "first_name,last_name,sex,ltf_id,club\nErika,Musterfrau,Female,LUX-1,\n"
        still = self._post(
            "/api/imports/members/confirm/",
            again,
            mapping,
            actions=json.dumps([{"row_index": 1, "action": "park"}]),
            update_mode="create_only",
        )
        self.assertEqual(still.data["parked"], 1, still.data)
        self.assertEqual(Member.all_objects.filter(ltf_licenseid="LUX-1").count(), 1)
        parked = Member.all_objects.get(ltf_licenseid="LUX-1")
        self.assertEqual(decode_reasons(parked.park_reason), [NO_CLUB])
        self.assertEqual(parked.sex, Member.Sex.FEMALE)

        clean = "first_name,last_name,sex,ltf_id\nErika,Musterfrau,Female,LUX-1\n"
        clean_map = {
            "first_name": "first_name",
            "last_name": "last_name",
            "sex": "sex",
            "ltf_licenseid": "ltf_id",
            "wt_licenseid": "ltf_id",
        }
        released = self._post(
            "/api/imports/members/confirm/",
            clean,
            clean_map,
            update_mode="create_only",
        )
        self.assertEqual(released.status_code, 200, released.data)
        self.assertEqual(released.data["updated"], 1)
        self.assertEqual(released.data["created"], 0)
        self.assertEqual(Member.objects.filter(ltf_licenseid="LUX-1").count(), 1)
        parked.refresh_from_db()
        self.assertEqual(parked.import_status, Member.ImportStatus.ACTIVE)
        self.assertEqual(parked.club_id, self.club.id)
        self.assertTrue(parked.is_active)
        self.assertTrue(
            OpsAuditLog.objects.filter(action="member_park_resolved", target_id=str(parked.pk), metadata__source="import").exists()
        )

    def test_an_empty_club_row_parks_while_the_other_row_uses_the_target_club(self):
        """Both LTF import pages call this API. The selected club is only the destination for rows that are created."""

        def run(empty_id, matched_id):
            csv_data = (
                "Member ID,First,Last,Club,Gender\n"
                f"{empty_id},Erika,Musterfrau,,Female\n"
                f"{matched_id},Max,Mustermann,North Club,Male\n"
            )
            mapping = {
                "first_name": "First",
                "last_name": "Last",
                "sex": "Gender",
                "ltf_licenseid": "Member ID",
                "wt_licenseid": "Member ID",
                "club_name": "Club",
            }
            preview = self._post("/api/imports/members/preview/", csv_data, mapping)
            self.assertEqual(preview.status_code, 200, preview.data)
            empty, matched = preview.data["rows"]
            self.assertEqual(empty["park_reasons"], [NO_CLUB])
            self.assertTrue(empty["parkable"])
            self.assertIn("club is empty", empty["errors"])
            self.assertEqual(matched["errors"], [])
            self.assertEqual(matched["park_reasons"], [])
            confirmed = self._post(
                "/api/imports/members/confirm/",
                csv_data,
                mapping,
                actions=json.dumps(
                    [
                        {"row_index": empty["row_index"], "action": "park"},
                        {"row_index": matched["row_index"], "action": "create"},
                    ]
                ),
            )
            self.assertEqual(confirmed.status_code, 200, confirmed.data)
            self.assertEqual(confirmed.data["parked"], 1)
            self.assertEqual(confirmed.data["created"], 1)
            stored = Member.all_objects.get(ltf_licenseid=empty_id)
            self.assertEqual(stored.import_status, Member.ImportStatus.PARKED)
            self.assertIsNone(stored.club_id)
            self.assertEqual(decode_reasons(stored.park_reason), [NO_CLUB])
            created = Member.objects.get(ltf_licenseid=matched_id)
            self.assertEqual(created.club_id, self.club.id)

        run("LUX-71", "LUX-72")
        root = User.objects.create_superuser(
            username="park-root-ltf",
            password="pass12345",
            email="root-ltf@example.lu",
            role=User.Roles.LTF_ADMIN,
        )
        self.client.force_authenticate(user=root)
        run("LUX-81", "LUX-82")

    def test_an_unmapped_sex_column_still_defaults_and_an_empty_unmapped_club_does_not_park(self):
        csv_data = "first_name,last_name,ltf_id\nAna,Ng,LUX-3\n"
        mapping = {"first_name": "first_name", "last_name": "last_name", "ltf_licenseid": "ltf_id"}
        response = self._post("/api/imports/members/confirm/", csv_data, mapping)
        self.assertEqual(response.data["created"], 1)
        member = Member.objects.get(ltf_licenseid="LUX-3")
        self.assertEqual(member.sex, Member.Sex.MALE)
        self.assertEqual(member.club_id, self.club.id)

    def test_club_admins_and_finance_cannot_park_but_a_superuser_can(self):
        club_admin = User.objects.create_user(
            username="park-club", password="pass12345", role=User.Roles.CLUB_ADMIN
        )
        self.club.admins.add(club_admin)
        finance = User.objects.create_user(
            username="park-fin", password="pass12345", role=User.Roles.LTF_FINANCE
        )
        parked_csv = "first_name,last_name,sex,ltf_id\nErika,Musterfrau,,LUX-44\n"
        parked_map = {
            "first_name": "first_name",
            "last_name": "last_name",
            "sex": "sex",
            "ltf_licenseid": "ltf_id",
            "wt_licenseid": "ltf_id",
        }
        actions = json.dumps([{"row_index": 1, "action": "park"}])

        self.client.force_authenticate(user=club_admin)
        refused = self._post("/api/imports/members/confirm/", parked_csv, parked_map, actions=actions)
        self.assertEqual(refused.status_code, 403, refused.data)
        self.assertFalse(Member.all_objects.filter(ltf_licenseid="LUX-44").exists())

        created = self._post(
            "/api/imports/members/confirm/",
            "first_name,last_name,ltf_id\nLea,Beispiel,LUX-45\n",
            {"first_name": "first_name", "last_name": "last_name", "ltf_licenseid": "ltf_id"},
        )
        self.assertEqual(created.status_code, 200, created.data)
        self.assertEqual(created.data["created"], 1)
        self.assertEqual(created.data["parked"], 0)

        self.client.force_authenticate(user=finance)
        finance_refused = self._post("/api/imports/members/confirm/", parked_csv, parked_map, actions=actions)
        self.assertEqual(finance_refused.status_code, 403, finance_refused.data)
        self.assertFalse(Member.all_objects.filter(ltf_licenseid="LUX-44").exists())

        root = User.objects.create_superuser(
            username="park-root",
            password="pass12345",
            email="root@example.lu",
            role=User.Roles.CLUB_ADMIN,
        )
        self.club.admins.add(root)
        self.client.force_authenticate(user=root)
        allowed = self._post("/api/imports/members/confirm/", parked_csv, parked_map, actions=actions)
        self.assertEqual(allowed.status_code, 200, allowed.data)
        self.assertEqual(allowed.data["parked"], 1)
        stored = Member.all_objects.get(ltf_licenseid="LUX-44")
        self.assertEqual(stored.import_status, Member.ImportStatus.PARKED)
        self.assertEqual(stored.sex, "")

    def test_a_parked_license_id_still_blocks_a_second_member(self):
        from members.serializers import MemberSerializer
        from members.services import _used_ltf_license_serials, generate_next_ltf_license_id

        Member.all_objects.create(
            first_name="Erika",
            last_name="Musterfrau",
            sex="",
            import_status=Member.ImportStatus.PARKED,
            is_active=False,
            ltf_licenseid="LTF-0001",
            wt_licenseid="LUX-77",
            park_reason=",gender_blank,",
        )
        duplicate_ltf = MemberSerializer(
            data={
                "club": self.club.id,
                "first_name": "Other",
                "last_name": "Person",
                "sex": Member.Sex.MALE,
                "ltf_licenseid": "LTF-0001",
            }
        )
        self.assertFalse(duplicate_ltf.is_valid())
        self.assertIn("ltf_licenseid", duplicate_ltf.errors)
        duplicate_wt = MemberSerializer(
            data={
                "club": self.club.id,
                "first_name": "Other",
                "last_name": "Person",
                "sex": Member.Sex.FEMALE,
                "wt_licenseid": "LUX-77",
            }
        )
        self.assertFalse(duplicate_wt.is_valid())
        self.assertIn("wt_licenseid", duplicate_wt.errors)
        self.assertIn(1, _used_ltf_license_serials("LTF"))
        self.assertNotEqual(generate_next_ltf_license_id(prefix="LTF"), "LTF-0001")


@override_settings(DEMO_MODE=False)
class ParkedReviewApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ltf_admin = User.objects.create_user(username="review-ltf", password="pass12345", role=User.Roles.LTF_ADMIN)
        self.club_admin = User.objects.create_user(username="review-club", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.superuser = User.objects.create_superuser(username="review-root", password="pass12345", email="")
        self.club = Club.objects.create(name="Review Club", created_by=self.ltf_admin)
        self.other = Club.objects.create(name="Other Review Club", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        self.empty = Member.all_objects.create(
            first_name="Erika",
            last_name="Musterfrau",
            sex="",
            import_status=Member.ImportStatus.PARKED,
            is_active=False,
            ltf_licenseid="LUX-1",
            wt_licenseid="LUX-1",
            park_reason=",no_club,gender_blank,",
            park_club_text="",
            park_detail={"gender_value": ""},
        )
        self.unknown = Member.all_objects.create(
            first_name="Max",
            last_name="Mustermann",
            sex=Member.Sex.MALE,
            import_status=Member.ImportStatus.PARKED,
            is_active=False,
            ltf_licenseid="LUX-2",
            wt_licenseid="LUX-2",
            park_reason=",club_not_found,",
            park_club_text="Nowhere Dojang",
        )
        self.visible = Member.objects.create(
            club=self.club,
            first_name="Lea",
            last_name="Beispiel",
            sex=Member.Sex.FEMALE,
            is_active=True,
            ltf_licenseid="LUX-3",
        )

    def test_only_ltf_staff_and_superuser_can_review_filter_resolve_and_delete(self):
        self.client.force_authenticate(user=self.club_admin)
        denied = self.client.get("/api/parked-members/")
        self.assertEqual(denied.status_code, 403)
        self.client.force_authenticate(user=self.superuser)
        allowed = self.client.get("/api/parked-members/")
        self.assertEqual(allowed.status_code, 200)
        self.client.force_authenticate(user=self.ltf_admin)
        listed = self.client.get("/api/parked-members/", {"ordering": "name"})
        self.assertEqual(listed.status_code, 200)
        names = [row["last_name"] for row in listed.data["results"]]
        self.assertEqual(names, ["MUSTERFRAU", "MUSTERMANN"])
        self.assertNotIn("id", listed.data["results"][0].get("member_id", "absent"))
        self.assertNotIn("member_id", listed.data["results"][0])
        only_empty = self.client.get("/api/parked-members/", {"reason": "no_club"})
        self.assertEqual([row["ltf_licenseid"] for row in only_empty.data["results"]], ["LUX-1"])
        only_missing = self.client.get("/api/parked-members/", {"reason": "club_not_found"})
        self.assertEqual([row["park_club_text"] for row in only_missing.data["results"]], ["Nowhere Dojang"])

        refused = self.client.post(f"/api/parked-members/{self.empty.id}/resolve/", {"sex": "", "is_active": True}, format="json")
        self.assertEqual(refused.status_code, 400)
        self.assertIn("sex", refused.data)
        self.assertIn("club", refused.data)
        resolved = self.client.post(
            f"/api/parked-members/{self.empty.id}/resolve/",
            {"sex": "F", "is_active": True, "club_id": self.club.id},
            format="json",
        )
        self.assertEqual(resolved.status_code, 200, resolved.data)
        self.empty.refresh_from_db()
        self.assertEqual(self.empty.import_status, Member.ImportStatus.ACTIVE)
        self.assertEqual(self.empty.sex, Member.Sex.FEMALE)
        self.assertTrue(self.empty.is_active)
        self.assertTrue(Member.objects.filter(pk=self.empty.pk).exists())
        self.assertTrue(OpsAuditLog.objects.filter(action="member_park_resolved", target_id=str(self.empty.pk)).exists())

        staffed = Member.all_objects.create(
            first_name="Kim",
            last_name="Staff",
            sex="",
            import_status=Member.ImportStatus.PARKED,
            is_active=False,
            ltf_licenseid="LUX-4",
            wt_licenseid="LUX-4",
            park_reason=",no_club,",
        )
        as_staff = self.client.post(
            f"/api/parked-members/{staffed.id}/resolve/",
            {"sex": "M", "is_active": False, "ltf_staff": True},
            format="json",
        )
        self.assertEqual(as_staff.status_code, 200, as_staff.data)
        staffed.refresh_from_db()
        self.assertIsNone(staffed.club_id)
        self.assertFalse(staffed.is_active)
        self.assertTrue(staffed.ltf_staff_functions.filter(function=LtfStaffFunction.Function.OTHER, ended_on=None).exists())

        removed = self.client.delete(f"/api/parked-members/{self.unknown.id}/")
        self.assertEqual(removed.status_code, 204)
        self.assertFalse(Member.all_objects.filter(pk=self.unknown.pk).exists())
        self.assertTrue(OpsAuditLog.objects.filter(action="member_park_deleted", target_id=str(self.unknown.pk)).exists())

    def test_bulk_assign_never_guesses_gender_and_bulk_delete_needs_confirm(self):
        self.client.force_authenticate(user=self.ltf_admin)
        assigned = self.client.post(
            "/api/parked-members/bulk-assign/",
            {"ids": [self.empty.id, self.unknown.id], "club_id": self.other.id},
            format="json",
        )
        self.assertEqual(assigned.status_code, 200, assigned.data)
        self.assertEqual(assigned.data["resolved"], 1)
        self.assertEqual(assigned.data["updated"], 1)
        self.empty.refresh_from_db()
        self.unknown.refresh_from_db()
        self.assertEqual(self.empty.sex, "")
        self.assertEqual(self.empty.import_status, Member.ImportStatus.PARKED)
        self.assertEqual(self.empty.club_id, self.other.id)
        self.assertNotIn("no_club", decode_reasons(self.empty.park_reason))
        self.assertIn("gender_blank", decode_reasons(self.empty.park_reason))
        self.assertEqual(self.unknown.import_status, Member.ImportStatus.ACTIVE)
        self.assertTrue(self.unknown.is_active)
        self.assertEqual(self.unknown.club_id, self.other.id)
        self.assertEqual(self.unknown.sex, Member.Sex.MALE)

        unconfirmed = self.client.post("/api/parked-members/bulk-delete/", {"ids": [self.empty.id]}, format="json")
        self.assertEqual(unconfirmed.status_code, 400)
        self.assertTrue(Member.all_objects.filter(pk=self.empty.pk).exists())
        confirmed = self.client.post(
            "/api/parked-members/bulk-delete/",
            {"ids": [self.empty.id], "confirm": True},
            format="json",
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.assertEqual(confirmed.data["deleted"], 1)
        self.assertFalse(Member.all_objects.filter(pk=self.empty.pk).exists())

    def test_parked_people_are_left_out_of_lists_stats_teams_cards_and_billing(self):
        self.assertEqual(Member.objects.count(), 1)
        self.assertEqual(self.club.members.count(), 1)
        self.client.force_authenticate(user=self.ltf_admin)
        listed = self.client.get("/api/members/")
        self.assertEqual(listed.status_code, 200)
        payload = listed.data["results"] if isinstance(listed.data, dict) else listed.data
        ident = {row.get("ltf_licenseid") for row in payload}
        self.assertEqual(ident, {"LUX-3"})
        self.assertEqual(public_stats_payload()["members"], 1)
        fee = ClubFeeType.objects.create(name="Member fee", code="member-fee", cadence=ClubFeeType.Cadence.PER_MEMBER)
        self.assertEqual(_quantity_for_fee(fee, self.club), 1)
        with self.assertRaises(Http404):
            get_object_or_404(Member, pk=self.empty.pk)
        self.assertIsNone(Member.objects.filter(id=self.empty.id).first())
        self.assertFalse(app_is_empty())
        self.client.force_authenticate(user=self.superuser)
        Member.objects.all().delete()
        Club.objects.all().delete()
        started = self.client.post("/api/setup/start/")
        self.assertEqual(started.status_code, 409)
