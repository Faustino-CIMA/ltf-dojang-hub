import mimetypes
from pathlib import Path

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Prefetch, Q
from django.db.models.deletion import ProtectedError
from django.http import FileResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from config.ordering import apply_list_ordering
from config.pagination import OptionalPaginationListMixin
from clubmgmt.models import CommitteeMandate
from clubmgmt.serializers import CommitteeTermHistorySerializer

from .models import GradePromotionHistory, LtfStaffFunction, Member, MemberTransfer
from .serializers import (
    GradePromotionCreateSerializer,
    GradePromotionHistorySerializer,
    GradePromotionUpdateSerializer,
    LicenseHistoryEventSerializer,
    MemberProfilePictureSerializer,
    MemberProfilePictureUploadSerializer,
    MemberSerializer,
)
from accounts.permissions import IsLtfAdmin
from clubs.models import Club

from .ltf_staff import (
    LtfStaffError,
    canonical_staff_function,
    current_staff_q,
    create_staff_member,
    delete_staff,
    issue_staff_license,
    revoke_staff_license,
    update_staff_member,
)
from .services import (
    add_grade_promotion,
    clear_member_profile_picture,
    delete_grade_promotion,
    process_member_profile_picture,
    rewrite_existing_lux_ltf_license_ids,
    update_grade_promotion,
)
from licenses.card_rendering import (
    CardRenderError,
    build_card_simulation_payload,
    build_preview_data,
    resolve_printable_license,
    resolve_published_standard_card_version,
)
from licenses.models import License, LicenseHistoryEvent, LicenseType


def _apply_member_issue_filter(queryset, issue):
    issue = (issue or "").strip()
    if issue == "missing_ltf_licenseid":
        return queryset.filter(is_active=True).filter(
            Q(ltf_licenseid__isnull=True) | Q(ltf_licenseid="")
        )
    if issue == "no_valid_license":
        has_valid_license = License.objects.filter(
            member_id=OuterRef("pk"),
            status__in=[License.Status.ACTIVE, License.Status.PENDING],
        )
        return (
            queryset.filter(is_active=True)
            .annotate(has_valid_license=Exists(has_valid_license))
            .filter(has_valid_license=False)
        )
    return queryset


