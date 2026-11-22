import json
from datetime import date

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import StaffMfaGrace, User
from clubmgmt.models import MemberRecord
from clubs.models import Club

from .models import Member, MemberVerificationEvent
from .ssn_countries import (
    SsnError,
    belgian_check,
    compact_ssn,
    french_key,
    german_check_digit,
    luxembourg_check_digits,
    validate_ssn,
)
from .verification import CardText, compare_member, names_match


def _lu(first_eleven: str) -> str:
    return first_eleven + luxembourg_check_digits(first_eleven)


def _de(first_eleven: str) -> str:
    return first_eleven + german_check_digit(first_eleven)


def _fr(body: str) -> str:
    return body + french_key(body)


def _be(first_nine: str, *, born_2000_or_later: bool) -> str:
    return first_nine + belgian_check(first_nine, born_2000_or_later=born_2000_or_later)


class SsnCountryTests(SimpleTestCase):
    def test_luxembourg_luhn_and_verhoeff_match_the_ccss_example(self):
        self.assertEqual(_lu("18931201057"), "1893120105732")
        self.assertEqual(compact_ssn("LU", "1893 1201 057 32"), "1893120105732")

    def test_luxembourg_rejects_a_bad_check_digit(self):
        with self.assertRaises(SsnError) as caught:
            validate_ssn("LU", "1893120105733")
        self.assertEqual(caught.exception.ssn_code, "checksum")

    def test_german_pension_number_uses_the_stated_weights(self):
        self.assertEqual(german_check_digit("65170839J08"), "1")
        self.assertEqual(compact_ssn("DE", "65 170839 J 081"), "65170839J081")
        with self.assertRaises(SsnError) as caught:
            validate_ssn("DE", "65170839J088")
        self.assertEqual(caught.exception.ssn_code, "checksum")

    def test_german_health_insurance_number_is_rejected(self):
        with self.assertRaises(SsnError) as caught:
            validate_ssn("DE", "A123456789")
        self.assertEqual(caught.exception.ssn_code, "health_card")

    def test_french_nir_key_matches_the_insee_example(self):
        self.assertEqual(_fr("1510246102043"), "151024610204325")

    def test_french_corsica_replaces_the_department_letter(self):
        number = _fr("192052A123001")
        self.assertEqual(compact_ssn("FR", number), number)
        with self.assertRaises(SsnError):
            validate_ssn("FR", number[:-1] + ("0" if number[-1] != "0" else "1"))

    def test_belgian_check_before_and_after_2000(self):
        self.assertEqual(_be("420122051", born_2000_or_later=False), "42012205181")
        post = _be("050101001", born_2000_or_later=True)
        self.assertEqual(compact_ssn("BE", post), post)
        with self.assertRaises(SsnError) as caught:
            validate_ssn("BE", "42012205180")
        self.assertEqual(caught.exception.ssn_code, "checksum")

    def test_unknown_country_is_rejected(self):
        with self.assertRaises(SsnError) as caught:
            validate_ssn("US", "1893120105732")
        self.assertEqual(caught.exception.ssn_code, "country")


class NameMatchTests(SimpleTestCase):
    def test_entered_names_are_a_subset_of_the_card(self):
        self.assertTrue(names_match("Ana", "Ana Maria"))
        self.assertTrue(names_match("Silva", "da Silva"))
        self.assertTrue(names_match("Maria Ana", "Ana Maria"))
        self.assertFalse(names_match("da Silva", "Silva"))
        self.assertFalse(names_match("", "Ana"))

    def test_hyphen_apostrophe_and_accents_fold_away(self):
        self.assertTrue(names_match("Jean-Pierre", "Jean Pierre"))
        self.assertTrue(names_match("Müller", "Muller"))
        self.assertTrue(names_match("O'Brien", "Obrien"))

    def test_one_character_only_on_tokens_of_five_letters(self):
        self.assertTrue(names_match("Silva", "Silve"))
        self.assertFalse(names_match("Anna", "Anma"))
        self.assertFalse(names_match("Ana", "Ann"))


