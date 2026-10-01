from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club
from members.models import Member
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
from modules.registry import EVENT_CALENDAR_MODULE_ID, PREVIEW_MODULE_ID

from .models import Event


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class EventCalendarTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ltf_admin = User.objects.create_user(
            username="ltfadmin",
            email="ltf@example.com",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.club_admin = User.objects.create_user(
            username="clubadmin",
            email="club@example.com",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.other_admin = User.objects.create_user(
            username="otheradmin",
            email="other@example.com",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.member_user = User.objects.create_user(
            username="clubmember",
            email="member@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        self.club = Club.objects.create(name="Main Club", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        self.other_club = Club.objects.create(name="Other Club", created_by=self.ltf_admin)
        self.other_club.admins.add(self.other_admin)
        self.member = Member.objects.create(
            user=self.member_user,
            club=self.club,
            first_name="Ada",
            last_name="Member",
        )
        self.start = timezone.now() + timedelta(days=2)
        self.end = self.start + timedelta(hours=2)

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def _entitle(self, modules=None):
        token = sign_payload(
            build_payload(
                module_ids=modules or [EVENT_CALENDAR_MODULE_ID],
                install_id=install_id_str(),
            )
        )
        redeem_product_code(token)

    def _assign(self, club, enabled=True):
        set_club_assignment(
            club=club,
            module_id=EVENT_CALENDAR_MODULE_ID,
            enabled=enabled,
            user=self.ltf_admin,
        )

    def _payload(self, **overrides):
        data = {
            "title": "Open training",
            "description": "All belts",
            "kind": Event.Kind.CALENDAR,
            "owner_scope": Event.OwnerScope.FEDERATION,
            "venue_name": "National dojang",
            "starts_at": self.start.isoformat(),
            "ends_at": self.end.isoformat(),
            "all_day": False,
            "visibility": Event.Visibility.PUBLIC,
        }
        data.update(overrides)
        return data

    def test_list_forbidden_without_entitlement(self):
        self._auth(self.ltf_admin)
        response = self.client.get("/api/events/?scope=federation")
        self.assertEqual(response.status_code, 403)

    def test_ltf_admin_crud_federation_when_entitled(self):
        self._entitle()
        self._auth(self.ltf_admin)
        created = self.client.post("/api/events/", self._payload(), format="json")
        self.assertEqual(created.status_code, 201)
        event_id = created.data["id"]
        listed = self.client.get("/api/events/?scope=federation")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.data), 1)
        patched = self.client.patch(
            f"/api/events/{event_id}/",
            {"title": "Open training (updated)"},
            format="json",
        )
        self.assertEqual(patched.status_code, 200)
        self.assertEqual(patched.data["title"], "Open training (updated)")
        deleted = self.client.delete(f"/api/events/{event_id}/")
        self.assertEqual(deleted.status_code, 204)

    def test_club_admin_cannot_create_federation_event(self):
        self._entitle()
        self._assign(self.club)
        self._auth(self.club_admin)
        response = self.client.post("/api/events/", self._payload(), format="json")
        self.assertEqual(response.status_code, 403)

    def test_club_admin_crud_requires_assignment(self):
        self._entitle()
        self._auth(self.club_admin)
        locked = self.client.post(
            "/api/events/",
            self._payload(
                owner_scope=Event.OwnerScope.CLUB,
                club=self.club.id,
            ),
            format="json",
        )
        self.assertEqual(locked.status_code, 403)
        self._assign(self.club)
        created = self.client.post(
            "/api/events/",
            self._payload(
                owner_scope=Event.OwnerScope.CLUB,
                club=self.club.id,
                title="Club grading",
            ),
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        listed = self.client.get(f"/api/events/?scope=club&club={self.club.id}")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data[0]["title"], "Club grading")

    def test_other_club_cannot_read_or_write(self):
        self._entitle()
        self._assign(self.club)
        self._auth(self.club_admin)
        created = self.client.post(
            "/api/events/",
            self._payload(owner_scope=Event.OwnerScope.CLUB, club=self.club.id),
            format="json",
        )
        event_id = created.data["id"]
        self._assign(self.other_club)
        self._auth(self.other_admin)
        listed = self.client.get(f"/api/events/?scope=club&club={self.club.id}")
        self.assertEqual(listed.status_code, 403)
        sneak = self.client.patch(
            f"/api/events/{event_id}/",
            {"title": "Hijack"},
            format="json",
        )
        self.assertEqual(sneak.status_code, 403)

    def test_member_sees_public_federation_and_home_club(self):
        self._entitle()
        self._assign(self.club)
        self._auth(self.ltf_admin)
        self.client.post("/api/events/", self._payload(title="Nationals"), format="json")
        self.client.force_authenticate(user=self.club_admin)
        self.client.post(
            "/api/events/",
            self._payload(
                owner_scope=Event.OwnerScope.CLUB,
                club=self.club.id,
                title="Club night",
            ),
            format="json",
        )
        self.client.post(
            "/api/events/",
            self._payload(
                owner_scope=Event.OwnerScope.CLUB,
                club=self.club.id,
                title="Staff only",
                visibility=Event.Visibility.PRIVATE,
            ),
            format="json",
        )
        self._auth(self.member_user)
        listed = self.client.get("/api/events/")
        titles = {row["title"] for row in listed.data}
        self.assertIn("Nationals", titles)
        self.assertIn("Club night", titles)
        self.assertNotIn("Staff only", titles)

    def test_rejects_tournament_kind_and_inverted_times(self):
        self._entitle()
        self._auth(self.ltf_admin)
        kind = self.client.post(
            "/api/events/",
            self._payload(kind=Event.Kind.KYORUGI),
            format="json",
        )
        self.assertEqual(kind.status_code, 400)
        inverted = self.client.post(
            "/api/events/",
            self._payload(
                starts_at=self.end.isoformat(),
                ends_at=self.start.isoformat(),
            ),
            format="json",
        )
        self.assertEqual(inverted.status_code, 400)

    def test_list_accepts_date_only_range(self):
        self._entitle()
        self._assign(self.club)
        self._auth(self.club_admin)
        created = self.client.post(
            "/api/events/",
            self._payload(owner_scope=Event.OwnerScope.CLUB, club=self.club.id),
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        start = self.start.date().isoformat()
        end = (self.end + timedelta(days=1)).date().isoformat()
        listed = self.client.get(
            f"/api/events/?scope=club&club={self.club.id}&from={start}&to={end}"
        )
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.data), 1)

    def test_preview_module_does_not_unlock_calendar(self):
        token = sign_payload(
            build_payload(module_ids=[PREVIEW_MODULE_ID], install_id=install_id_str())
        )
        redeem_product_code(token)
        self._auth(self.ltf_admin)
        response = self.client.get("/api/events/?scope=federation")
        self.assertEqual(response.status_code, 403)
