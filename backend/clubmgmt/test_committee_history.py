from datetime import date, timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club
from events.access import current_president_club_ids
from members.models import Member
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
from modules.registry import CLUB_MANAGEMENT_MODULE_ID

from .access import current_bank_access_mandate
from .models import Committee, CommitteeMandate
from .subsidies import _officer_name


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class CommitteeHistoryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()
        self.ltf_admin = User.objects.create_user(
            username="ltf-committee", password="pass12345", role=User.Roles.LTF_ADMIN
        )
        self.club_admin = User.objects.create_user(
            username="club-committee", password="pass12345", role=User.Roles.CLUB_ADMIN
        )
        self.other_admin = User.objects.create_user(
            username="other-committee", password="pass12345", role=User.Roles.CLUB_ADMIN
        )
        self.member_user = User.objects.create_user(
            username="member-committee", password="pass12345", role=User.Roles.MEMBER
        )
        self.finance_user = User.objects.create_user(
            username="finance-committee", password="pass12345", role=User.Roles.LTF_FINANCE
        )
        self.coach_user = User.objects.create_user(
            username="coach-committee", password="pass12345", role=User.Roles.COACH
        )
        self.club = Club.objects.create(name="History Club", created_by=self.ltf_admin)
        self.other_club = Club.objects.create(name="Other Club", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        self.other_club.admins.add(self.other_admin)
        self.outgoing = Member.objects.create(
            club=self.club,
            user=self.club_admin,
            first_name="Olga",
            last_name="Outgoing",
            date_of_birth=date(self.today.year - 40, 1, 15),
        )
        self.incoming = Member.objects.create(
            club=self.club,
            first_name="Ines",
            last_name="Incoming",
            date_of_birth=date(self.today.year - 35, 6, 1),
        )
        self.reader = Member.objects.create(
            club=self.club,
            user=self.member_user,
            first_name="Rita",
            last_name="Reader",
            date_of_birth=date(self.today.year - 30, 3, 3),
        )
        self.child = Member.objects.create(
            club=self.club,
            first_name="Child",
            last_name="Young",
            date_of_birth=self.today - timedelta(days=365 * 16),
        )

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def _unlock(self):
        token = sign_payload(
            build_payload(module_ids=[CLUB_MANAGEMENT_MODULE_ID], install_id=install_id_str())
        )
        redeem_product_code(token)
        set_club_assignment(
            club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True, user=self.ltf_admin
        )
        set_club_assignment(
            club=self.other_club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True, user=self.ltf_admin
        )

    def _committee(self, club=None):
        return Committee.objects.create(
            club=club or self.club,
            scope=Committee.Scope.CLUB,
            name="Board",
        )

    def test_handover_day_gives_the_office_to_the_new_holder(self):
        self._unlock()
        new_admin = User.objects.create_user(
            username="new-president", password="pass12345", role=User.Roles.CLUB_ADMIN
        )
        self.club.admins.add(new_admin)
        self.incoming.user = new_admin
        self.incoming.save(update_fields=["user"])
        committee = self._committee()
        CommitteeMandate.objects.create(
            committee=committee,
            role=CommitteeMandate.Role.PRESIDENT,
            member=self.outgoing,
            started_on=self.today - timedelta(days=400),
            ended_on=self.today,
        )
        CommitteeMandate.objects.create(
            committee=committee,
            role=CommitteeMandate.Role.PRESIDENT,
            member=self.incoming,
            started_on=self.today,
        )

        self.assertIsNone(current_bank_access_mandate(self.club_admin, self.club.id))
        incoming_mandate = current_bank_access_mandate(new_admin, self.club.id)
        self.assertIsNotNone(incoming_mandate)
        self.assertEqual(incoming_mandate.member_id, self.incoming.id)
        self.assertNotIn(self.club.id, current_president_club_ids(self.club_admin))
        self.assertIn(self.club.id, current_president_club_ids(new_admin))
        self.assertIn("INCOMING", _officer_name(self.club, [CommitteeMandate.Role.PRESIDENT], formal=True))
        self.assertNotIn("OUTGOING", _officer_name(self.club, [CommitteeMandate.Role.PRESIDENT], formal=True))

        self._auth(new_admin)
        access = self.client.get(f"/api/club-management/finance-access/?club={self.club.id}")
        self.assertEqual(access.status_code, 200)
        self.assertTrue(access.data["can_record_payments"])
        self._auth(self.club_admin)
        denied = self.client.get(f"/api/club-management/finance-access/?club={self.club.id}")
        self.assertFalse(denied.data["can_record_payments"])

    def test_end_date_equal_to_today_is_already_over(self):
        committee = self._committee()
        leaving = CommitteeMandate.objects.create(
            committee=committee,
            role=CommitteeMandate.Role.TREASURER,
            member=self.outgoing,
            started_on=self.today - timedelta(days=10),
            ended_on=self.today,
        )
        staying = CommitteeMandate.objects.create(
            committee=committee,
            role=CommitteeMandate.Role.SECRETARY,
            member=self.incoming,
            started_on=self.today - timedelta(days=10),
            ended_on=self.today + timedelta(days=1),
        )
        self.assertFalse(leaving.is_active_on(self.today))
        self.assertTrue(staying.is_active_on(self.today))
        self.assertIsNone(current_bank_access_mandate(self.club_admin, self.club.id))

    def test_open_ended_term_stays_current(self):
        committee = self._committee()
        open_term = CommitteeMandate.objects.create(
            committee=committee,
            role=CommitteeMandate.Role.PRESIDENT,
            member=self.outgoing,
            started_on=date(2024, 3, 1),
        )
        self.assertIsNone(open_term.ended_on)
        self.assertTrue(open_term.is_active_on(self.today))
        self.assertIsNotNone(current_bank_access_mandate(self.club_admin, self.club.id))

    def test_handover_date_is_allowed_and_real_overlap_is_refused(self):
        self._unlock()
        self._auth(self.club_admin)
        committee = self.client.post(
            "/api/club-management/committees/",
            {"club": self.club.id, "scope": "club", "name": "Board"},
            format="json",
        )
        self.assertEqual(committee.status_code, 201)
        first = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "president",
                "member": self.outgoing.id,
                "started_on": "2020-01-01",
                "ended_on": "2025-03-12",
            },
            format="json",
        )
        self.assertEqual(first.status_code, 201, first.data)
        handover = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "president",
                "member": self.incoming.id,
                "started_on": "2025-03-12",
            },
            format="json",
        )
        self.assertEqual(handover.status_code, 201, handover.data)
        overlap = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "secretary",
                "member": self.outgoing.id,
                "started_on": "2024-01-01",
                "ended_on": "2024-06-01",
            },
            format="json",
        )
        self.assertEqual(overlap.status_code, 201, overlap.data)
        clash = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "secretary",
                "member": self.incoming.id,
                "started_on": "2024-05-01",
                "ended_on": "2024-08-01",
            },
            format="json",
        )
        self.assertEqual(clash.status_code, 400)
        extra_member = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "committee_member",
                "member": self.reader.id,
                "started_on": "2024-05-01",
            },
            format="json",
        )
        self.assertEqual(extra_member.status_code, 201, extra_member.data)
        another_member = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "committee_member",
                "member": self.incoming.id,
                "started_on": "2024-05-01",
            },
            format="json",
        )
        self.assertEqual(another_member.status_code, 201, another_member.data)

    def test_replace_closes_the_old_term_and_opens_the_new_one(self):
        self._unlock()
        self._auth(self.club_admin)
        committee = self.client.post(
            "/api/club-management/committees/",
            {"club": self.club.id, "scope": "club", "name": "Board"},
            format="json",
        )
        current = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "treasurer",
                "member": self.outgoing.id,
                "started_on": "2024-01-01",
            },
            format="json",
        )
        self.assertEqual(current.status_code, 201, current.data)
        replaced = self.client.post(
            f"/api/club-management/mandates/{current.data['id']}/replace/",
            {"member": self.incoming.id, "started_on": "2026-03-12"},
            format="json",
        )
        self.assertEqual(replaced.status_code, 201, replaced.data)
        self.assertEqual(replaced.data["member"], self.incoming.id)
        self.assertEqual(replaced.data["started_on"], "2026-03-12")
        self.assertIsNone(replaced.data["ended_on"])
        self.assertIn("INCOMING", replaced.data["member_name"])
        old = CommitteeMandate.objects.get(pk=current.data["id"])
        self.assertEqual(old.ended_on, date(2026, 3, 12))
        self.assertEqual(old.member_id, self.outgoing.id)
        self.assertEqual(old.recorded_by_id, self.club_admin.id)
        self.assertEqual(CommitteeMandate.objects.get(pk=replaced.data["id"]).recorded_by_id, self.club_admin.id)

    def test_replace_of_an_underage_member_changes_nothing(self):
        self._unlock()
        self._auth(self.club_admin)
        committee = self.client.post(
            "/api/club-management/committees/",
            {"club": self.club.id, "scope": "club", "name": "Board"},
            format="json",
        )
        current = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "secretary",
                "member": self.outgoing.id,
                "started_on": "2024-01-01",
            },
            format="json",
        )
        refused = self.client.post(
            f"/api/club-management/mandates/{current.data['id']}/replace/",
            {"member": self.child.id, "started_on": self.today.isoformat()},
            format="json",
        )
        self.assertEqual(refused.status_code, 400)
        old = CommitteeMandate.objects.get(pk=current.data["id"])
        self.assertIsNone(old.ended_on)
        self.assertEqual(old.member_id, self.outgoing.id)
        self.assertEqual(CommitteeMandate.objects.filter(committee_id=committee.data["id"]).count(), 1)

    def test_past_term_can_be_corrected_and_deleted_by_club_admin(self):
        self._unlock()
        self._auth(self.club_admin)
        committee = self.client.post(
            "/api/club-management/committees/",
            {"club": self.club.id, "scope": "club", "name": "Board"},
            format="json",
        )
        past = self.client.post(
            "/api/club-management/mandates/",
            {
                "committee": committee.data["id"],
                "role": "secretary",
                "member": self.outgoing.id,
                "started_on": "2018-01-01",
                "ended_on": "2019-01-01",
            },
            format="json",
        )
        self.assertEqual(past.status_code, 201, past.data)
        corrected = self.client.patch(
            f"/api/club-management/mandates/{past.data['id']}/",
            {"member": self.reader.id, "started_on": "2018-02-01", "ended_on": "2019-02-01"},
            format="json",
        )
        self.assertEqual(corrected.status_code, 200, corrected.data)
        self.assertEqual(corrected.data["member"], self.reader.id)
        self.assertEqual(corrected.data["started_on"], "2018-02-01")
        deleted = self.client.delete(f"/api/club-management/mandates/{past.data['id']}/")
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(CommitteeMandate.objects.filter(pk=past.data["id"]).exists())

    def test_other_club_admin_cannot_edit_and_members_cannot_change_terms(self):
        self._unlock()
        committee = self._committee()
        mandate = CommitteeMandate.objects.create(
            committee=committee,
            role=CommitteeMandate.Role.PRESIDENT,
            member=self.outgoing,
            started_on=date(2024, 1, 1),
        )
        self._auth(self.other_admin)
        cross = self.client.patch(
            f"/api/club-management/mandates/{mandate.id}/",
            {"notes": "nope"},
            format="json",
        )
        self.assertEqual(cross.status_code, 404)
        self._auth(self.member_user)
        own = self.client.post(
            f"/api/club-management/mandates/{mandate.id}/replace/",
            {"member": self.incoming.id, "started_on": self.today.isoformat()},
            format="json",
        )
        self.assertEqual(own.status_code, 403)
        self._auth(self.finance_user)
        finance = self.client.delete(f"/api/club-management/mandates/{mandate.id}/")
        self.assertEqual(finance.status_code, 403)
        self._auth(self.coach_user)
        coach = self.client.patch(
            f"/api/club-management/mandates/{mandate.id}/",
            {"notes": "coach"},
            format="json",
        )
        self.assertEqual(coach.status_code, 403)
        mandate.refresh_from_db()
        self.assertEqual(mandate.notes, "")
        self.assertIsNone(mandate.ended_on)

    def test_ltf_admin_can_correct_a_club_term(self):
        self._unlock()
        committee = self._committee()
        mandate = CommitteeMandate.objects.create(
            committee=committee,
            role=CommitteeMandate.Role.SECRETARY,
            member=self.outgoing,
            started_on=date(2022, 1, 1),
            ended_on=date(2023, 1, 1),
        )
        self._auth(self.ltf_admin)
        corrected = self.client.patch(
            f"/api/club-management/mandates/{mandate.id}/",
            {"ended_on": "2023-06-01"},
            format="json",
        )
        self.assertEqual(corrected.status_code, 200, corrected.data)
        self.assertEqual(corrected.data["ended_on"], "2023-06-01")

    def test_only_one_committee_per_club(self):
        self._unlock()
        self._auth(self.club_admin)
        first = self.client.post(
            "/api/club-management/committees/",
            {"club": self.club.id, "scope": "club", "name": "Board"},
            format="json",
        )
        self.assertEqual(first.status_code, 201, first.data)
        second = self.client.post(
            "/api/club-management/committees/",
            {"club": self.club.id, "scope": "club", "name": "Youth board"},
            format="json",
        )
        self.assertEqual(second.status_code, 400)

    def test_member_sees_own_terms_and_finance_does_not(self):
        committee = self._committee()
        CommitteeMandate.objects.create(
            committee=committee,
            role=CommitteeMandate.Role.COMMITTEE_MEMBER,
            member=self.reader,
            started_on=date(2021, 5, 1),
            ended_on=date(2022, 5, 1),
        )
        CommitteeMandate.objects.create(
            committee=committee,
            role=CommitteeMandate.Role.SECRETARY,
            member=self.reader,
            started_on=date(2023, 1, 1),
        )
        self._auth(self.member_user)
        own = self.client.get(f"/api/members/{self.reader.id}/history/")
        self.assertEqual(own.status_code, 200)
        self.assertEqual(len(own.data["committee_history"]), 2)
        current = next(row for row in own.data["committee_history"] if row["role"] == "secretary")
        self.assertTrue(current["is_current"])
        self.assertEqual(current["club_name"], "History Club")
        past = next(row for row in own.data["committee_history"] if row["role"] == "committee_member")
        self.assertFalse(past["is_current"])
        hidden = self.client.get(f"/api/members/{self.outgoing.id}/history/")
        self.assertEqual(hidden.status_code, 404)

        self._auth(self.finance_user)
        finance = self.client.get(f"/api/members/{self.reader.id}/history/")
        self.assertEqual(finance.status_code, 200)
        self.assertEqual(finance.data["committee_history"], [])
        self.assertEqual(finance.data["grade_history"], [])