def _open_grace(*users):
    from accounts.mfa import get_policy

    policy = get_policy()
    if policy is not None:
        policy.shipped_on = timezone.localdate()
        policy.grace_days = 14
        policy.save(update_fields=["shipped_on", "grace_days"])
    StaffMfaGrace.objects.filter(user_id__in=[user.id for user in users]).delete()


class VerificationApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.ltf_admin = User.objects.create_user(
            username="verify-ltf",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.club_admin = User.objects.create_user(
            username="verify-club",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.other_admin = User.objects.create_user(
            username="verify-other",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )
        self.coach = User.objects.create_user(
            username="verify-coach",
            password="pass12345",
            role=User.Roles.COACH,
        )
        self.finance = User.objects.create_user(
            username="verify-finance",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
        )
        self.member_user = User.objects.create_user(
            username="verify-member",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
        _open_grace(
            self.ltf_admin,
            self.club_admin,
            self.other_admin,
            self.coach,
            self.finance,
        )
        self.club = Club.objects.create(
            name="Verify Club",
            city="Luxembourg",
            address="1 Test Road",
            created_by=self.ltf_admin,
        )
        self.other_club = Club.objects.create(
            name="Other Club",
            city="Esch",
            address="2 Test Road",
            created_by=self.ltf_admin,
        )
        self.club.admins.add(self.club_admin)
        self.club.trainers.add(self.coach)
        self.other_club.admins.add(self.other_admin)
        self.number = _lu("19711002130")
        self.member = Member.objects.create(
            user=self.member_user,
            club=self.club,
            first_name="Ana",
            last_name="Silva",
            sex=Member.Sex.FEMALE,
            date_of_birth=date(1971, 10, 2),
        )
        MemberRecord.objects.create(
            member=self.member,
            social_security_number=self.number,
            social_security_country="LU",
        )

    def _card(self, **overrides):
        payload = {
            "first_names": "Ana Maria",
            "last_names": "da Silva",
            "number": self.number,
            "date_of_birth": "1971-10-02",
        }
        payload.update(overrides)
        return payload

    def test_match_waits_for_name_confirmation_then_locks(self):
        self.client.force_authenticate(user=self.club_admin)
        pending = self.client.post(
            f"/api/members/{self.member.id}/verification/compare/",
            self._card(),
            format="json",
        )
        self.assertEqual(pending.status_code, 200)
        self.assertTrue(pending.data["needs_confirmation"])
        self.assertFalse(pending.data["verified"])
        self.assertNotIn(self.number, json.dumps(pending.data))
        self.member.refresh_from_db()
        self.assertEqual(self.member.first_name, "Ana")
        self.assertFalse(hasattr(self.member, "verification") and self.member.verification.status == "verified")

        skipped = self.client.post(
            f"/api/members/{self.member.id}/verification/compare/",
            self._card(confirm_names=False),
            format="json",
        )
        self.assertEqual(skipped.status_code, 200)
        self.assertTrue(skipped.data["verified"])
        self.assertEqual(
            skipped.data["locked_fields"],
            ["first_name", "last_name", "date_of_birth", "sex", "social_security_number"],
        )
        self.member.refresh_from_db()
        self.assertEqual(self.member.first_name, "Ana")
        self.assertEqual(self.member.last_name, "SILVA")

    def test_confirming_names_stores_the_card_and_can_keep_a_usual_name(self):
        self.client.force_authenticate(user=self.club_admin)
        saved = self.client.post(
            f"/api/members/{self.member.id}/verification/compare/",
            self._card(confirm_names=True, keep_usual_name=True),
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        self.member.refresh_from_db()
        self.assertEqual(self.member.first_name, "Ana Maria")
        self.assertEqual(self.member.last_name, "DA SILVA")
        self.assertEqual(self.member.usual_name, "Ana SILVA")
        event = MemberVerificationEvent.objects.get(member=self.member)
        dumped = json.dumps(
            {
                "reason": event.reason,
                "fields": event.fields,
                "old_first_name": event.old_first_name,
                "new_first_name": event.new_first_name,
                "old_last_name": event.old_last_name,
                "new_last_name": event.new_last_name,
            }
        )
        self.assertNotIn(self.number, dumped)
        self.assertFalse(event.ssn_changed)
        self.assertEqual(event.old_first_name, "Ana")
        self.assertEqual(event.new_last_name, "DA SILVA")
        shown = self.client.get(f"/api/members/{self.member.id}/")
        self.assertTrue(shown.data["card_verified"])
        self.assertEqual(shown.data["social_security_number"], "•" * 13)
        self.assertNotIn(self.number, json.dumps(shown.data))
        listing = self.client.get("/api/members/")
        self.assertNotIn(self.number, json.dumps(listing.data))
        self.assertFalse(any(field.name == "social_security_number" for field in event._meta.fields))

    def test_mismatch_does_not_lock_and_names_the_field(self):
        self.client.force_authenticate(user=self.club_admin)
        wrong = self.client.post(
            f"/api/members/{self.member.id}/verification/compare/",
            self._card(number=_lu("19711002131"), confirm_names=True),
            format="json",
        )
        self.assertEqual(wrong.status_code, 200)
        self.assertFalse(wrong.data["match"])
        self.assertEqual(wrong.data["fields"], ["number"])
        self.assertNotIn(self.number, json.dumps(wrong.data))
        self.assertFalse(MemberVerificationEvent.objects.filter(member=self.member).exists())

        names = self.client.post(
            f"/api/members/{self.member.id}/verification/compare/",
            self._card(last_names="Costa"),
            format="json",
        )
        self.assertEqual(names.data["fields"], ["last_name"])
        self.assertFalse(MemberVerificationEvent.objects.filter(member=self.member).exists())

    def test_absent_sex_on_a_luxembourg_card_is_skipped(self):
        self.client.force_authenticate(user=self.club_admin)
        response = self.client.post(
            f"/api/members/{self.member.id}/verification/compare/",
            self._card(),
            format="json",
        )
        self.assertTrue(response.data["match"])
        self.assertNotIn("sex", response.data.get("fields", []))

    def test_locked_fields_refuse_edits_until_unlock(self):
        self.client.force_authenticate(user=self.club_admin)
        self.client.post(
            f"/api/members/{self.member.id}/verification/compare/",
            self._card(confirm_names=False),
            format="json",
        )
        renamed = self.client.patch(
            f"/api/members/{self.member.id}/",
            {"first_name": "Anne"},
            format="json",
        )
        self.assertEqual(renamed.status_code, 400)
        self.assertIn("first_name", renamed.data)
        usual = self.client.patch(
            f"/api/members/{self.member.id}/",
            {"usual_name": "Annie"},
            format="json",
        )
        self.assertEqual(usual.status_code, 200, usual.data)
        self.member.refresh_from_db()
        self.assertEqual(self.member.usual_name, "Annie")
        from clubmgmt.serializers import MemberRecordSerializer

        locked_number = MemberRecordSerializer(
            self.member.club_record,
            data={
                "social_security_number": _lu("19711002131"),
                "social_security_country": "LU",
            },
            partial=True,
        )
        self.assertFalse(locked_number.is_valid())
        self.assertIn("social_security_number", locked_number.errors)
        again = self.client.post(
            f"/api/members/{self.member.id}/verification/compare/",
            self._card(),
            format="json",
        )
        self.assertEqual(again.status_code, 409)
        missing_reason = self.client.post(
            f"/api/members/{self.member.id}/verification/unlock/",
            {},
            format="json",
        )
        self.assertEqual(missing_reason.status_code, 400)
        opened = self.client.post(
            f"/api/members/{self.member.id}/verification/unlock/",
            {"reason": "Card was read against the wrong member."},
            format="json",
        )
        self.assertEqual(opened.status_code, 200)
        self.assertEqual(opened.data["status"], "unverified")
        self.assertEqual(opened.data["locked_fields"], [])
        unlock = MemberVerificationEvent.objects.get(member=self.member, action="unlock")
        self.assertEqual(unlock.reason, "Card was read against the wrong member.")
        self.assertNotIn(self.number, unlock.reason)
        self.assertFalse(unlock.ssn_changed)
        renamed = self.client.patch(
            f"/api/members/{self.member.id}/",
            {"first_name": "Anne"},
            format="json",
        )
        self.assertEqual(renamed.status_code, 200, renamed.data)

    def test_events_list_has_no_social_security_number(self):
        self.client.force_authenticate(user=self.club_admin)
        self.client.post(
            f"/api/members/{self.member.id}/verification/compare/",
            self._card(confirm_names=False),
            format="json",
        )
        events = self.client.get(f"/api/members/{self.member.id}/verification/events/")
        self.assertEqual(events.status_code, 200)
        self.assertEqual(events.data["results"][0]["action"], "verify")
        self.assertNotIn(self.number, json.dumps(events.data, default=str))
        self.assertFalse(events.data["results"][0]["ssn_changed"])

    def test_photo_is_refused(self):
        self.client.force_authenticate(user=self.club_admin)
        response = self.client.post(
            f"/api/members/{self.member.id}/verification/compare/",
            self._card(image="not-a-real-photo"),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("photo", response.data["detail"].lower())
        self.assertFalse(MemberVerificationEvent.objects.filter(member=self.member).exists())

    def test_coach_finance_member_and_other_club_cannot_verify(self):
        url = f"/api/members/{self.member.id}/verification/compare/"
        for user, expected in (
            (self.coach, 403),
            (self.finance, 403),
            (self.member_user, 403),
            (self.other_admin, 404),
        ):
            self.client.force_authenticate(user=user)
            response = self.client.post(url, self._card(confirm_names=False), format="json")
            self.assertEqual(response.status_code, expected, user.username)
        self.assertFalse(MemberVerificationEvent.objects.filter(member=self.member).exists())

    def test_ltf_admin_can_read_verification(self):
        self.client.force_authenticate(user=self.ltf_admin)
        response = self.client.get(f"/api/members/{self.member.id}/verification/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "unverified")
        self.assertTrue(response.data["has_number"])
        self.assertEqual(response.data["country"], "LU")
        self.assertNotIn(self.number, json.dumps(response.data))
        shown = self.client.get(f"/api/members/{self.member.id}/")
        self.assertEqual(shown.status_code, 200)
        self.assertFalse(shown.data["card_verified"])
        self.assertEqual(shown.data["social_security_number"], "•" * 13)
        self.assertFalse(any(character.isdigit() for character in shown.data["social_security_number"]))
        listing = self.client.get("/api/members/")
        self.assertNotIn(self.number, json.dumps(listing.data))

    def test_too_many_compares_are_limited(self):
        self.client.force_authenticate(user=self.club_admin)
        cache.set(f"member-verify:{self.club_admin.id}:{self.member.id}", 30, timeout=60)
        response = self.client.post(
            f"/api/members/{self.member.id}/verification/compare/",
            self._card(),
            format="json",
        )
        self.assertEqual(response.status_code, 429)

    def test_member_without_a_number_cannot_be_verified(self):
        bare = Member.objects.create(
            club=self.club,
            first_name="No",
            last_name="Number",
            sex=Member.Sex.MALE,
            date_of_birth=date(1980, 1, 1),
        )
        self.client.force_authenticate(user=self.club_admin)
        response = self.client.post(
            f"/api/members/{bare.id}/verification/compare/",
            {"first_names": "No", "last_names": "Number", "number": self.number},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("no social security number", response.data["detail"].lower())


class DesktopCodeTests(TestCase):
    def setUp(self):
        VerificationApiTests.setUp(self)

    def _card(self, **overrides):
        return VerificationApiTests._card(self, **overrides)
    def test_code_is_hashed_single_use_and_hides_the_member(self):
        from members.models import VerificationChallenge

        self.client.force_authenticate(user=self.club_admin)
        created = self.client.post(
            f"/api/members/{self.member.id}/verification-challenges/",
            {},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        token = created.data["token"]
        self.assertGreaterEqual(len(token), 32)
        row = VerificationChallenge.objects.get(member=self.member)
        self.assertNotIn(token, row.token_hash)
        self.assertEqual(len(row.token_hash), 64)
        state = self.client.get(f"/api/members/{self.member.id}/verification/")
        self.assertTrue(state.data["challenge_open"])
        self.assertNotIn(token, json.dumps(state.data, default=str))
        self.client.logout()
        looked = self.client.get(f"/api/verification-challenges/{token}/")
        self.assertEqual(looked.status_code, 200, looked.data)
        self.assertEqual(looked.data["country"], "LU")
        self.assertTrue(looked.data["has_number"])
        shown = json.dumps(looked.data, default=str)
        self.assertNotIn(self.member.first_name, shown)
        self.assertNotIn(self.number, shown)
        self.assertNotIn(f'"member": {self.member.id}', shown)
        self.assertNotIn(f'"id": {self.member.id}', shown)
        preview = self.client.post(
            f"/api/verification-challenges/{token}/",
            self._card(),
            format="json",
        )
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertTrue(preview.data["needs_confirmation"])
        row.refresh_from_db()
        self.assertIsNone(row.used_at)
        locked = self.client.post(
            f"/api/verification-challenges/{token}/",
            self._card(confirm_names=False),
            format="json",
        )
        self.assertEqual(locked.status_code, 200, locked.data)
        self.assertTrue(locked.data["verified"])
        self.assertNotIn(self.number, json.dumps(locked.data, default=str))
        used = self.client.post(
            f"/api/verification-challenges/{token}/",
            self._card(),
            format="json",
        )
        self.assertEqual(used.status_code, 410)
        self.assertEqual(used.data["detail"], "used")

    def test_starting_again_cancels_the_previous_code(self):
        self.client.force_authenticate(user=self.club_admin)
        first = self.client.post(f"/api/members/{self.member.id}/verification-challenges/", {}, format="json")
        second = self.client.post(f"/api/members/{self.member.id}/verification-challenges/", {}, format="json")
        self.client.logout()
        old = self.client.post(
            f"/api/verification-challenges/{first.data['token']}/",
            self._card(),
            format="json",
        )
        self.assertEqual(old.status_code, 410)
        self.assertEqual(old.data["detail"], "cancelled")
        current = self.client.get(f"/api/verification-challenges/{second.data['token']}/")
        self.assertEqual(current.status_code, 200)

    def test_closing_cancels_only_that_code(self):
        self.client.force_authenticate(user=self.club_admin)
        first = self.client.post(f"/api/members/{self.member.id}/verification-challenges/", {}, format="json")
        self.client.post(
            f"/api/members/{self.member.id}/verification-challenges/cancel/",
            {"token": first.data["token"]},
            format="json",
        )
        self.client.logout()
        cancelled = self.client.get(f"/api/verification-challenges/{first.data['token']}/")
        self.assertEqual(cancelled.status_code, 410)
        self.assertEqual(cancelled.data["detail"], "cancelled")

    def test_a_photo_and_a_guess_are_refused(self):
        self.client.force_authenticate(user=self.club_admin)
        created = self.client.post(f"/api/members/{self.member.id}/verification-challenges/", {}, format="json")
        token = created.data["token"]
        self.client.logout()
        photo = self.client.post(
            f"/api/verification-challenges/{token}/",
            self._card(image="not-a-real-photo"),
            format="json",
        )
        self.assertEqual(photo.status_code, 400)
        from members.models import VerificationChallenge

        self.assertIsNone(VerificationChallenge.objects.get(member=self.member).used_at)
        for _ in range(30):
            guess = self.client.get("/api/verification-challenges/not-a-real-code-0000000000/")
            self.assertEqual(guess.status_code, 404)
        blocked = self.client.get("/api/verification-challenges/not-a-real-code-0000000000/")
        self.assertEqual(blocked.status_code, 429)

    def test_coach_cannot_make_a_code(self):
        self.client.force_authenticate(user=self.coach)
        response = self.client.post(f"/api/members/{self.member.id}/verification-challenges/", {}, format="json")
        self.assertEqual(response.status_code, 403)


class CompareRuleTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="rules-admin",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.club = Club.objects.create(
            name="Rules Club",
            city="Luxembourg",
            address="3 Test Road",
            created_by=self.admin,
        )

    def _member(self, *, country, number, sex, born, first="Ana", last="Silva"):
        member = Member.objects.create(
            club=self.club,
            first_name=first,
            last_name=last,
            sex=sex,
            date_of_birth=born,
        )
        MemberRecord.objects.create(
            member=member,
            social_security_number=number,
            social_security_country=country,
        )
        return member

    def _text(self, member, number, **overrides):
        payload = {
            "first_names": member.first_name,
            "last_names": member.last_name,
            "number": number,
            "date_of_birth": member.date_of_birth,
            "sex": member.sex,
            "confirm_names": None,
            "keep_usual_name": False,
        }
        payload.update(overrides)
        return CardText(**payload)

    def test_german_health_card_is_not_a_match(self):
        number = _de("65170839J08")
        member = self._member(
            country="DE",
            number=number,
            sex="M",
            born=date(1939, 8, 17),
        )
        result = compare_member(member, self._text(member, "A123456789", sex=""))
        self.assertFalse(result.match)
        self.assertEqual(result.reason, "health_card")

    def test_german_serial_50_does_not_force_a_sex(self):
        number = _de("65170839J50")
        member = self._member(country="DE", number=number, sex="F", born=date(1939, 8, 17))
        result = compare_member(member, self._text(member, number, sex=""))
        self.assertTrue(result.match, result.fields)

    def test_german_male_serial_must_agree(self):
        number = _de("65170839J08")
        member = self._member(country="DE", number=number, sex="F", born=date(1939, 8, 17))
        result = compare_member(member, self._text(member, number, sex=""))
        self.assertEqual(result.fields, ("sex",))

    def test_french_year_and_month_are_checked_and_the_day_is_not_in_the_number(self):
        number = _fr("2711085123456")
        # 2 = female, 71 = year, 10 = month. Key is appended by _fr.
        member = self._member(country="FR", number=number, sex="F", born=date(1971, 10, 2))
        result = compare_member(member, self._text(member, number, date_of_birth=None, sex=""))
        self.assertTrue(result.match, result.fields)
        wrong_month = _fr("2711185123456")
        MemberRecord.objects.filter(member=member).update(social_security_number=wrong_month)
        member.club_record.refresh_from_db()
        result = compare_member(member, self._text(member, wrong_month, sex=""))
        self.assertIn("date_of_birth", result.fields)

    def test_belgian_post_2000_rule_follows_the_recorded_year(self):
        number = _be("050101123", born_2000_or_later=True)
        member = self._member(country="BE", number=number, sex="M", born=date(2005, 1, 1))
        result = compare_member(member, self._text(member, number, sex=""))
        self.assertTrue(result.match, result.fields)
        pre = _be("050101123", born_2000_or_later=False)
        result = compare_member(member, self._text(member, pre, sex=""))
        self.assertEqual(result.fields, ("number",))

    def test_one_short_name_token_has_no_tolerance(self):
        member = self._member(
            country="LU",
            number=_lu("19711002130"),
            sex="F",
            born=date(1971, 10, 2),
            first="Anna",
            last="Lee",
        )
        result = compare_member(
            member,
            self._text(member, member.club_record.social_security_number, first_names="Anma"),
        )
        self.assertEqual(result.fields, ("first_name",))
