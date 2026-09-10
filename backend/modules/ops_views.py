from django.conf import settings
from rest_framework import response, status, views
from rest_framework.exceptions import ValidationError

from clubs.models import Club
from ops.permissions import IsSuperuser
from ops.request_utils import write_ops_audit

from .codes import (
    ProductCodeError,
    build_payload,
    can_mint_locally,
    configured_public_key,
    fingerprint_token,
    get_or_create_install,
    sign_payload,
)
from .entitlements import (
    entitled_module_ids,
    install_id_str,
    redeem_product_code,
    set_club_assignment,
    status_for_user,
)
from .models import ClubModuleAssignment, ProductCodeRedemption
from .registry import catalog, get_spec


class OpsModulesView(views.APIView):
    permission_classes = [IsSuperuser]

    def get(self, request):
        install = get_or_create_install()
        redemptions = [
            {
                "jti": row.jti,
                "fingerprint_suffix": row.fingerprint[-8:],
                "modules": row.modules,
                "status": row.status,
                "expires_at": row.expires_at.isoformat() if row.expires_at else None,
                "redeemed_at": row.redeemed_at.isoformat() if row.redeemed_at else None,
                "redeemed_by": row.redeemed_by_id,
            }
            for row in ProductCodeRedemption.objects.all()[:50]
        ]
        clubs = list(Club.objects.order_by("name").values("id", "name", "is_active"))
        assignments = [
            {
                "club_id": row.club_id,
                "module_id": row.module_id,
                "enabled": row.enabled,
            }
            for row in ClubModuleAssignment.objects.all()
        ]
        payload = status_for_user(request.user)
        payload.update(
            {
                "install_id": str(install.install_id),
                "has_verify_key": bool(configured_public_key()) or bool(settings.DEBUG),
                "can_mint_locally": can_mint_locally() and bool(settings.DEBUG),
                "catalog": catalog(),
                "redemptions": redemptions,
                "assignments": assignments,
                "clubs": clubs,
                "entitled": sorted(entitled_module_ids()),
            }
        )
        return response.Response(payload)


class OpsRedeemCodeView(views.APIView):
    permission_classes = [IsSuperuser]

    def post(self, request):
        token = str(request.data.get("code") or "").strip()
        if not token:
            raise ValidationError({"code": "Enter a product code."})
        try:
            redemption = redeem_product_code(token, user=request.user)
        except ProductCodeError as exc:
            raise ValidationError({"code": str(exc)}) from exc
        write_ops_audit(
            request,
            action="modules.redeem_code",
            message="Product code redeemed.",
            target_type="product_code",
            target_id=redemption.jti,
            metadata={
                "modules": redemption.modules,
                "fingerprint_suffix": redemption.fingerprint[-8:],
                "expires_at": redemption.expires_at.isoformat() if redemption.expires_at else None,
            },
        )
        return response.Response(
            {
                "jti": redemption.jti,
                "modules": redemption.modules,
                "expires_at": redemption.expires_at.isoformat() if redemption.expires_at else None,
                "fingerprint_suffix": redemption.fingerprint[-8:],
            },
            status=status.HTTP_201_CREATED,
        )


class OpsMintCodeView(views.APIView):
    permission_classes = [IsSuperuser]

    def post(self, request):
        if not settings.DEBUG:
            raise ValidationError("Local minting is only available in debug.")
        modules = request.data.get("modules") or []
        if isinstance(modules, str):
            modules = [item.strip() for item in modules.split(",") if item.strip()]
        if not isinstance(modules, list) or not modules:
            raise ValidationError({"modules": "Select at least one module."})
        try:
            payload = build_payload(module_ids=list(modules), install_id=install_id_str())
            token = sign_payload(payload)
        except ProductCodeError as exc:
            raise ValidationError({"modules": str(exc)}) from exc
        write_ops_audit(
            request,
            action="modules.mint_code",
            message="Debug product code minted.",
            target_type="product_code",
            target_id=payload["jti"],
            metadata={"modules": payload["modules"], "fingerprint_suffix": fingerprint_token(token)[-8:]},
        )
        return response.Response({"code": token, "jti": payload["jti"], "modules": payload["modules"]})


class OpsAssignmentView(views.APIView):
    permission_classes = [IsSuperuser]

    def put(self, request):
        club_id = request.data.get("club_id")
        module_id = str(request.data.get("module_id") or "").strip()
        enabled = bool(request.data.get("enabled"))
        if not club_id:
            raise ValidationError({"club_id": "Select a club."})
        spec = get_spec(module_id)
        if spec is None:
            raise ValidationError({"module_id": "Unknown module."})
        club = Club.objects.filter(pk=club_id).first()
        if club is None:
            raise ValidationError({"club_id": "Club not found."})
        try:
            assignment = set_club_assignment(
                club=club, module_id=module_id, enabled=enabled, user=request.user
            )
        except ProductCodeError as exc:
            raise ValidationError({"module_id": str(exc)}) from exc
        write_ops_audit(
            request,
            action="modules.assign_club",
            message=f"{'Enabled' if enabled else 'Disabled'} {module_id} for {club.name}.",
            target_type="club_module",
            target_id=f"{club.id}:{module_id}",
            metadata={"club_id": club.id, "module_id": module_id, "enabled": enabled},
        )
        return response.Response(
            {
                "club_id": assignment.club_id,
                "module_id": assignment.module_id,
                "enabled": assignment.enabled,
            }
        )
