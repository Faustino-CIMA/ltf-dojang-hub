from datetime import date, timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from clubmgmt.models import Committee, CommitteeMandate
from clubs.models import Club
from members.models import Member
from modules.codes import build_payload, sign_payload
from modules.entitlements import install_id_str, redeem_product_code, set_club_assignment
from modules.registry import EVENT_CALENDAR_MODULE_ID, PREVIEW_MODULE_ID

from .models import Event, EventAttention


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

    def test_accepts_tournament_kind_and_rejects_inverted_times(self):
        self._entitle()
        self._auth(self.ltf_admin)
        kind = self.client.post(
            "/api/events/",
            self._payload(kind=Event.Kind.KYORUGI, title="Spring Kyorugi"),
            format="json",
        )
        self.assertEqual(kind.status_code, 201)
        self.assertEqual(kind.data["kind"], Event.Kind.KYORUGI)
        patched = self.client.patch(
            f"/api/events/{kind.data['id']}/",
            {"kind": Event.Kind.POOMSAE},
            format="json",
        )
        self.assertEqual(patched.status_code, 200)
        self.assertEqual(patched.data["kind"], Event.Kind.POOMSAE)
        inverted = self.client.post(
            "/api/events/",
            self._payload(
                starts_at=self.end.isoformat(),
                ends_at=self.start.isoformat(),
            ),
            format="json",
        )
        self.assertEqual(inverted.status_code, 400)

    def test_shared_club_event_reaches_other_clubs_and_the_ltf(self):
        self._entitle()
        self._assign(self.club)
        self._assign(self.other_club)
        self._auth(self.club_admin)
        created = self.client.post(
            "/api/events/",
            self._payload(
                owner_scope=Event.OwnerScope.CLUB,
                club=self.club.id,
                title="Spring Kyorugi",
                kind=Event.Kind.KYORUGI,
                visibility=Event.Visibility.SHARED,
            ),
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["club_name"], "Main Club")

        self._auth(self.other_admin)
        listed = self.client.get(f"/api/events/?scope=club&club={self.other_club.id}")
        self.assertEqual(listed.status_code, 200)
        row = next(item for item in listed.data if item["title"] == "Spring Kyorugi")
        self.assertEqual(row["kind"], Event.Kind.KYORUGI)
        self.assertEqual(row["club_name"], "Main Club")
        locked = self.client.get(f"/api/events/?scope=club&club={self.club.id}")
        self.assertEqual(locked.status_code, 403)

        other_member = User.objects.create_user(
            username="othermember",
            email="othermember@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        Member.objects.create(
            user=other_member,
            club=self.other_club,
            first_name="Bea",
            last_name="Other",
        )
        self._auth(other_member)
        hidden = {item["title"] for item in self.client.get("/api/events/").data}
        self.assertNotIn("Spring Kyorugi", hidden)

        self._auth(self.member_user)
        home = {item["title"] for item in self.client.get("/api/events/").data}
        self.assertIn("Spring Kyorugi", home)

        self._auth(self.ltf_admin)
        federation = {item["title"] for item in self.client.get("/api/events/?scope=federation").data}
        self.assertIn("Spring Kyorugi", federation)

    def test_club_private_and_internal_stay_inside_the_club(self):
        self._entitle()
        self._assign(self.club)
        self._auth(self.club_admin)
        private = self.client.post(
            "/api/events/",
            self._payload(
                owner_scope=Event.OwnerScope.CLUB,
                club=self.club.id,
                title="Committee",
                visibility=Event.Visibility.PRIVATE,
            ),
            format="json",
        )
        self.assertEqual(private.status_code, 201)
        internal = self.client.post(
            "/api/events/",
            self._payload(
                owner_scope=Event.OwnerScope.CLUB,
                club=self.club.id,
                title="Europapark",
                visibility=Event.Visibility.INTERNAL,
            ),
            format="json",
        )
        self.assertEqual(internal.status_code, 201)

        self._auth(self.ltf_admin)
        club_titles = {
            item["title"]
            for item in self.client.get(f"/api/events/?scope=club&club={self.club.id}").data
        }
        self.assertNotIn("Committee", club_titles)
        self.assertNotIn("Europapark", club_titles)
        federation_titles = {
            item["title"] for item in self.client.get("/api/events/?scope=federation").data
        }
        self.assertNotIn("Committee", federation_titles)
        self.assertNotIn("Europapark", federation_titles)
        detail = self.client.get(f"/api/events/{private.data['id']}/")
        self.assertEqual(detail.status_code, 403)

        coach = User.objects.create_user(
            username="maincoach",
            email="coach@example.com",
            password="pass12345",
            role=User.Roles.COACH,
        )
        self.club.trainers.add(coach)
        self._auth(coach)
        coach_titles = {
            item["title"]
            for item in self.client.get(f"/api/events/?scope=club&club={self.club.id}").data
        }
        self.assertNotIn("Committee", coach_titles)
        self.assertIn("Europapark", coach_titles)

    def test_presidents_meeting_is_only_for_ltf_and_invited_presidents(self):
        self._entitle()
        self._assign(self.club)
        self._assign(self.other_club)
        president_user = User.objects.create_user(
            username="president",
            email="president@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        president = Member.objects.create(
            user=president_user,
            club=self.other_club,
            first_name="Pat",
            last_name="President",
        )
        committee = Committee.objects.create(
            club=self.other_club,
            scope=Committee.Scope.CLUB,
            name="Board",
        )
        CommitteeMandate.objects.create(
            committee=committee,
            role=CommitteeMandate.Role.PRESIDENT,
            member=president,
            started_on=date.today() - timedelta(days=10),
        )
        coach = User.objects.create_user(
            username="othercoach",
            email="othercoach@example.com",
            password="pass12345",
            role=User.Roles.COACH,
        )
        self.other_club.trainers.add(coach)

        self._auth(self.ltf_admin)
        missing = self.client.post(
            "/api/events/",
            self._payload(title="Presidents", visibility=Event.Visibility.PRESIDENTS),
            format="json",
        )
        self.assertEqual(missing.status_code, 400)
        created = self.client.post(
            "/api/events/",
            self._payload(
                title="Presidents day",
                visibility=Event.Visibility.PRESIDENTS,
                audience_clubs=[self.other_club.id],
            ),
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["audience_clubs"], [self.other_club.id])
        event_id = created.data["id"]
        federation = {item["title"] for item in self.client.get("/api/events/?scope=federation").data}
        self.assertIn("Presidents day", federation)

        self._auth(president_user)
        seen = {
            item["title"]
            for item in self.client.get(f"/api/events/?scope=club&club={self.other_club.id}").data
        }
        self.assertIn("Presidents day", seen)

        self._auth(self.other_admin)
        admin_titles = {
            item["title"]
            for item in self.client.get(f"/api/events/?scope=club&club={self.other_club.id}").data
        }
        self.assertNotIn("Presidents day", admin_titles)
        self.assertEqual(self.client.get(f"/api/events/{event_id}/").status_code, 403)

        self._auth(coach)
        coach_titles = {
            item["title"]
            for item in self.client.get(f"/api/events/?scope=club&club={self.other_club.id}").data
        }
        self.assertNotIn("Presidents day", coach_titles)

        self._auth(self.club_admin)
        club_attempt = self.client.post(
            "/api/events/",
            self._payload(
                owner_scope=Event.OwnerScope.CLUB,
                club=self.club.id,
                visibility=Event.Visibility.PRESIDENTS,
                audience_clubs=[self.club.id],
            ),
            format="json",
        )
        self.assertEqual(club_attempt.status_code, 400)

    def test_summary_counts_two_months_and_clears_new_when_opened(self):
        self._entitle()
        self._assign(self.club)
        self._assign(self.other_club)
        self._auth(self.club_admin)
        soon = self.client.post(
            "/api/events/",
            self._payload(
                owner_scope=Event.OwnerScope.CLUB,
                club=self.club.id,
                title="Soon",
            ),
            format="json",
        )
        self.assertEqual(soon.status_code, 201)
        later_start = self.start + timedelta(days=75)
        later = self.client.post(
            "/api/events/",
            self._payload(
                owner_scope=Event.OwnerScope.CLUB,
                club=self.club.id,
                title="Later",
                starts_at=later_start.isoformat(),
                ends_at=(later_start + timedelta(hours=2)).isoformat(),
            ),
            format="json",
        )
        self.assertEqual(later.status_code, 201)
        private = self.client.post(
            "/api/events/",
            self._payload(
                owner_scope=Event.OwnerScope.CLUB,
                club=self.club.id,
                title="Secret",
                visibility=Event.Visibility.PRIVATE,
            ),
            format="json",
        )
        self.assertEqual(private.status_code, 201)

        admin_summary = self.client.get(f"/api/events/summary/?scope=club&club={self.club.id}")
        self.assertEqual(admin_summary.status_code, 200)
        self.assertEqual(admin_summary.data["upcoming_count"], 2)
        self.assertEqual(admin_summary.data["unseen_count"], 2)
        listed = self.client.get(f"/api/events/?scope=club&club={self.club.id}")
        self.assertEqual(listed.status_code, 200)
        still_new = self.client.get(f"/api/events/summary/?scope=club&club={self.club.id}")
        self.assertEqual(still_new.data["unseen_count"], 2)

        self._auth(self.member_user)
        member_summary = self.client.get("/api/events/summary/")
        self.assertEqual(member_summary.status_code, 200)
        self.assertEqual(member_summary.data["upcoming_count"], 1)
        self.assertEqual(member_summary.data["unseen_count"], 1)
        opened = self.client.get(f"/api/events/{soon.data['id']}/")
        self.assertEqual(opened.status_code, 200)
        after = self.client.get("/api/events/summary/")
        self.assertEqual(after.data["upcoming_count"], 1)
        self.assertEqual(after.data["unseen_count"], 0)

        self._auth(self.other_admin)
        other = self.client.get(f"/api/events/summary/?scope=club&club={self.other_club.id}")
        self.assertEqual(other.status_code, 200)
        self.assertEqual(other.data["upcoming_count"], 0)

    def test_club_admin_can_snooze_or_dismiss_a_reminder(self):
        self._entitle()
        self._assign(self.club)
        self._auth(self.club_admin)
        created = self.client.post(
            "/api/events/",
            self._payload(
                owner_scope=Event.OwnerScope.CLUB,
                club=self.club.id,
                title="Soon",
            ),
            format="json",
        )
        event_id = created.data["id"]
        default = self.client.post(f"/api/events/{event_id}/reminder/", {}, format="json")
        self.assertEqual(default.status_code, 200)
        self.assertEqual(
            default.data["remind_on"],
            timezone.localtime(self.start).date().isoformat(),
        )
        self.assertEqual(self.client.get("/api/events/reminders/").data, [])

        armed = self.client.post(
            f"/api/events/{event_id}/reminder/",
            {"remind_on": timezone.localdate().isoformat()},
            format="json",
        )
        self.assertEqual(armed.status_code, 200)
        due = self.client.get("/api/events/reminders/")
        self.assertEqual([row["title"] for row in due.data], ["Soon"])

        snoozed = self.client.post(f"/api/events/{event_id}/reminder-snooze/", {}, format="json")
        self.assertEqual(snoozed.status_code, 200)
        self.assertIsNotNone(snoozed.data["snoozed_until"])
        self.assertEqual(self.client.get("/api/events/reminders/").data, [])

        attention = EventAttention.objects.get(user=self.club_admin, event_id=event_id)
        attention.snoozed_until = timezone.now() - timedelta(minutes=1)
        attention.save(update_fields=["snoozed_until"])
        self.assertEqual(
            [row["id"] for row in self.client.get("/api/events/reminders/").data],
            [event_id],
        )

        dismissed = self.client.post(f"/api/events/{event_id}/reminder-dismiss/", {}, format="json")
        self.assertEqual(dismissed.status_code, 200)
        self.assertTrue(dismissed.data["dismissed"])
        self.assertEqual(self.client.get("/api/events/reminders/").data, [])
        attention.refresh_from_db()
        attention.snoozed_until = None
        attention.save(update_fields=["snoozed_until"])
        self.assertEqual(self.client.get("/api/events/reminders/").data, [])

        coach = User.objects.create_user(
            username="remindcoach",
            email="remindcoach@example.com",
            password="pass12345",
            role=User.Roles.COACH,
        )
        self.club.trainers.add(coach)
        self._auth(coach)
        self.assertEqual(
            self.client.post(f"/api/events/{event_id}/reminder/", {}, format="json").status_code,
            403,
        )
        self._auth(self.member_user)
        self.assertEqual(
            self.client.post(f"/api/events/{event_id}/reminder/", {}, format="json").status_code,
            403,
        )

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
