from datetime import date
from io import BytesIO
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from clubmgmt.models import MemberContact, Person, PersonEmail
from .models import Member
from .test_user_accounts import MemberUserAccountTests


def _jpeg() -> SimpleUploadedFile:
    buffer = BytesIO()
    Image.new("RGB", (1400, 1800), (20, 40, 60)).save(buffer, format="JPEG")
    return SimpleUploadedFile("face.jpg", buffer.getvalue(), content_type="image/jpeg")


class MinorAccountTests(MemberUserAccountTests):
    def _guardian(self, member, email, *, primary=True, invoice=True):
        person = Person.objects.create(club=self.club, first_name="Pat", last_name="Guardian")
        PersonEmail.objects.create(person=person, email=email, use_for_invoice=invoice)
        MemberContact.objects.create(
            member=member,
            person=person,
            relation="mother",
            is_primary=primary,
        )
        return person

    def _child(self, years=10):
        today = timezone.localdate()
        return self._member("Ada", "Young", email="child@example.test", date_of_birth=today.replace(year=today.year - years))

    def test_a_minor_login_uses_a_username_and_mails_only_the_chosen_guardian(self):
        child = self._child()
        self._guardian(child, "parent@example.test")
        parent = User.objects.create_user(
            username="parent-login",
            email="parent@example.test",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        preview = self.client.get(f"/api/members/user-accounts/?ids={child.id}")
        self.assertEqual(preview.status_code, 200, preview.data)
        row = preview.data["results"][0]
        self.assertTrue(row["minor"])
        self.assertEqual(row["guardian_choices"][0]["email"], "parent@example.test")
        self.assertTrue(row["guardian_choices"][0]["suggested"])
        refused = self._post([child.id])
        self.assertEqual(refused.data["skipped"][0]["reason"], "no_guardian_email")
        with patch("accounts.email_utils.send_resend_email", return_value=(True, "")) as send:
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
            invited = self.client.post(
                "/api/members/user-accounts/",
                {"action": "send_invite", "member_ids": [child.id], "locale": "en"},
                format="json",
            )
        self.assertEqual(invited.data["sent"], 1)
        self.assertEqual(send.call_args.args[0], "parent@example.test")
        self.assertIn(created.data["created"][0]["username"], send.call_args.args[2])
        child.refresh_from_db()
        self.assertTrue(child.user.minor_account)
        self.assertEqual(child.user.email, "")
        self.assertEqual(child.user.guardian_notice_email, "parent@example.test")
        parent.refresh_from_db()
        self.assertEqual(parent.email, "parent@example.test")
        self.assertFalse(parent.minor_account)

    def test_two_guardian_addresses_send_only_the_one_the_club_picks(self):
        child = self._child()
        self._guardian(child, "mother@example.test", primary=True)
        father = Person.objects.create(club=self.club, first_name="Sam", last_name="Father")
        PersonEmail.objects.create(person=father, email="father@example.test", use_for_invoice=True)
        MemberContact.objects.create(member=child, person=father, relation="father", is_primary=False)
        preview = self.client.get(f"/api/members/user-accounts/?ids={child.id}")
        emails = {row["email"] for row in preview.data["results"][0]["guardian_choices"]}
        self.assertEqual(emails, {"mother@example.test", "father@example.test"})
        suggested = [row for row in preview.data["results"][0]["guardian_choices"] if row["suggested"]]
        self.assertEqual([row["email"] for row in suggested], ["mother@example.test"])
        with patch("accounts.email_utils.send_resend_email", return_value=(True, "")) as send:
            self.client.post(
                "/api/members/user-accounts/",
                {
                    "action": "create",
                    "member_ids": [child.id],
                    "locale": "en",
                    "guardian_emails": {str(child.id): "father@example.test"},
                },
                format="json",
            )
            self.client.post(
                "/api/members/user-accounts/",
                {"action": "send_invite", "member_ids": [child.id], "locale": "en"},
                format="json",
            )
        self.assertEqual(send.call_args.args[0], "father@example.test")
        child.refresh_from_db()
        self.assertEqual(child.user.guardian_notice_email, "father@example.test")

    def test_username_reset_reaches_the_guardian_and_not_the_parent_account(self):
        child = self._child()
        self._guardian(child, "parent@example.test")
        parent = User.objects.create_user(
            username="parent-reset",
            email="parent@example.test",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        self.client.post(
            "/api/members/user-accounts/",
            {
                "action": "create",
                "member_ids": [child.id],
                "locale": "en",
                "guardian_emails": {str(child.id): "parent@example.test"},
            },
            format="json",
        )
        child.refresh_from_db()
        self.client.force_authenticate(user=None)
        with patch("accounts.email_utils.send_resend_email", return_value=(True, "")) as send:
            by_name = self.client.post(
                "/api/auth/password-reset/?locale=en",
                {"username": child.user.username},
                format="json",
            )
            by_address = self.client.post(
                "/api/auth/password-reset/?locale=en",
                {"email": "parent@example.test"},
                format="json",
            )
        self.assertEqual(by_name.status_code, 200)
        self.assertEqual(by_address.status_code, 200)
        recipients = [call.args[0] for call in send.call_args_list]
        self.assertEqual(recipients, ["parent@example.test", "parent@example.test"])
        parent.refresh_from_db()
        child.user.refresh_from_db()
        self.assertEqual(parent.password_reset_generation, 1)
        self.assertEqual(child.user.password_reset_generation, 1)

    def test_a_club_admin_can_send_the_reset_until_the_child_turns_18(self):
        child = self._child(17)
        self._guardian(child, "parent@example.test")
        self.client.post(
            "/api/members/user-accounts/",
            {
                "action": "create",
                "member_ids": [child.id],
                "locale": "en",
                "guardian_emails": {str(child.id): "parent@example.test"},
            },
            format="json",
        )
        with patch("accounts.email_utils.send_resend_email", return_value=(True, "")) as send:
            sent = self._post([child.id], action="send_reset")
        self.assertEqual(sent.data["sent"], 1)
        self.assertEqual(send.call_args.args[0], "parent@example.test")
        Member.objects.filter(pk=child.id).update(date_of_birth=date(2000, 1, 1))
        with patch("accounts.email_utils.send_resend_email", return_value=(True, "")) as send:
            stopped = self._post([child.id], action="send_reset")
        self.assertEqual(stopped.data["sent"], 0)
        self.assertEqual(stopped.data["skipped"][0]["reason"], "reset_stopped")
        send.assert_not_called()

    def test_a_minor_can_only_open_their_home_and_queue_a_picture(self):
        child = self._child()
        self._guardian(child, "parent@example.test")
        self.client.post(
            "/api/members/user-accounts/",
            {
                "action": "create",
                "member_ids": [child.id],
                "locale": "en",
                "guardian_emails": {str(child.id): "parent@example.test"},
            },
            format="json",
        )
        child.refresh_from_db()
        minor = APIClient()
        minor.force_authenticate(user=child.user)
        own = minor.get("/api/members/")
        self.assertEqual(own.status_code, 200)
        self.assertEqual(len(own.data["results"] if isinstance(own.data, dict) else own.data), 1)
        blocked = minor.patch(f"/api/members/{child.id}/", {"first_name": "Nope"}, format="json")
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.data["detail"], "minor_account_limited")
        queued = minor.post(
            f"/api/members/{child.id}/profile-picture/",
            {"processed_image": _jpeg(), "photo_consent_confirmed": "true"},
            format="multipart",
        )
        self.assertEqual(queued.status_code, 202, getattr(queued, "data", None))
        child.refresh_from_db()
        self.assertFalse(child.profile_picture_processed)
        self.assertTrue(child.profile_picture_pending_processed)
        self.client.force_authenticate(user=self.club_admin)
        approved = self.client.post(
            f"/api/members/{child.id}/picture-review/",
            {"decision": "approve"},
            format="json",
        )
        self.assertEqual(approved.status_code, 200, approved.data)
        child.refresh_from_db()
        self.assertTrue(child.profile_picture_processed)
        self.assertFalse(child.profile_picture_pending_processed)
        queued = minor.post(
            f"/api/members/{child.id}/profile-picture/",
            {"processed_image": _jpeg(), "photo_consent_confirmed": "true"},
            format="multipart",
        )
        self.assertEqual(queued.status_code, 202, getattr(queued, "data", None))
        rejected = self.client.post(
            f"/api/members/{child.id}/picture-review/",
            {"decision": "reject"},
            format="json",
        )
        self.assertEqual(rejected.status_code, 200, rejected.data)
        child.refresh_from_db()
        self.assertTrue(child.profile_picture_processed)
        self.assertFalse(child.profile_picture_pending_processed)
