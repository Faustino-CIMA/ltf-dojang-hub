from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from clubs.models import Club

from .codes import ProductCodeError, build_payload, fingerprint_token, parse_and_verify, sign_payload
from .entitlements import (
    install_id_str,
    is_club_assigned,
    is_install_entitled,
    redeem_product_code,
    set_club_assignment,
)
from .models import ClubModuleAssignment, InstallEntitlement, ProductCodeRedemption
from .registry import (
    CLUB_MANAGEMENT_MODULE_ID,
    INVENTORY_CLUB_LEGACY_ID,
    INVENTORY_FEDERATION_MODULE_ID,
    PREVIEW_MODULE_ID,
    catalog,
)


@override_settings(DEBUG=True, MODULE_CODE_PUBLIC_KEY="", MODULE_CODE_PRIVATE_KEY="")
class ModuleEntitlementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.member = User.objects.create_user(
            username="clubmember",
            email="member@example.com",
            password="pass12345",
            role=User.Roles.MEMBER,
        )
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
        self.superuser = User.objects.create_superuser(
            username="opsroot",
            email="ops@example.com",
            password="pass12345",
        )
        self.club = Club.objects.create(name="Main Club", created_by=self.ltf_admin)
        self.club.admins.add(self.club_admin)
        self.other_club = Club.objects.create(name="Other Club", created_by=self.ltf_admin)
        self.other_club.admins.add(self.other_admin)

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def _mint(self, modules=None, install_id=None, expires_at=None):
        payload = build_payload(
            module_ids=modules or [PREVIEW_MODULE_ID],
            install_id=install_id or install_id_str(),
            expires_at=expires_at,
        )
        return sign_payload(payload), payload

    def test_ltf_admin_cannot_access_ops_modules(self):
        self._auth(self.ltf_admin)
        response = self.client.get("/api/ops/modules/")
        self.assertEqual(response.status_code, 403)

    def test_superuser_sees_install_id(self):
        self._auth(self.superuser)
        response = self.client.get("/api/ops/modules/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["install_id"], install_id_str())
        self.assertIn(PREVIEW_MODULE_ID, [row["id"] for row in response.data["catalog"]])

    def test_redeem_wrong_signature_rejected(self):
        self._auth(self.superuser)
        response = self.client.post(
            "/api/ops/modules/codes/",
            {"code": "LTF1.not-a.token"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_redeem_wrong_install_rejected(self):
        self._auth(self.superuser)
        token, _ = self._mint(install_id="00000000-0000-0000-0000-000000000000")
        response = self.client.post("/api/ops/modules/codes/", {"code": token}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(is_install_entitled(PREVIEW_MODULE_ID))

    def test_redeem_expired_rejected(self):
        self._auth(self.superuser)
        token, _ = self._mint(expires_at=timezone.now() - timedelta(hours=1))
        response = self.client.post("/api/ops/modules/codes/", {"code": token}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_redeem_and_preview_flow(self):
        self._auth(self.superuser)
        token, payload = self._mint()
        redeemed = self.client.post("/api/ops/modules/codes/", {"code": token}, format="json")
        self.assertEqual(redeemed.status_code, 201)
        self.assertEqual(redeemed.data["jti"], payload["jti"])
        self.assertTrue(is_install_entitled(PREVIEW_MODULE_ID))
        self.assertFalse(is_club_assigned(PREVIEW_MODULE_ID, self.club.id))

        replay = self.client.post("/api/ops/modules/codes/", {"code": token}, format="json")
        self.assertEqual(replay.status_code, 400)

        self._auth(self.ltf_admin)
        preview = self.client.get("/api/modules/preview/")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data["status"], "coming_soon")

        self._auth(self.club_admin)
        locked = self.client.get(f"/api/modules/preview/?club={self.club.id}")
        self.assertEqual(locked.status_code, 403)

        self._auth(self.superuser)
        assigned = self.client.put(
            "/api/ops/modules/assignments/",
            {"club_id": self.club.id, "module_id": PREVIEW_MODULE_ID, "enabled": True},
            format="json",
        )
        self.assertEqual(assigned.status_code, 200)

        self._auth(self.club_admin)
        unlocked = self.client.get(f"/api/modules/preview/?club={self.club.id}")
        self.assertEqual(unlocked.status_code, 200)
        self.assertEqual(unlocked.data["club_id"], self.club.id)

        me = self.client.get("/api/modules/")
        self.assertEqual(me.status_code, 200)
        self.assertIn(PREVIEW_MODULE_ID, me.data["entitled"])
        club_row = next(row for row in me.data["clubs"] if row["id"] == self.club.id)
        self.assertIn(PREVIEW_MODULE_ID, club_row["modules"])
        self.assertFalse(any(row["id"] == self.other_club.id for row in me.data["clubs"]))

        self._auth(self.other_admin)
        other = self.client.get(f"/api/modules/preview/?club={self.other_club.id}")
        self.assertEqual(other.status_code, 403)
        sneak = self.client.get(f"/api/modules/preview/?club={self.club.id}")
        self.assertEqual(sneak.status_code, 403)

        self._auth(self.member)
        member_preview = self.client.get("/api/modules/preview/")
        self.assertEqual(member_preview.status_code, 403)

    def test_cannot_assign_without_entitlement(self):
        self._auth(self.superuser)
        response = self.client.put(
            "/api/ops/modules/assignments/",
            {"club_id": self.club.id, "module_id": PREVIEW_MODULE_ID, "enabled": True},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_cannot_assign_install_wide_module_per_club(self):
        self._auth(self.superuser)
        token, _ = self._mint(modules=[INVENTORY_FEDERATION_MODULE_ID])
        self.client.post("/api/ops/modules/codes/", {"code": token}, format="json")
        response = self.client.put(
            "/api/ops/modules/assignments/",
            {"club_id": self.club.id, "module_id": INVENTORY_FEDERATION_MODULE_ID, "enabled": True},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_new_code_adds_entitlements(self):
        first, _ = self._mint(modules=[PREVIEW_MODULE_ID])
        redeem_product_code(first)
        self.assertTrue(is_install_entitled(PREVIEW_MODULE_ID))
        second, _ = self._mint(modules=[INVENTORY_FEDERATION_MODULE_ID])
        redeem_product_code(second)
        self.assertTrue(is_install_entitled(PREVIEW_MODULE_ID))
        self.assertTrue(is_install_entitled(INVENTORY_FEDERATION_MODULE_ID))
        self.assertEqual(
            ProductCodeRedemption.objects.filter(status=ProductCodeRedemption.Status.ACTIVE).count(),
            2,
        )

    def test_debug_mint_endpoint(self):
        self._auth(self.superuser)
        response = self.client.post(
            "/api/ops/modules/codes/mint/",
            {"modules": [PREVIEW_MODULE_ID]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["code"].startswith("LTF1."))
        redeem = self.client.post(
            "/api/ops/modules/codes/",
            {"code": response.data["code"]},
            format="json",
        )
        self.assertEqual(redeem.status_code, 201)

    def test_fingerprint_is_not_the_secret(self):
        token, _ = self._mint()
        fp = fingerprint_token(token)
        redeem_product_code(token)
        stored = ProductCodeRedemption.objects.get()
        self.assertEqual(stored.fingerprint, fp)
        self.assertNotEqual(stored.fingerprint, token)
        self.assertFalse(InstallEntitlement.objects.filter(module_id=PREVIEW_MODULE_ID, active=False).exists())

    def test_assignment_survives_additional_entitlement(self):
        first, _ = self._mint()
        redeem_product_code(first)
        ClubModuleAssignment.objects.create(
            club=self.club, module_id=PREVIEW_MODULE_ID, enabled=True, assigned_by=self.superuser
        )
        second, _ = self._mint(modules=[INVENTORY_FEDERATION_MODULE_ID])
        redeem_product_code(second)
        self.assertTrue(is_club_assigned(PREVIEW_MODULE_ID, self.club.id))
        self.assertTrue(is_install_entitled(INVENTORY_FEDERATION_MODULE_ID))

    def test_unknown_module_rejected(self):
        with self.assertRaises(ProductCodeError):
            build_payload(module_ids=["not_a_module"], install_id=install_id_str())

    def test_catalog_excludes_club_inventory(self):
        ids = [row["id"] for row in catalog()]
        self.assertNotIn(INVENTORY_CLUB_LEGACY_ID, ids)
        self.assertIn(CLUB_MANAGEMENT_MODULE_ID, ids)
        self.assertIn(INVENTORY_FEDERATION_MODULE_ID, ids)
        self._auth(self.superuser)
        response = self.client.get("/api/ops/modules/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(INVENTORY_CLUB_LEGACY_ID, [row["id"] for row in response.data["catalog"]])
        self.assertNotIn(INVENTORY_CLUB_LEGACY_ID, [row["id"] for row in response.data["modules"]])

    def test_legacy_inventory_club_code_grants_club_management(self):
        payload = build_payload(module_ids=[CLUB_MANAGEMENT_MODULE_ID], install_id=install_id_str())
        payload["modules"] = [INVENTORY_CLUB_LEGACY_ID]
        token = sign_payload(payload)
        verified = parse_and_verify(token)
        self.assertEqual(verified["modules"], [CLUB_MANAGEMENT_MODULE_ID])
        redemption = redeem_product_code(token)
        self.assertEqual(redemption.modules, [CLUB_MANAGEMENT_MODULE_ID])
        self.assertTrue(is_install_entitled(CLUB_MANAGEMENT_MODULE_ID))
        self.assertFalse(InstallEntitlement.objects.filter(module_id=INVENTORY_CLUB_LEGACY_ID).exists())

    def test_minting_inventory_club_canonicalizes_to_club_management(self):
        payload = build_payload(module_ids=[INVENTORY_CLUB_LEGACY_ID], install_id=install_id_str())
        self.assertEqual(payload["modules"], [CLUB_MANAGEMENT_MODULE_ID])
        self._auth(self.superuser)
        response = self.client.post(
            "/api/ops/modules/codes/mint/",
            {"modules": [INVENTORY_CLUB_LEGACY_ID]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["modules"], [CLUB_MANAGEMENT_MODULE_ID])

    def test_assigning_inventory_club_assigns_club_management(self):
        token, _ = self._mint(modules=[CLUB_MANAGEMENT_MODULE_ID])
        redeem_product_code(token)
        assignment = set_club_assignment(
            club=self.club, module_id=INVENTORY_CLUB_LEGACY_ID, enabled=True, user=self.superuser
        )
        self.assertEqual(assignment.module_id, CLUB_MANAGEMENT_MODULE_ID)
        self.assertTrue(is_club_assigned(CLUB_MANAGEMENT_MODULE_ID, self.club.id))
        self.assertFalse(
            ClubModuleAssignment.objects.filter(
                club=self.club, module_id=INVENTORY_CLUB_LEGACY_ID
            ).exists()
        )

    def test_leftover_inventory_club_rows_count_as_club_management(self):
        InstallEntitlement.objects.create(module_id=INVENTORY_CLUB_LEGACY_ID, active=True)
        ClubModuleAssignment.objects.create(
            club=self.club, module_id=INVENTORY_CLUB_LEGACY_ID, enabled=True, assigned_by=self.superuser
        )
        self.assertTrue(is_install_entitled(CLUB_MANAGEMENT_MODULE_ID))
        self.assertTrue(is_club_assigned(CLUB_MANAGEMENT_MODULE_ID, self.club.id))
        self._auth(self.superuser)
        me = self.client.get("/api/modules/")
        self.assertEqual(me.status_code, 200)
        self.assertIn(CLUB_MANAGEMENT_MODULE_ID, me.data["entitled"])
        self.assertNotIn(INVENTORY_CLUB_LEGACY_ID, me.data["entitled"])
        club_row = next(row for row in me.data["clubs"] if row["id"] == self.club.id)
        self.assertIn(CLUB_MANAGEMENT_MODULE_ID, club_row["modules"])
        self.assertNotIn(INVENTORY_CLUB_LEGACY_ID, club_row["modules"])

    def test_absorb_migration_rewrites_leftover_rows(self):
        from importlib import import_module

        from django.apps import apps

        InstallEntitlement.objects.create(module_id=INVENTORY_CLUB_LEGACY_ID, active=True)
        ClubModuleAssignment.objects.create(
            club=self.club, module_id=INVENTORY_CLUB_LEGACY_ID, enabled=True, assigned_by=self.superuser
        )
        ProductCodeRedemption.objects.create(
            jti="legacy-inv-club",
            fingerprint="b" * 64,
            modules=[INVENTORY_CLUB_LEGACY_ID, PREVIEW_MODULE_ID],
            payload={"modules": [INVENTORY_CLUB_LEGACY_ID]},
            status=ProductCodeRedemption.Status.ACTIVE,
        )
        absorb = import_module("modules.migrations.0002_absorb_inventory_club")
        absorb.absorb_inventory_club(apps, None)
        self.assertFalse(InstallEntitlement.objects.filter(module_id=INVENTORY_CLUB_LEGACY_ID).exists())
        self.assertTrue(
            InstallEntitlement.objects.filter(module_id=CLUB_MANAGEMENT_MODULE_ID, active=True).exists()
        )
        self.assertFalse(
            ClubModuleAssignment.objects.filter(club=self.club, module_id=INVENTORY_CLUB_LEGACY_ID).exists()
        )
        self.assertTrue(
            ClubModuleAssignment.objects.filter(
                club=self.club, module_id=CLUB_MANAGEMENT_MODULE_ID, enabled=True
            ).exists()
        )
        redemption = ProductCodeRedemption.objects.get(jti="legacy-inv-club")
        self.assertEqual(sorted(redemption.modules), [CLUB_MANAGEMENT_MODULE_ID, PREVIEW_MODULE_ID])
        self.assertEqual(redemption.payload["modules"], [CLUB_MANAGEMENT_MODULE_ID])