class MemberViewSet(OptionalPaginationListMixin, viewsets.ModelViewSet):
    serializer_class = MemberSerializer
    permission_classes = [permissions.IsAuthenticated]
    _COACH_ALLOWED_UPDATE_FIELDS = {"belt_rank"}
    _STAFF_ACTIONS = {
        "create_ltf_staff",
        "ltf_staff",
        "issue_ltf_staff_license",
        "revoke_ltf_staff_license",
    }

    def get_permissions(self):
        if self.action in self._STAFF_ACTIONS:
            return [IsLtfAdmin()]
        user = self.request.user
        if self.action in ["create", "destroy"]:
            if user and user.is_authenticated and user.role in [
                "ltf_admin",
                "ltf_finance",
                "coach",
            ]:
                return [permissions.IsAdminUser()]
        if self.action in ["update", "partial_update"]:
            if user and user.is_authenticated and user.role in ["ltf_admin", "ltf_finance"]:
                return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Member.objects.none()
        user = self.request.user
        if not user or not user.is_authenticated:
            return Member.objects.none()

        if user.role in ["ltf_admin", "ltf_finance"]:
            queryset = Member.objects.select_related(
                "club", "user", "photo_consent_attested_by"
            ).filter(
                is_active=True
            )
        elif user.role in ["club_admin", "coach"]:
            queryset = Member.objects.select_related(
                "club", "user", "photo_consent_attested_by"
            ).filter(
                club__admins=user
            )
        else:
            queryset = Member.objects.select_related(
                "club", "user", "photo_consent_attested_by"
            ).filter(user=user)

        roster = (self.request.query_params.get("roster") or "").strip()
        if roster == "club":
            queryset = queryset.filter(club__isnull=False)
        elif roster == "staff":
            queryset = queryset.filter(
                Exists(
                    LtfStaffFunction.objects.filter(member_id=OuterRef("pk")).filter(
                        current_staff_q()
                    )
                )
            )

        staff_function = canonical_staff_function(
            (self.request.query_params.get("staff_function") or "").strip()
        )
        if staff_function:
            if staff_function not in LtfStaffFunction.Function.values:
                queryset = queryset.none()
            else:
                queryset = queryset.filter(
                    Exists(
                        LtfStaffFunction.objects.filter(
                            member_id=OuterRef("pk"),
                            function=staff_function,
                        ).filter(current_staff_q())
                    )
                )

        club_id = self.request.query_params.get("club_id")
        if club_id:
            queryset = queryset.filter(club_id=club_id)

        ids_param = self.request.query_params.get("ids", "").strip()
        if ids_param:
            member_ids: list[int] = []
            for value in ids_param.split(","):
                value = value.strip()
                if not value:
                    continue
                try:
                    member_ids.append(int(value))
                except ValueError:
                    continue
            if member_ids:
                queryset = queryset.filter(id__in=member_ids)
            else:
                queryset = queryset.none()

        is_active_param = self.request.query_params.get("is_active", "").strip().lower()
        if is_active_param in {"1", "true", "yes"}:
            queryset = queryset.filter(is_active=True)
        elif is_active_param in {"0", "false", "no"}:
            queryset = queryset.filter(is_active=False)

        search_value = self.request.query_params.get("q", "").strip()
        if search_value:
            queryset = queryset.filter(
                Q(first_name__icontains=search_value)
                | Q(last_name__icontains=search_value)
                | Q(email__icontains=search_value)
                | Q(ltf_licenseid__icontains=search_value)
                | Q(wt_licenseid__icontains=search_value)
                | Q(belt_rank__icontains=search_value)
            )

        if self.action == "list":
            queryset = _apply_member_issue_filter(
                queryset, self.request.query_params.get("issue")
            )

        queryset = queryset.annotate(
            completed_transfer_count=Count(
                "transfers",
                filter=Q(transfers__status=MemberTransfer.Status.COMPLETED),
            )
        )
        queryset = queryset.prefetch_related(
            Prefetch(
                "licenses",
                queryset=License.objects.filter(
                    status__in=[License.Status.PENDING, License.Status.ACTIVE]
                )
                .select_related("license_type")
                .order_by("-year", "id"),
                to_attr="current_licenses_prefetched",
            ),
            Prefetch(
                "ltf_staff_functions",
                queryset=LtfStaffFunction.objects.filter(current_staff_q()).order_by(
                    "-started_on", "-id"
                ),
                to_attr="current_ltf_staff_rows",
            ),
        )
        ordering = self.request.query_params.get("ordering") if self.action == "list" else None
        return apply_list_ordering(
            queryset,
            ordering,
            allowed={
                "name": ("last_name", "first_name", "id"),
                "club": ("club__name", "last_name", "first_name", "id"),
                "ltf_licenseid": ("ltf_licenseid", "last_name", "first_name", "id"),
                "belt_rank": ("belt_rank", "last_name", "first_name", "id"),
                "is_active": ("is_active", "last_name", "first_name", "id"),
                "sex": ("sex", "last_name", "first_name", "id"),
                "date_of_birth": ("date_of_birth", "last_name", "first_name", "id"),
                "email": ("email", "last_name", "first_name", "id"),
            },
            default=("last_name", "first_name", "id"),
        )

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "Member has related licenses and cannot be deleted."},
                status=status.HTTP_409_CONFLICT,
            )

    def _is_coach(self, user) -> bool:
        return bool(user and user.is_authenticated and user.role == "coach")

    def _coach_update_allowed(self, request) -> bool:
        if not self._is_coach(request.user):
            return True
        payload_fields = set(request.data.keys())
        return bool(payload_fields) and payload_fields.issubset(self._COACH_ALLOWED_UPDATE_FIELDS)

    def _coach_update_forbidden_response(self):
        return Response(
            {"detail": "Not allowed. Coaches can only update belt rank."},
            status=status.HTTP_403_FORBIDDEN,
        )

    def update(self, request, *args, **kwargs):
        if not self._coach_update_allowed(request):
            return self._coach_update_forbidden_response()
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not self._coach_update_allowed(request):
            return self._coach_update_forbidden_response()
        return super().partial_update(request, *args, **kwargs)

    def _staff_response(self, error: LtfStaffError):
        return Response({"detail": error.detail}, status=error.status_code)

    def _staff_payload(self, data) -> dict:
        payload = {
            "member_id": data.get("member_id"),
            "first_name": data.get("first_name"),
            "last_name": data.get("last_name"),
            "email": data.get("email"),
            "sex": data.get("sex"),
            "date_of_birth": data.get("date_of_birth"),
            "function": data.get("function"),
            "started_on": data.get("started_on"),
            "ended_on": data.get("ended_on"),
            "user_id": data.get("user_id"),
            "username": data.get("username"),
            "create_login_role": data.get("create_login_role"),
            "license_year": data.get("license_year"),
        }
        if "club" in data:
            raw_club = data.get("club")
            if raw_club in (None, "", "null"):
                payload["club"] = None
            else:
                club = Club.objects.filter(id=raw_club).first()
                if club is None:
                    raise LtfStaffError("club_not_found")
                payload["club"] = club
        if data.get("license_type"):
            license_type = LicenseType.objects.filter(id=data.get("license_type")).first()
            if license_type is None:
                raise LtfStaffError("license_type_not_found")
            payload["license_type"] = license_type
        sex = payload.get("sex")
        if sex not in (None, "", Member.Sex.MALE, Member.Sex.FEMALE):
            raise LtfStaffError("invalid_sex")
        return payload

    def _serialize_member(self, member: Member):
        member = self.get_queryset().filter(pk=member.pk).first() or member
        return MemberSerializer(member, context=self.get_serializer_context()).data

    @action(detail=False, methods=["post"], url_path="ltf-staff")
    def create_ltf_staff(self, request):
        try:
            payload = self._staff_payload(request.data)
            with transaction.atomic():
                member, _meta = create_staff_member(
                    payload,
                    actor=request.user,
                    locale=request.data.get("locale"),
                )
        except LtfStaffError as error:
            return self._staff_response(error)
        return Response(self._serialize_member(member), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch", "delete"], url_path="ltf-staff")
    def ltf_staff(self, request, pk=None):
        member = self.get_object()
        try:
            if request.method == "DELETE":
                with transaction.atomic():
                    result = delete_staff(member)
                return Response(result)
            payload = self._staff_payload(request.data)
            with transaction.atomic():
                member = update_staff_member(
                    member,
                    payload,
                    actor=request.user,
                    locale=request.data.get("locale"),
                )
        except LtfStaffError as error:
            return self._staff_response(error)
        return Response(self._serialize_member(member))

    @action(detail=True, methods=["post"], url_path="ltf-staff-license")
    def issue_ltf_staff_license(self, request, pk=None):
        member = self.get_object()
        try:
            license_type = LicenseType.objects.filter(id=request.data.get("license_type")).first()
            if license_type is None:
                raise LtfStaffError("license_type_not_found")
            with transaction.atomic():
                license_record = issue_staff_license(
                    member,
                    license_type=license_type,
                    year=request.data.get("year") or request.data.get("license_year"),
                    actor=request.user,
                )
        except LtfStaffError as error:
            return self._staff_response(error)
        return Response(
            {"id": license_record.id, "year": license_record.year, "status": license_record.status},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="revoke-ltf-staff-license")
    def revoke_ltf_staff_license(self, request, pk=None):
        member = self.get_object()
        try:
            with transaction.atomic():
                license_record = revoke_staff_license(
                    member,
                    actor=request.user,
                    reason=str(request.data.get("reason") or ""),
                )
        except LtfStaffError as error:
            return self._staff_response(error)
        return Response({"id": license_record.id, "status": license_record.status})

    def _is_grade_manager(self, user) -> bool:
        return user and user.is_authenticated and user.role in [
            "club_admin",
            "coach",
        ]

    def _is_photo_manager(self, user) -> bool:
        return user and user.is_authenticated and user.role in [
            "club_admin",
            "member",
        ]

    @action(detail=True, methods=["get"], url_path="license-card-preview")
    def license_card_preview(self, request, *args, **kwargs):
        member = self.get_object()
        license_id_raw = str(request.query_params.get("license_id") or "").strip()
        side = str(request.query_params.get("side") or "front").strip() or "front"
        license_record = None
        if license_id_raw:
            try:
                license_record = member.licenses.filter(id=int(license_id_raw)).first()
            except (TypeError, ValueError):
                license_record = None
        if license_record is None:
            license_record = resolve_printable_license(member)
        version = resolve_published_standard_card_version()
        if version is None:
            return Response(
                {"detail": "No published license card template is available."},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            preview_payload = build_preview_data(
                template_version=version,
                side=side,
                member_id=member.id,
                license_id=license_record.id if license_record else None,
                club_id=member.club_id,
                include_bleed_guide=False,
                include_safe_area_guide=False,
                request=request,
            )
            simulation_payload = build_card_simulation_payload(preview_payload)
        except CardRenderError as exc:
            return Response({"detail": exc.detail}, status=exc.status_code)
        return Response(
            {
                "template_version_id": preview_payload["template_version_id"],
                "template_id": preview_payload["template_id"],
                "template_name": version.template.name,
                "license_id": license_record.id if license_record else None,
                "active_side": preview_payload.get("active_side", "front"),
                "available_sides": preview_payload.get("available_sides", ["front"]),
                "side_summary": preview_payload.get("side_summary", {}),
                "card_format": preview_payload["card_format"],
                "render_metadata": preview_payload.get("render_metadata", {}),
                "html": simulation_payload["html"],
                "css": simulation_payload["css"],
            }
        )

    @action(detail=True, methods=["get"], url_path="license-history")
    def license_history(self, request, *args, **kwargs):
        member = self.get_object()
        queryset = (
            LicenseHistoryEvent.objects.select_related(
                "license",
                "license__license_type",
                "club",
                "order",
                "payment",
                "actor",
            )
            .filter(member=member)
            .order_by("-event_at", "-id")
        )
        if request.user.role == "ltf_finance":
            queryset = queryset.filter(Q(order__isnull=False) | Q(payment__isnull=False))
        serializer = LicenseHistoryEventSerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="grade-history")
    def grade_history(self, request, *args, **kwargs):
        if request.user.role == "ltf_finance":
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        member = self.get_object()
        queryset = (
            GradePromotionHistory.objects.select_related("club", "examiner_user")
            .filter(member=member)
            .order_by("-promotion_date", "-created_at")
        )
        serializer = GradePromotionHistorySerializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="club-transfers")
    def club_transfers(self, request, *args, **kwargs):
        from .transfers import TransferError, list_member_club_transfers

        member = self.get_object()
        try:
            return Response(list_member_club_transfers(user=request.user, member_id=member.id))
        except TransferError as error:
            return Response(error.payload, status=error.status_code)

    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request, *args, **kwargs):
        member = self.get_object()
        license_queryset = (
            LicenseHistoryEvent.objects.select_related(
                "license",
                "license__license_type",
                "club",
                "order",
                "payment",
                "actor",
            )
            .filter(member=member)
            .order_by("-event_at", "-id")
        )
        if request.user.role == "ltf_finance":
            license_queryset = license_queryset.filter(
                Q(order__isnull=False) | Q(payment__isnull=False)
            )
            grade_payload = []
            committee_payload = []
        else:
            grade_queryset = (
                GradePromotionHistory.objects.select_related("club", "examiner_user")
                .filter(member=member)
                .order_by("-promotion_date", "-created_at")
            )
            grade_payload = GradePromotionHistorySerializer(grade_queryset, many=True).data
            term_queryset = (
                CommitteeMandate.objects.select_related("committee", "committee__club")
                .filter(member=member)
                .order_by("-started_on", "-id")
            )
            committee_payload = CommitteeTermHistorySerializer(term_queryset, many=True).data

        return Response(
            {
                "member_id": member.id,
                "license_history": LicenseHistoryEventSerializer(
                    license_queryset, many=True
                ).data,
                "grade_history": grade_payload,
                "committee_history": committee_payload,
            }
        )

    @action(detail=True, methods=["post"], url_path="promote-grade")
    def promote_grade(self, request, *args, **kwargs):
        if not self._is_grade_manager(request.user):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)

        member = self.get_object()
        serializer = GradePromotionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        to_grade = serializer.validated_data["to_grade"]
        notes = serializer.validated_data.get("notes", "")
        proof_ref = serializer.validated_data.get("proof_ref", "")
        created_by = serializer.validated_data.get("created_by", "")
        metadata = serializer.validated_data.get("metadata", {}) or {}
        promotion_date = serializer.validated_data.get("promotion_date")
        exam_date = serializer.validated_data.get("exam_date")

        consent_user = member.user
        if (notes or proof_ref) and consent_user and not consent_user.consent_given:
            return Response(
                {"detail": "Member consent is required for storing grade notes/proof."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            history_entry = add_grade_promotion(
                member,
                actor=request.user if request.user.is_authenticated else None,
                to_grade=to_grade,
                notes=notes,
                proof_ref=proof_ref,
                created_by=created_by,
                promotion_date=promotion_date,
                exam_date=exam_date,
                metadata={
                    **metadata,
                    "consent_required": bool(notes or proof_ref),
                    "consent_confirmed": bool(consent_user and consent_user.consent_given),
                    "source": "member.promote_grade",
                },
            )
        except DjangoValidationError as exc:
            detail = (
                exc.message_dict
                if hasattr(exc, "message_dict")
                else exc.messages
                if hasattr(exc, "messages")
                else str(exc)
            )
            raise DRFValidationError(detail) from exc

        return Response(
            GradePromotionHistorySerializer(history_entry).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"grade-history/(?P<history_id>[^/.]+)",
    )
    def update_grade_history(self, request, history_id=None, *args, **kwargs):
        if not self._is_grade_manager(request.user):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)

        member = self.get_object()
        history_entry = (
            GradePromotionHistory.objects.select_related("member")
            .filter(member=member, id=history_id)
            .first()
        )
        if not history_entry:
            return Response({"detail": "Grade history entry not found."}, status=status.HTTP_404_NOT_FOUND)

        if request.method == "DELETE":
            delete_grade_promotion(history_entry)
            return Response(status=status.HTTP_204_NO_CONTENT)

        serializer = GradePromotionUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        notes = serializer.validated_data.get("notes")
        proof_ref = serializer.validated_data.get("proof_ref")
        consent_user = member.user
        if (notes or proof_ref) and consent_user and not consent_user.consent_given:
            return Response(
                {"detail": "Member consent is required for storing grade notes/proof."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            updated_entry = update_grade_promotion(
                history_entry,
                to_grade=serializer.validated_data.get("to_grade"),
                promotion_date=serializer.validated_data.get("promotion_date"),
                exam_date=serializer.validated_data.get("exam_date"),
                proof_ref=proof_ref,
                notes=notes,
                created_by=serializer.validated_data.get("created_by"),
                metadata=serializer.validated_data.get("metadata"),
            )
        except DjangoValidationError as exc:
            detail = (
                exc.message_dict
                if hasattr(exc, "message_dict")
                else exc.messages
                if hasattr(exc, "messages")
                else str(exc)
            )
            raise DRFValidationError(detail) from exc

        return Response(GradePromotionHistorySerializer(updated_entry).data)

    @action(
        detail=True,
        methods=["get", "post", "delete"],
        url_path="profile-picture",
        parser_classes=[MultiPartParser, FormParser],
    )
    def profile_picture(self, request, *args, **kwargs):
        member = self.get_object()

        if request.method == "GET":
            serializer = MemberProfilePictureSerializer(member, context={"request": request})
            return Response(serializer.data)

        if not self._is_photo_manager(request.user):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)

        if request.method == "DELETE":
            clear_member_profile_picture(member, clear_consent_attestation=True)
            return Response(status=status.HTTP_204_NO_CONTENT)

        serializer = MemberProfilePictureUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            updated_member = process_member_profile_picture(
                member,
                processed_image=serializer.validated_data["processed_image"],
                original_image=serializer.validated_data.get("original_image"),
                photo_edit_metadata=serializer.validated_data.get("photo_edit_metadata", {}),
                actor=request.user if request.user.is_authenticated else None,
            )
        except DjangoValidationError as exc:
            detail = (
                exc.message_dict
                if hasattr(exc, "message_dict")
                else exc.messages
                if hasattr(exc, "messages")
                else str(exc)
            )
            raise DRFValidationError(detail) from exc

        response_serializer = MemberProfilePictureSerializer(
            updated_member, context={"request": request}
        )
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="profile-picture/download")
    def download_profile_picture(self, request, *args, **kwargs):
        member = self.get_object()
        return self._stream_member_image_file(
            member=member,
            image_field=member.profile_picture_processed or member.profile_picture_original,
            not_found_detail="Profile picture not found.",
            missing_detail="Profile picture file is missing.",
            fallback_name=f"member-{member.id}-profile.jpg",
            as_attachment=True,
        )

    @action(detail=True, methods=["get"], url_path="profile-picture/processed")
    def profile_picture_processed(self, request, *args, **kwargs):
        member = self.get_object()
        return self._stream_member_image_file(
            member=member,
            image_field=member.profile_picture_processed or member.profile_picture_original,
            not_found_detail="Profile picture not found.",
            missing_detail="Profile picture file is missing.",
            fallback_name=f"member-{member.id}-profile.jpg",
            as_attachment=False,
        )

    @action(detail=True, methods=["get"], url_path="profile-picture/thumbnail")
    def profile_picture_thumbnail(self, request, *args, **kwargs):
        member = self.get_object()
        return self._stream_member_image_file(
            member=member,
            image_field=(
                member.profile_picture_thumbnail
                or member.profile_picture_processed
                or member.profile_picture_original
            ),
            not_found_detail="Profile picture thumbnail not found.",
            missing_detail="Profile picture thumbnail file is missing.",
            fallback_name=f"member-{member.id}-profile-thumb.jpg",
            as_attachment=False,
        )

    def _stream_member_image_file(
        self,
        *,
        member: Member,
        image_field,
        not_found_detail: str,
        missing_detail: str,
        fallback_name: str,
        as_attachment: bool,
    ):
        if not image_field:
            return Response({"detail": not_found_detail}, status=status.HTTP_404_NOT_FOUND)

        try:
            image_field.open("rb")
        except FileNotFoundError:
            return Response({"detail": missing_detail}, status=status.HTTP_404_NOT_FOUND)

        response_name = Path(str(image_field.name or "")).name or fallback_name
        content_type = mimetypes.guess_type(response_name)[0] or "application/octet-stream"
        return FileResponse(
            image_field,
            as_attachment=as_attachment,
            filename=response_name,
            content_type=content_type,
        )


class RewriteLtfLicensePrefixView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLtfAdmin]

    def get(self, request):
        return Response(rewrite_existing_lux_ltf_license_ids(apply=False))

    def post(self, request):
        return Response(rewrite_existing_lux_ltf_license_ids(apply=True))

