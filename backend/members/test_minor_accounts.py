from datetime import date
from io import BytesIO
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from allauth.account.models import EmailAddress

from accounts.models import User
from accounts.setup_invites import issue_setup_invite
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

    def _open_invite(self, member):
        _invite, raw = issue_setup_invite(member.user, self.club_admin)
        return APIClient(), raw

    def test_a_minor_finishes_setup_without_an_email_and_ignores_one_that_is_sent(self):
        child = self._child()
        self._guardian(child, "parent@example.test")
        parent = User.objects.create_user(
            username="parent-setup",
            email="parent@example.test",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
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
        public, raw = self._open_invite(child)
        opened = public.get("/api/auth/account-setup/", {"token": raw})
        self.assertEqual(opened.status_code, 200, opened.data)
        self.assertTrue(opened.data["minor_account"])
        self.assertEqual(opened.data["username"], child.user.username)
        self.assertNotIn("email", opened.data)
        self.assertNotIn("parent@example.test", str(opened.data))
        saved = public.post(
            "/api/auth/account-setup/",
            {
                "token": raw,
                "password": "Correct-horse-battery",
                "password_confirm": "Correct-horse-battery",
                "email": "parent@example.test",
                "minor_account": False,
            },
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        child.refresh_from_db()
        child.user.refresh_from_db()
        self.assertEqual(child.user.email, "")
        self.assertEqual(child.email, "child@example.test")
        self.assertTrue(child.user.check_password("Correct-horse-battery"))
        self.assertTrue(child.user.is_email_verified)
        self.assertFalse(EmailAddress.objects.filter(user=child.user).exists())
        parent.refresh_from_db()
        self.assertEqual(parent.email, "parent@example.test")
        self.assertFalse(parent.check_password("Correct-horse-battery"))
        signed_in = public.post(
            "/api/auth/login/",
            {"username": child.user.username, "password": "Correct-horse-battery"},
            format="json",
        )
        self.assertEqual(signed_in.status_code, 200, signed_in.data)

    def test_a_minor_setup_succeeds_when_the_email_field_is_left_out(self):
        child = self._child()
        self._guardian(child, "other-parent@example.test")
        created = self.client.post(
            "/api/members/user-accounts/",
            {
                "action": "create",
                "member_ids": [child.id],
                "locale": "en",
                "guardian_emails": {str(child.id): "other-parent@example.test"},
            },
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.data)
        child.refresh_from_db()
        public, raw = self._open_invite(child)
        saved = public.post(
            "/api/auth/account-setup/",
            {
                "token": raw,
                "password": "Correct-horse-battery",
                "password_confirm": "Correct-horse-battery",
            },
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        child.user.refresh_from_db()
        self.assertEqual(child.user.email, "")
        self.assertTrue(child.user.check_password("Correct-horse-battery"))

    def test_an_adult_setup_still_requires_an_email(self):
        adult = self._member("Adult", "Person", email="adult.person@example.test")
        created = self._post([adult.id])
        self.assertEqual(created.status_code, 200, created.data)
        adult.refresh_from_db()
        public, raw = self._open_invite(adult)
        opened = public.get("/api/auth/account-setup/", {"token": raw})
        self.assertFalse(opened.data["minor_account"])
        refused = public.post(
            "/api/auth/account-setup/",
            {
                "token": raw,
                "password": "Correct-horse-battery",
                "password_confirm": "Correct-horse-battery",
            },
            format="json",
        )
        self.assertEqual(refused.status_code, 400, refused.data)
        self.assertIn("email", refused.data)
        adult.user.refresh_from_db()
        self.assertEqual(adult.user.email, "adult.person@example.test")
        self.assertFalse(adult.user.check_password("Correct-horse-battery"))

    def _account_state(self, member_id):
        listed = self.client.get("/api/members/?page=1&page_size=50")
        self.assertEqual(listed.status_code, 200, listed.data)
        rows = listed.data["results"] if isinstance(listed.data, dict) else listed.data
        return next(row["account_state"] for row in rows if row["id"] == member_id)

    def _choose_password_from_the_reset_link(self, user):
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode

        from accounts.password_reset import ResetTokenGenerator

        saved = APIClient().post(
            "/api/auth/password-reset/confirm/",
            {
                "uid": urlsafe_base64_encode(force_bytes(user.pk)),
                "token": ResetTokenGenerator().make_token(user),
                "password": "Correct-horse-battery",
            },
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)

    def _sign_in(self, user):
        public = APIClient()
        signed = public.post(
            "/api/auth/login/",
            {"username": user.username, "password": "Correct-horse-battery"},
            format="json",
        )
        self.assertEqual(signed.status_code, 200, signed.data)
        return public

    def test_waiting_for_first_login_clears_after_sign_in_for_a_minor_and_an_adult(self):
        child = self._child()
        self._guardian(child, "parent@example.test")
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
        raw = parse_qs(urlparse(created.data["copy_link"]).query)["token"][0]
        self.assertEqual(self._account_state(child.id), "pending")
        self._choose_password_from_the_reset_link(child.user)
        self.assertEqual(self._account_state(child.id), "pending")
        public = self._sign_in(child.user)
        self.assertEqual(self._account_state(child.id), "active")
        closed = public.get("/api/auth/account-setup/", {"token": raw})
        self.assertEqual(closed.status_code, 400)
        self.assertEqual(closed.data["reason"], "used")

        adult = self._member("Adult", "Ready", email="adult.ready@example.test")
        adult_created = self._post([adult.id])
        self.assertEqual(adult_created.status_code, 200, adult_created.data)
        adult.refresh_from_db()
        adult_raw = parse_qs(urlparse(adult_created.data["copy_link"]).query)["token"][0]
        self.assertEqual(self._account_state(adult.id), "pending")
        self._choose_password_from_the_reset_link(adult.user)
        self.assertEqual(self._account_state(adult.id), "pending")
        self._sign_in(adult.user)
        self.assertEqual(self._account_state(adult.id), "active")
        adult_closed = APIClient().get("/api/auth/account-setup/", {"token": adult_raw})
        self.assertEqual(adult_closed.data["reason"], "used")

    def test_finishing_setup_clears_waiting_before_the_first_sign_in(self):
        child = self._child()
        self._guardian(child, "setup-parent@example.test")
        created = self.client.post(
            "/api/members/user-accounts/",
            {
                "action": "create",
                "member_ids": [child.id],
                "locale": "en",
                "guardian_emails": {str(child.id): "setup-parent@example.test"},
            },
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.data)
        child.refresh_from_db()
        raw = parse_qs(urlparse(created.data["copy_link"]).query)["token"][0]
        saved = APIClient().post(
            "/api/auth/account-setup/",
            {
                "token": raw,
                "password": "Correct-horse-battery",
                "password_confirm": "Correct-horse-battery",
            },
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        child.user.refresh_from_db()
        self.assertIsNone(child.user.last_login)
        self.assertEqual(self._account_state(child.id), "active")
