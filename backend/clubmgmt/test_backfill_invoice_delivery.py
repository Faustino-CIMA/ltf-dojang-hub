from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from accounts.models import User
from clubs.models import Club
from members.models import Member
from ops.models import OpsAuditLog

from .models import Family, MemberAddress, MemberEmail, MemberRecord


class BackfillInvoiceDeliveryTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="backfill-owner", password="pass12345", role=User.Roles.CLUB_ADMIN)
        self.club = Club.objects.create(name="Example Club", city="Luxembourg", created_by=self.owner)
        self.other = Club.objects.create(name="Other Club", city="Ettelbruck", created_by=self.owner)

    def _member(self, club, suffix, email=""):
        return Member.objects.create(
            club=club,
            first_name="Ada",
            last_name=f"ZZSECRETNAME{suffix}",
            sex=Member.Sex.FEMALE,
            email=email,
            ltf_licenseid=f"LTF-EX-{suffix}",
        )

    def _address(self, member, marked=False):
        return MemberAddress.objects.create(
            member=member,
            street="hidden-lane",
            house_number="87",
            postal_code="9190",
            locality="Vichten",
            country="LU",
            use_for_invoice=marked,
        )

    def _record(self, member, delivery="email"):
        return MemberRecord.objects.create(member=member, invoice_delivery=delivery)

    def test_dry_run_counts_both_criteria_and_prints_no_personal_data(self):
        only_post = self._member(self.club, "0001")
        self._record(only_post)
        self._address(only_post)
        family_post = self._member(self.club, "0002", email="secret-ada@example.test")
        self._record(family_post)
        self._address(family_post)
        Family.objects.create(club=self.club, name="EXAMPLE household", invoice_member=family_post, bill_to_delivery="post")
        elsewhere = self._member(self.other, "0003")
        self._record(elsewhere)
        self._address(elsewhere)

        out = StringIO()
        call_command("backfill_invoice_delivery", stdout=out)
        text = out.getvalue()
        self.assertIn(f"club {self.club.id}: 2", text)
        self.assertIn(f"club {self.other.id}: 1", text)
        self.assertIn("total: 3", text)
        self.assertIn("dry run", text)
        self.assertNotIn("ZZSECRETNAME", text)
        self.assertNotIn("hidden-lane", text)
        self.assertNotIn("secret-ada@example.test", text)
        self.assertNotIn("Vichten", text)
        self.assertFalse(OpsAuditLog.objects.filter(action="backfill_invoice_delivery").exists())
        only_post.club_record.refresh_from_db()
        self.assertEqual(only_post.club_record.invoice_delivery, "email")
        self.assertFalse(only_post.club_addresses.get().use_for_invoice)

    def test_apply_writes_both_criteria_once_and_can_limit_the_club(self):
        only_post = self._member(self.club, "0011")
        self._record(only_post)
        self._address(only_post)
        family_post = self._member(self.club, "0012", email="secret-ada@example.test")
        self._record(family_post)
        self._address(family_post)
        Family.objects.create(club=self.club, name="EXAMPLE household", invoice_member=family_post, bill_to_delivery="post")
        left_out = self._member(self.other, "0013")
        self._record(left_out)
        self._address(left_out)

        out = StringIO()
        call_command("backfill_invoice_delivery", f"--club={self.club.id}", "--apply", stdout=out)
        text = out.getvalue()
        self.assertIn(f"club {self.club.id}: 2", text)
        self.assertNotIn(f"club {self.other.id}:", text)
        self.assertIn("total: 2", text)
        self.assertIn("applied", text)
        self.assertNotIn("ZZSECRETNAME", text)
        self.assertNotIn("hidden-lane", text)
        only_post.club_record.refresh_from_db()
        family_post.club_record.refresh_from_db()
        self.assertEqual(only_post.club_record.invoice_delivery, "post")
        self.assertTrue(only_post.club_addresses.get().use_for_invoice)
        self.assertEqual(family_post.club_record.invoice_delivery, "post")
        self.assertTrue(family_post.club_addresses.get().use_for_invoice)
        left_out.club_record.refresh_from_db()
        self.assertEqual(left_out.club_record.invoice_delivery, "email")
        log = OpsAuditLog.objects.get(action="backfill_invoice_delivery")
        self.assertEqual(log.metadata["total"], 2)
        self.assertEqual(log.target_id, str(self.club.id))
        self.assertNotIn("ZZSECRETNAME", log.message)
        self.assertNotIn("hidden-lane", str(log.metadata))

        again = StringIO()
        call_command("backfill_invoice_delivery", "--apply", stdout=again)
        self.assertIn(f"club {self.other.id}: 1", again.getvalue())
        self.assertNotIn(f"club {self.club.id}:", again.getvalue())
        self.assertEqual(MemberRecord.objects.get(member=only_post).invoice_delivery, "post")
        self.assertEqual(MemberAddress.objects.filter(member=only_post, use_for_invoice=True).count(), 1)

    def test_invoice_email_two_addresses_and_an_already_marked_address_stay_put(self):
        emailed = self._member(self.club, "0021")
        self._record(emailed)
        self._address(emailed)
        MemberEmail.objects.create(member=emailed, email="secret-ada@example.test", use_for_invoice=True)
        several = self._member(self.club, "0022")
        self._record(several)
        self._address(several)
        MemberAddress.objects.create(
            member=several,
            street="other-lane",
            house_number="1",
            postal_code="1234",
            locality="Musterstadt",
            country="LU",
        )
        marked = self._member(self.club, "0023", email="secret-ada@example.test")
        self._record(marked, delivery="email")
        self._address(marked, marked=True)
        Family.objects.create(club=self.club, name="Marked household", invoice_member=marked, bill_to_delivery="post")

        out = StringIO()
        call_command("backfill_invoice_delivery", "--apply", stdout=out)
        self.assertIn("total: 0", out.getvalue())
        self.assertNotIn("secret-ada@example.test", out.getvalue())
        self.assertNotIn("other-lane", out.getvalue())
        emailed.club_record.refresh_from_db()
        several.club_record.refresh_from_db()
        marked.club_record.refresh_from_db()
        self.assertEqual(emailed.club_record.invoice_delivery, "email")
        self.assertFalse(emailed.club_addresses.get().use_for_invoice)
        self.assertEqual(several.club_record.invoice_delivery, "email")
        self.assertFalse(several.club_addresses.filter(use_for_invoice=True).exists())
        self.assertEqual(marked.club_record.invoice_delivery, "email")
        self.assertEqual(marked.club_addresses.get().use_for_invoice, True)

    def test_a_missing_club_is_refused(self):
        with self.assertRaises(CommandError):
            call_command("backfill_invoice_delivery", "--club=999999")
