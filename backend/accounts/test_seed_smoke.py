from django.core.management import call_command
from django.test import TestCase

from members.models import Member, MemberVerification


class SeedSmokeTests(TestCase):
    def test_the_fixture_has_three_card_states_and_can_be_seeded_again(self):
        call_command("seed_smoke")
        call_command("seed_smoke")
        open_member = Member.objects.get(ltf_licenseid="LTF-EX-0001")
        missing = Member.objects.get(ltf_licenseid="LTF-EX-0002")
        verified = Member.objects.get(ltf_licenseid="LTF-EX-0003")
        self.assertTrue(open_member.club_record.social_security_number)
        from django.core.exceptions import ObjectDoesNotExist

        try:
            stored = missing.club_record.social_security_number
        except ObjectDoesNotExist:
            stored = ""
        self.assertFalse(stored)
        self.assertEqual(verified.verification.status, MemberVerification.Status.VERIFIED)
        self.assertEqual(verified.verification.verified_at.date().isoformat(), "2026-11-29")
        self.assertEqual(open_member.club.name, "Example Club")
        self.assertFalse(Member.objects.filter(last_name="SECRET").exists())
