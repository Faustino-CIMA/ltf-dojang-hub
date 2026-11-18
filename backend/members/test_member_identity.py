import json

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from clubmgmt.models import MemberRecord
from clubs.models import Club

from members.models import Member, MemberVerification
from members.ssn_countries import luxembourg_check_digits
from members.test_verification import _open_grace


def _lu(body: str) -> str:
    return body + luxembourg_check_digits(body)


class MemberIdentityPanelTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ltf_admin = User.objects.create_user(
            username="identity-ltf", password="pass12345", role=User.Roles.LTF_ADMIN
        )
        self.club_admin = User.objects.create_user(
            username="identity-club", password="pass12345", role=User.Roles.CLUB_ADMIN
        )
        self.coach = User.objects.create_user(
            username="identity-coach", password="pass12345", role=User.Roles.COACH
        )
        self.finance = User.objects.create_user(
            username="identity-finance", password="pass12345", role=User.Roles.LTF_FINANCE
        )
        _open_grace(self.ltf_admin, self.club_admin, self.coach, self.finance)
        self.club = Club.objects.create(
            name="Identity Club", city="Luxembourg", address="1 Road", created_by=self.ltf_admin
        )
        self.club.admins.add(self.club_admin)
        self.club.trainers.add(self.coach)
        self.number = _lu("19711002130")
        self.member = Member.objects.create(
            club=self.club, first_name="Ada", last_name="SILVA", sex=Member.Sex.FEMALE
        )
        MemberRecord.objects.create(
            member=self.member,
            social_security_number=self.number,
            social_security_country="LU",
            nationality_1="LU",
            nationality_2="PT",
        )

    def test_detail_shows_identity_to_the_club_admin_and_hides_it_from_other_roles(self):
        self.client.force_authenticate(user=self.club_admin)
        detail = self.client.get(f"/api/members/{self.member.id}/")
        self.assertEqual(detail.status_code, 200, detail.data)
        self.assertEqual(detail.data["social_security_number"], self.number)
        self.assertEqual(detail.data["social_security_country"], "LU")
        self.assertEqual(detail.data["nationality_1"], "LU")
        self.assertEqual(detail.data["nationality_2"], "PT")
        listing = self.client.get("/api/members/")
        self.assertNotIn(self.number, json.dumps(listing.data))
        for user in (self.coach, self.finance):
            self.client.force_authenticate(user=user)
            hidden = self.client.get(f"/api/members/{self.member.id}/")
            self.assertEqual(hidden.status_code, 200, hidden.data)
            self.assertNotIn("social_security_number", hidden.data)
            self.assertNotIn(self.number, json.dumps(hidden.data))

    def test_edit_keeps_a_locked_number_and_still_saves_nationality(self):
        MemberVerification.objects.create(
            member=self.member,
            status=MemberVerification.Status.VERIFIED,
            method="card",
            locked_fields=["first_name", "last_name", "date_of_birth", "sex", "social_security_number"],
        )
        self.client.force_authenticate(user=self.club_admin)
        saved = self.client.patch(
            f"/api/members/{self.member.id}/",
            {"nationality_1": "FR", "nationality_2": ""},
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        self.member.club_record.refresh_from_db()
        self.assertEqual(self.member.club_record.nationality_1, "FR")
        self.assertEqual(self.member.club_record.social_security_number, self.number)
        blocked = self.client.patch(
            f"/api/members/{self.member.id}/",
            {"social_security_number": _lu("19711002131"), "social_security_country": "LU"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("social_security_number", blocked.data)
        self.member.club_record.refresh_from_db()
        self.assertEqual(self.member.club_record.social_security_number, self.number)
