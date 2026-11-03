"""A view-only desk must load the same reads as a full desk, and still refuse writes."""

from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from clubs.models import Club
from members.models import Member

from .models import DeskGrant, StaffMfaGrace, User


def _open_grace(user):
    StaffMfaGrace.objects.update_or_create(
        user=user,
        defaults={
            "grace_until": timezone.localdate() + timedelta(days=30),
            "no_grace": False,
            "extended": False,
        },
    )


def _read_only(user, desk, club=None):
    today = timezone.localdate()
    DeskGrant.objects.create(
        user=user,
        desk=desk,
        club=club,
        level=DeskGrant.Level.READ_ONLY,
        source=DeskGrant.Source.LEGACY,
        valid_from=today - timedelta(days=1),
        valid_until=today + timedelta(days=30),
        reason="Look",
    )


class ReadOnlyDeskPageTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="ro-admin",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
            email="ro-admin@example.com",
        )
        self.finance = User.objects.create_user(
            username="ro-finance",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
            email="ro-finance@example.com",
        )
        self.club_user = User.objects.create_user(
            username="ro-club",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
            email="ro-club@example.com",
        )
        self.club = Club.objects.create(name="Read Only Club", created_by=self.admin)
        self.club.admins.add(self.club_user)
        Member.objects.create(club=self.club, first_name="Ada", last_name="Reader")
        for user in (self.admin, self.finance, self.club_user):
            _open_grace(user)
        _read_only(self.finance, DeskGrant.Desk.LTF_ADMIN)
        _read_only(self.club_user, DeskGrant.Desk.LTF_FINANCE)
        _read_only(self.finance, DeskGrant.Desk.CLUB_ADMIN, self.club)

    def _same_reads(self, full_user, viewer, header, paths):
        for path in paths:
            self.client.force_authenticate(user=full_user)
            full = self.client.get(path, HTTP_X_DESK=header)
            self.client.force_authenticate(user=viewer)
            viewed = self.client.get(path, HTTP_X_DESK=header)
            if full.status_code < 400:
                detail = getattr(viewed, "data", viewed.content)
                self.assertLess(
                    viewed.status_code,
                    400,
                    f"{path} full={full.status_code} view={viewed.status_code} {detail}",
                )
                text = str(detail)
                self.assertNotIn("Not allowed", text, path)

    def test_read_only_ltf_admin_loads_every_list(self):
        self._same_reads(
            self.admin,
            self.finance,
            "ltf_admin",
            [
                "/api/dashboard/overview/ltf-admin/",
                "/api/clubs/",
                "/api/clubs/admin_assignment/",
                "/api/member-transfers/?fee_only=true",
                "/api/member-transfers/movements/",
                "/api/members/",
                "/api/parked-members/",
                "/api/licenses/",
                "/api/license-types/",
                "/api/card-formats/",
                "/api/card-templates/",
                "/api/paper-profiles/",
                "/api/printer-profiles/",
                "/api/print-jobs/",
                "/api/federation-profile/",
                "/api/modules/",
                "/api/national-team/seasons/",
                "/api/national-team/squads/",
                "/api/national-team/levels/",
                "/api/national-team/settings/",
                "/api/national-team/selections/",
                "/api/national-team/staff/",
                "/api/events/?scope=federation",
                "/api/club-management/committees/",
            ],
        )
        self.client.force_authenticate(user=self.finance)
        refused = self.client.post(
            "/api/member-transfers/",
            {"member_id": 1, "to_club_id": self.club.id},
            format="json",
            HTTP_X_DESK="ltf_admin",
        )
        self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(refused.data["detail"], "desk_read_only")
        preview = self.client.post(
            "/api/imports/members/preview/",
            {"club_id": self.club.id},
            format="multipart",
            HTTP_X_DESK="ltf_admin",
        )
        confirm = self.client.post(
            "/api/imports/members/confirm/",
            {"club_id": self.club.id},
            format="json",
            HTTP_X_DESK="ltf_admin",
        )
        self.assertEqual(preview.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(preview.data["detail"], "desk_read_only")
        self.assertEqual(confirm.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(confirm.data["detail"], "desk_read_only")

    def test_read_only_finance_loads_every_list(self):
        year = timezone.localdate().year
        self._same_reads(
            self.finance,
            self.club_user,
            "ltf_finance",
            [
                "/api/dashboard/overview/ltf-finance/",
                "/api/orders/",
                "/api/invoices/",
                "/api/payments/",
                "/api/expenses/",
                "/api/incomes/",
                "/api/expense-categories/",
                "/api/income-categories/",
                "/api/bank-statements/",
                f"/api/finance-reports/?year={year}",
                "/api/finance-audit-logs/",
                "/api/license-prices/",
                "/api/license-types/",
                "/api/club-fee-types/",
                "/api/module-bundles/",
                f"/api/finance-budgets/?year={year}",
                "/api/national-team/seasons/",
                "/api/clubs/",
            ],
        )
        self.client.force_authenticate(user=self.club_user)
        refused = self.client.post(
            "/api/expenses/",
            {"amount": "1.00"},
            format="json",
            HTTP_X_DESK="ltf_finance",
        )
        self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(refused.data["detail"], "desk_read_only")

    def test_read_only_club_desk_loads_every_list(self):
        header = f"club_admin:{self.club.id}"
        club = self.club.id
        self._same_reads(
            self.club_user,
            self.finance,
            header,
            [
                f"/api/members/?club={club}",
                f"/api/licenses/?club_id={club}",
                f"/api/clubs/{club}/",
                f"/api/clubs/{club}/admins/",
                f"/api/clubs/{club}/module-fees/",
                f"/api/orders/?club_id={club}",
                f"/api/invoices/?club_id={club}",
                f"/api/payments/?club_id={club}",
                f"/api/events/?club={club}",
                f"/api/club-management/committees/?club={club}",
                f"/api/club-management/families/?club={club}",
                f"/api/club-management/teams/?club={club}",
                f"/api/club-management/training/series/?club={club}",
                f"/api/club-management/shop/overview/?club={club}",
                f"/api/club-management/billing/?club={club}",
                f"/api/club-management/membership-fees/?club={club}",
            ],
        )
        self.client.force_authenticate(user=self.finance)
        refused = self.client.post(
            "/api/members/",
            {"first_name": "No", "last_name": "Write", "club": club},
            format="json",
            HTTP_X_DESK=header,
        )
        self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(refused.data["detail"], "desk_read_only")
        preview = self.client.post(
            "/api/imports/members/preview/",
            {"club_id": club},
            format="multipart",
            HTTP_X_DESK=header,
        )
        self.assertEqual(preview.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(preview.data["detail"], "desk_read_only")

    def test_no_grant_or_another_clubs_grant_does_not_open_the_desk(self):
        today = timezone.localdate()
        outsider = User.objects.create_user(
            username="ro-outsider",
            password="pass12345",
            role=User.Roles.MEMBER,
            email="ro-outsider@example.com",
        )
        DeskGrant.objects.filter(user=outsider).update(valid_until=today)
        other = Club.objects.create(name="Other Club", created_by=self.admin)
        Member.objects.create(club=other, first_name="Hidden", last_name="Person")
        self.client.force_authenticate(user=outsider)
        for path, header in (
            ("/api/member-transfers/movements/", "ltf_admin"),
            ("/api/members/", "ltf_admin"),
            ("/api/licenses/", "ltf_admin"),
            ("/api/dashboard/overview/ltf-admin/", "ltf_admin"),
            ("/api/dashboard/overview/ltf-finance/", "ltf_finance"),
            ("/api/national-team/seasons/", "ltf_admin"),
            (f"/api/members/?club={self.club.id}", f"club_admin:{self.club.id}"),
            (f"/api/clubs/{self.club.id}/admins/", f"club_admin:{self.club.id}"),
        ):
            refused = self.client.get(path, HTTP_X_DESK=header)
            self.assertEqual(refused.status_code, status.HTTP_403_FORBIDDEN, path)
            self.assertEqual(refused.data["detail"], "desk_not_granted", path)

        self.client.force_authenticate(user=self.club_user)
        wrong_desk = self.client.get(f"/api/clubs/{other.id}/", HTTP_X_DESK=f"club_admin:{other.id}")
        self.assertEqual(wrong_desk.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(wrong_desk.data["detail"], "desk_not_granted")
        own_desk = self.client.get(
            f"/api/members/?club={other.id}",
            HTTP_X_DESK=f"club_admin:{self.club.id}",
        )
        self.assertNotContains(own_desk, "Hidden", status_code=own_desk.status_code)
        other_admins = self.client.get(
            f"/api/clubs/{other.id}/admins/",
            HTTP_X_DESK=f"club_admin:{self.club.id}",
        )
        self.assertNotEqual(other_admins.status_code, status.HTTP_200_OK)
