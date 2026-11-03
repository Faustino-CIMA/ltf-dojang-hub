from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .models import ModuleBundle, ModuleBundlePrice, ModuleSubscriptionSettings

User = get_user_model()


class ModuleBundleCatalogTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.finance = User.objects.create_user(
            username="bundle-finance",
            password="pass12345",
            role=User.Roles.LTF_FINANCE,
        )
        self.admin = User.objects.create_user(
            username="bundle-admin",
            password="pass12345",
            role=User.Roles.LTF_ADMIN,
        )
        self.club_admin = User.objects.create_user(
            username="bundle-club",
            password="pass12345",
            role=User.Roles.CLUB_ADMIN,
        )

    def test_finance_creates_a_bundle_with_two_modules_and_a_flat_price(self):
        self.client.force_authenticate(user=self.finance)
        response = self.client.post(
            "/api/module-bundles/",
            {
                "name": "Competition pack",
                "description": "Club desk and teams",
                "modules": ["club_management", "competition"],
                "initial_amount": "120.00",
                "initial_currency": "EUR",
                "initial_effective_from": "2026-03-01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.data["name"], "Competition pack")
        self.assertEqual(response.data["code"], "competition-pack")
        self.assertEqual(response.data["module_ids"], ["club_management", "competition"])
        self.assertEqual(response.data["current_amount"], "120.00")
        self.assertEqual(response.data["current_effective_from"], "2026-03-01")
        self.assertFalse(response.data["has_invoices"])
        self.assertEqual(ModuleBundlePrice.objects.count(), 1)

    def test_a_bundle_needs_two_billable_modules_and_a_name(self):
        self.client.force_authenticate(user=self.finance)
        one = self.client.post(
            "/api/module-bundles/",
            {"name": "Thin", "modules": ["club_management"], "initial_amount": "10.00"},
            format="json",
        )
        self.assertEqual(one.status_code, status.HTTP_400_BAD_REQUEST)
        preview = self.client.post(
            "/api/module-bundles/",
            {
                "name": "Preview pack",
                "modules": ["preview", "club_management"],
                "initial_amount": "10.00",
            },
            format="json",
        )
        self.assertEqual(preview.status_code, status.HTTP_400_BAD_REQUEST)
        blank = self.client.post(
            "/api/module-bundles/",
            {
                "name": "   ",
                "modules": ["club_management", "competition"],
                "initial_amount": "10.00",
            },
            format="json",
        )
        self.assertEqual(blank.status_code, status.HTTP_400_BAD_REQUEST)
        negative = self.client.post(
            "/api/module-bundles/",
            {
                "name": "Negative",
                "modules": ["club_management", "competition"],
                "initial_amount": "-1.00",
            },
            format="json",
        )
        self.assertEqual(negative.status_code, status.HTTP_400_BAD_REQUEST)
        other_currency = self.client.post(
            "/api/module-bundles/",
            {
                "name": "Dollars",
                "modules": ["club_management", "competition"],
                "initial_amount": "10.00",
                "initial_currency": "USD",
            },
            format="json",
        )
        self.assertEqual(other_currency.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(ModuleBundle.objects.exists())

    def test_finance_can_rename_and_add_a_later_price_without_changing_the_code(self):
        self.client.force_authenticate(user=self.finance)
        created = self.client.post(
            "/api/module-bundles/",
            {
                "name": "Competition pack",
                "modules": ["club_management", "competition"],
                "initial_amount": "120.00",
            },
            format="json",
        )
        bundle_id = created.data["id"]
        response = self.client.patch(
            f"/api/module-bundles/{bundle_id}/",
            {
                "name": "Full club pack",
                "modules": ["event_calendar", "club_management", "competition"],
                "initial_amount": "150.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data["name"], "Full club pack")
        self.assertEqual(response.data["code"], "competition-pack")
        self.assertEqual(
            response.data["module_ids"],
            ["club_management", "competition", "event_calendar"],
        )
        self.assertEqual(response.data["current_amount"], "150.00")
        bundle = ModuleBundle.objects.get(id=bundle_id)
        self.assertEqual(bundle.prices.count(), 2)
        self.assertEqual(
            ModuleBundlePrice.get_active_price(bundle=bundle).amount,
            Decimal("150.00"),
        )

    def test_ltf_admin_can_read_and_cannot_write(self):
        self.client.force_authenticate(user=self.finance)
        created = self.client.post(
            "/api/module-bundles/",
            {
                "name": "Competition pack",
                "modules": ["club_management", "competition"],
                "initial_amount": "80.00",
            },
            format="json",
        )
        self.client.force_authenticate(user=self.admin)
        listing = self.client.get("/api/module-bundles/")
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(listing.data[0]["name"], "Competition pack")
        denied = self.client.patch(
            f"/api/module-bundles/{created.data['id']}/",
            {"name": "Changed"},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_club_admin_cannot_read_or_write_the_catalog(self):
        self.client.force_authenticate(user=self.club_admin)
        self.assertEqual(self.client.get("/api/module-bundles/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.post(
                "/api/module-bundles/",
                {
                    "name": "Hidden",
                    "modules": ["club_management", "competition"],
                    "initial_amount": "10.00",
                },
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_delete_removes_a_bundle_that_has_never_been_invoiced(self):
        self.client.force_authenticate(user=self.finance)
        created = self.client.post(
            "/api/module-bundles/",
            {
                "name": "Competition pack",
                "modules": ["club_management", "competition"],
                "initial_amount": "80.00",
            },
            format="json",
        )
        response = self.client.delete(f"/api/module-bundles/{created.data['id']}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ModuleBundle.objects.exists())

    def test_an_invoiced_bundle_is_switched_off_instead_of_deleted(self):
        self.client.force_authenticate(user=self.finance)
        created = self.client.post(
            "/api/module-bundles/",
            {
                "name": "Competition pack",
                "modules": ["club_management", "competition"],
                "initial_amount": "80.00",
            },
            format="json",
        )
        bundle_id = created.data["id"]
        with patch.object(ModuleBundle, "has_been_invoiced", return_value=True):
            response = self.client.delete(f"/api/module-bundles/{bundle_id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertFalse(response.data["is_active"])
        self.assertTrue(response.data["has_invoices"])
        self.assertTrue(ModuleBundle.objects.filter(id=bundle_id, is_active=False).exists())

    def test_finance_can_save_subscription_settings_and_admin_cannot(self):
        self.client.force_authenticate(user=self.finance)
        current = self.client.get("/api/module-subscription-settings/")
        self.assertEqual(current.status_code, status.HTTP_200_OK)
        self.assertEqual(current.data["subscription_months"], 12)
        self.assertEqual(current.data["renewal_notice_days"], 30)
        self.assertEqual(current.data["payment_window_days"], 30)
        self.assertEqual(current.data["payment_warning_days"], 7)
        saved = self.client.patch(
            "/api/module-subscription-settings/",
            {"subscription_months": 18, "payment_window_days": 20, "payment_warning_days": 5},
            format="json",
        )
        self.assertEqual(saved.status_code, status.HTTP_200_OK, saved.content)
        row = ModuleSubscriptionSettings.load()
        self.assertEqual(row.subscription_months, 18)
        self.assertEqual(row.payment_warning_days, 5)
        too_late = self.client.patch(
            "/api/module-subscription-settings/",
            {"payment_warning_days": 20},
            format="json",
        )
        self.assertEqual(too_late.status_code, status.HTTP_400_BAD_REQUEST)
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self.client.get("/api/module-subscription-settings/").status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.patch("/api/module-subscription-settings/", {"subscription_months": 6}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
