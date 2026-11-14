import importlib
from datetime import date, timedelta
from unittest.mock import patch

from django.apps import apps
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import DeskGrant, User
from clubs.models import Club
from clubmgmt.models import MemberContact, Person, PersonEmail
from ops.models import OpsAuditLog

from .models import AdminNotice, Member
from .test_minor_accounts import _jpeg

open_notices = importlib.import_module(
    "members.migrations.0025_open_notices_for_waiting_pictures"
).open_notices


class PictureNoticeTests(TestCase):
    def setUp(self):
        self.ltf_admin = User.objects.create_user(
            username="ltf-photo",
            email="ltf-photo@example.test",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.club_admin = User.objects.create_user(
            username="club-photo",
            email="club-photo@example.test",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.other_admin = User.objects.create_user(
            username="other-photo",
            email="other-photo@example.test",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.coach = User.objects.create_user(
            username="coach-photo",
            email="coach-photo@example.test",
            password="pass12345",
            role=User.Roles.COACH,
        )
        self.club = Club.objects.create(name="Photo Club", created_by=self.ltf_admin)
        self.other = Club.objects.create(name="Other Photo Club", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        self.club.trainers.add(self.coach)
        self.other.admins.add(self.other_admin)
        self.client = APIClient()
        self.client.force_authenticate(user=self.club_admin)

    def _child(self):
        today = timezone.localdate()
        member = Member.objects.create(
            club=self.club,
            first_name="Ada",
            last_name="Young",
            email="child@example.test",
            date_of_birth=today.replace(year=today.year - 10),
            is_active=True,
        )
        person = Person.objects.create(club=self.club, first_name="Pat", last_name="Guardian")
        PersonEmail.objects.create(person=person, email="parent@example.test", use_for_invoice=True)
        MemberContact.objects.create(member=member, person=person, relation="mother", is_primary=True)
        return member

    def _queue(self):
        child = self._child()
        created = self.client.post(
            "/api/members/user-accounts/",
            {
                "action": "create",
                "member_ids": [child.id],
                "locale": "en",
                "guardian_emails": {str(child.id): "parent@example.test"},
            },
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.data)
        child.refresh_from_db()
        minor = APIClient()
        minor.force_authenticate(user=child.user)
        queued = minor.post(
            f"/api/members/{child.id}/profile-picture/",
            {"processed_image": _jpeg(), "photo_consent_confirmed": "true"},
            format="multipart",
        )
        self.assertEqual(queued.status_code, 202, getattr(queued, "data", None))
        child.refresh_from_db()
        return child, minor

    def _row(self, member_id, client=None):
        listed = (client or self.client).get("/api/members/?page=1&page_size=50")
        self.assertEqual(listed.status_code, 200, listed.data)
        rows = listed.data["results"] if isinstance(listed.data, dict) else listed.data
        return next(row for row in rows if row["id"] == member_id)

    def test_a_minor_upload_waits_and_a_club_admin_can_approve_it(self):
        child, minor = self._queue()
        self.assertFalse(child.profile_picture_processed)
        self.assertEqual(AdminNotice.objects.filter(member=child, resolved_at__isnull=True).count(), 1)
        self.assertEqual(self._row(child.id, minor)["review_state"], "pending")
        self.assertEqual(self._row(child.id)["picture_review"], "pending")
        notices = self.client.get("/api/notices/")
        self.assertEqual([row["member_id"] for row in notices.data], [child.id])
        detail = self.client.get(f"/api/members/{child.id}/picture-review/")
        self.assertEqual(detail.status_code, 200, detail.data)
        self.assertTrue(detail.data["pending_url"])
        self.assertEqual(detail.data["face_check"], "skipped")
        approved = self.client.post(
            f"/api/members/{child.id}/picture-review/",
            {"decision": "approve"},
            format="json",
        )
        self.assertEqual(approved.status_code, 200, approved.data)
        child.refresh_from_db()
        self.assertTrue(child.profile_picture_processed)
        self.assertFalse(child.profile_picture_pending_processed)
        self.assertEqual(AdminNotice.objects.filter(member=child, resolved_at__isnull=True).count(), 0)
        audit = OpsAuditLog.objects.get(action="members.picture_review")
        self.assertEqual(audit.metadata["decision"], "approve")
        self.assertNotIn("reason", audit.metadata)
        self.assertEqual(self.client.get("/api/notices/").data, [])

    def test_picture_review_shows_a_passed_face_check_from_metadata(self):
        child, _minor = self._queue()
        child.photo_edit_metadata = {"pending_face_check": "pass", "crop": {"x": 1}}
        child.save(update_fields=["photo_edit_metadata", "updated_at"])
        detail = self.client.get(f"/api/members/{child.id}/picture-review/")
        self.assertEqual(detail.status_code, 200, detail.data)
        self.assertEqual(detail.data["face_check"], "pass")

    def test_rejection_keeps_the_current_photo_and_a_new_upload_clears_the_reason(self):
        child, minor = self._queue()
        self.client.post(
            f"/api/members/{child.id}/profile-picture/",
            {"processed_image": _jpeg(), "photo_consent_confirmed": "true"},
            format="multipart",
        )
        rejected = self.client.post(
            f"/api/members/{child.id}/picture-review/",
            {"decision": "reject", "reason": "Too dark"},
            format="json",
        )
        self.assertEqual(rejected.status_code, 200, rejected.data)
        child.refresh_from_db()
        self.assertTrue(child.profile_picture_processed)
        self.assertFalse(child.profile_picture_pending_processed)
        seen = self._row(child.id, minor)
        self.assertEqual(seen["review_state"], "rejected")
        self.assertEqual(seen["rejection_reason"], "Too dark")
        again = minor.post(
            f"/api/members/{child.id}/profile-picture/",
            {"processed_image": _jpeg(), "photo_consent_confirmed": "true"},
            format="multipart",
        )
        self.assertEqual(again.status_code, 202, getattr(again, "data", None))
        self.assertEqual(AdminNotice.objects.filter(member=child, resolved_at__isnull=True).count(), 1)
        cleared = self._row(child.id, minor)
        self.assertEqual(cleared["review_state"], "pending")
        self.assertEqual(cleared["rejection_reason"], "")

    def test_another_club_a_coach_and_a_view_only_desk_cannot_decide(self):
        child, _minor = self._queue()
        other = APIClient()
        other.force_authenticate(user=self.other_admin)
        self.assertEqual(other.get(f"/api/members/{child.id}/picture-review/").status_code, 404)
        coach_client = APIClient()
        coach_client.force_authenticate(user=self.coach)
        self.assertEqual(self._row(child.id, coach_client)["picture_review"], "pending")
        self.assertEqual(coach_client.get(f"/api/members/{child.id}/picture-review/").status_code, 403)
        self.assertEqual(
            coach_client.post(
                f"/api/members/{child.id}/picture-review/",
                {"decision": "approve"},
                format="json",
            ).status_code,
            403,
        )
        self.assertEqual(coach_client.get("/api/notices/").data, [])
        today = timezone.localdate()
        DeskGrant.objects.filter(user=self.club_admin, level=DeskGrant.Level.FULL).update(valid_until=today)
        DeskGrant.objects.create(
            user=self.club_admin,
            desk=DeskGrant.Desk.CLUB_ADMIN,
            level=DeskGrant.Level.READ_ONLY,
            club=self.club,
            source=DeskGrant.Source.MANUAL,
            valid_from=today - timedelta(days=1),
            valid_until=today + timedelta(days=5),
            reason="Look only",
        )
        self.assertEqual(self._row(child.id)["picture_review"], "")
        self.assertEqual(self.client.get("/api/notices/").data, [])
        self.assertEqual(self.client.get(f"/api/members/{child.id}/picture-review/").status_code, 403)
        self.assertEqual(
            self.client.post(
                f"/api/members/{child.id}/picture-review/",
                {"decision": "reject"},
                format="json",
            ).status_code,
            403,
        )

    def test_an_ltf_admin_can_reject_and_a_waiting_picture_without_a_notice_is_backfilled(self):
        child, _minor = self._queue()
        self.client.force_authenticate(user=self.ltf_admin)
        rejected = self.client.post(
            f"/api/members/{child.id}/picture-review/",
            {"decision": "reject"},
            format="json",
        )
        self.assertEqual(rejected.status_code, 200, rejected.data)
        self.assertEqual(rejected.data["decision"], "reject")
        AdminNotice.objects.filter(member=child).delete()
        child.refresh_from_db()
        child.profile_picture_pending_processed.save("waiting.jpg", _jpeg(), save=True)
        open_notices(apps, None)
        self.assertTrue(
            AdminNotice.objects.filter(member=child, kind="picture_review", resolved_at__isnull=True).exists()
        )

    def test_an_adult_upload_replaces_the_photo_and_creates_no_notice(self):
        adult = Member.objects.create(
            club=self.club,
            first_name="Adult",
            last_name="Photo",
            email="adult.photo@example.test",
            date_of_birth=date(2000, 1, 1),
            is_active=True,
        )
        saved = self.client.post(
            f"/api/members/{adult.id}/profile-picture/",
            {"processed_image": _jpeg(), "photo_consent_confirmed": "true"},
            format="multipart",
        )
        self.assertEqual(saved.status_code, 201, getattr(saved, "data", None))
        adult.refresh_from_db()
        self.assertTrue(adult.profile_picture_processed)
        self.assertFalse(AdminNotice.objects.filter(member=adult).exists())

    def test_a_rejection_tells_the_member_and_emails_only_the_guardian(self):
        child, minor = self._queue()
        other = User.objects.create_user(
            username="other-child",
            email="other-child@example.test",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        with patch("accounts.email_utils.send_resend_email", return_value=(True, "")) as send:
            rejected = self.client.post(
                f"/api/members/{child.id}/picture-review/",
                {"decision": "reject", "reason": "Too dark", "locale": "en"},
                format="json",
            )
        self.assertEqual(rejected.status_code, 200, rejected.data)
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args.args[0], "parent@example.test")
        self.assertEqual(send.call_args.args[1], "Photo not approved")
        self.assertIn("Too dark", send.call_args.args[3])
        self.assertNotIn("child@example.test", send.call_args.args[0])
        member_notices = minor.get("/api/notices/")
        self.assertEqual(member_notices.status_code, 200, member_notices.data)
        self.assertEqual([row["kind"] for row in member_notices.data], ["picture_rejected"])
        self.assertEqual(self.client.get("/api/notices/").data, [])
        stranger = APIClient()
        stranger.force_authenticate(user=other)
        self.assertEqual(stranger.get("/api/notices/").data, [])
        coach_client = APIClient()
        coach_client.force_authenticate(user=self.coach)
        self.assertEqual(coach_client.get("/api/notices/").data, [])
        seen = self._row(child.id, minor)
        self.assertEqual(seen["review_state"], "rejected")
        self.assertEqual(seen["rejection_reason"], "Too dark")

    def test_a_blank_reason_still_rejects_and_a_missing_guardian_address_does_not_block_it(self):
        child, minor = self._queue()
        child.user.guardian_notice_email = ""
        child.user.save(update_fields=["guardian_notice_email"])
        with patch("accounts.email_utils.send_resend_email", return_value=(True, "")) as send:
            rejected = self.client.post(
                f"/api/members/{child.id}/picture-review/",
                {"decision": "reject", "reason": "   ", "locale": "fr"},
                format="json",
            )
        self.assertEqual(rejected.status_code, 200, rejected.data)
        send.assert_not_called()
        notice = AdminNotice.objects.get(member=child, kind="picture_rejected", resolved_at__isnull=True)
        self.assertEqual(notice.reason, "")
        self.assertEqual(self._row(child.id, minor)["rejection_reason"], "")

    def test_a_new_photo_closes_the_member_notice_and_approval_sends_no_mail(self):
        child, minor = self._queue()
        with patch("accounts.email_utils.send_resend_email", return_value=(True, "")) as send:
            self.client.post(
                f"/api/members/{child.id}/picture-review/",
                {"decision": "reject", "reason": "Too dark", "locale": "de"},
                format="json",
            )
        self.assertEqual(send.call_count, 1)
        again = minor.post(
            f"/api/members/{child.id}/profile-picture/",
            {"processed_image": _jpeg(), "photo_consent_confirmed": "true"},
            format="multipart",
        )
        self.assertEqual(again.status_code, 202, getattr(again, "data", None))
        self.assertFalse(
            AdminNotice.objects.filter(member=child, kind="picture_rejected", resolved_at__isnull=True).exists()
        )
        self.assertEqual(minor.get("/api/notices/").data, [])
        self.assertEqual(self._row(child.id, minor)["review_state"], "pending")
        self.assertEqual(self._row(child.id, minor)["rejection_reason"], "")
        with patch("accounts.email_utils.send_resend_email", return_value=(True, "")) as approve_send:
            approved = self.client.post(
                f"/api/members/{child.id}/picture-review/",
                {"decision": "approve", "locale": "en"},
                format="json",
            )
        self.assertEqual(approved.status_code, 200, approved.data)
        approve_send.assert_not_called()
        picture = minor.get(f"/api/members/{child.id}/profile-picture/processed/")
        self.assertEqual(picture.status_code, 200)
        self.assertGreater(len(b"".join(picture.streaming_content)), 20)
        self.assertEqual(picture["Cache-Control"], "no-store")
        thumb = minor.get(f"/api/members/{child.id}/profile-picture/thumbnail/")
        self.assertEqual(thumb.status_code, 200)
        listed = minor.get("/api/members/")
        rows = listed.data["results"] if isinstance(listed.data, dict) else listed.data
        own = next(row for row in rows if row["id"] == child.id)
        self.assertIn(f"/api/members/{child.id}/profile-picture/processed/?v=", own["profile_picture_url"])
        stranger = APIClient()
        stranger.force_authenticate(user=self.other_admin)
        self.assertEqual(
            stranger.get(f"/api/members/{child.id}/profile-picture/processed/").status_code,
            404,
        )
        self.assertFalse(
            AdminNotice.objects.filter(member=child, kind="picture_rejected", resolved_at__isnull=True).exists()
        )
