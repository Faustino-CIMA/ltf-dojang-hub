from allauth.account.models import EmailAddress, EmailConfirmationHMAC
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, response, status, views
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import ValidationError

from members.models import GradePromotionHistory, Member
from members.services import clear_member_profile_picture
from licenses.models import License, LicenseHistoryEvent

from .email_utils import build_password_reset_url, send_password_reset_email
from .desks import open_desk_summary, record_desk_switch
from .models import AccountSetupInvite, DeskGrant, User
from .setup_invites import NEUTRAL_DETAIL, account_setup_assignments, invite_for_token, invite_is_open
from .serializers import (
    ConsentSerializer,
    DataDeleteResponseSerializer,
    DataExportSerializer,
    DetailResponseSerializer,
    EmptySerializer,
    LoginResponseSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ResendVerificationSerializer,
    UserSerializer,
    VerifyEmailSerializer,
)


@extend_schema(
    request=LoginSerializer,
    responses=LoginResponseSerializer,
)
class LoginView(views.APIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = LoginSerializer

    def post(self, request):
        from ops.detectors import run_failure_detectors
        from ops.events import is_locked, record_auth_event
        from ops.models import AuthEvent
        from ops.request_utils import client_ip

        username = str(request.data.get("username") or "").strip()
        ip = client_ip(request)
        if is_locked(username=username, ip=ip):
            record_auth_event(
                request,
                AuthEvent.EventType.LOCKOUT,
                username=username,
                metadata={"reason": "locked"},
            )
            raise ValidationError("Invalid credentials")
        serializer = LoginSerializer(data=request.data, context={"request": request})
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError as exc:
            detail = exc.detail
            text = str(detail)
            if "not verified" not in text.lower():
                record_auth_event(
                    request,
                    AuthEvent.EventType.LOGIN_FAILURE,
                    username=username,
                    metadata={"detail": "invalid"},
                )
                run_failure_detectors(request, username=username, ip=ip)
            raise
        user = serializer.validated_data["user"]
        from .mfa import begin_password_login

        try:
            payload = begin_password_login(request._request, user)
        except ValidationError as exc:
            return response.Response({"detail": exc.detail}, status=status.HTTP_400_BAD_REQUEST)
        return response.Response(payload)


@extend_schema(
    request=EmptySerializer,
    responses={status.HTTP_204_NO_CONTENT: None},
)
class LogoutView(views.APIView):
    serializer_class = EmptySerializer

    def post(self, request):
        from ops.events import record_auth_event
        from ops.models import AuthEvent

        session = getattr(request._request, "_allauth_token_session", None)
        if session is not None:
            session.flush()
        Token.objects.filter(user=request.user).delete()
        record_auth_event(
            request,
            AuthEvent.EventType.LOGOUT,
            username=request.user.username,
            user=request.user,
        )
        return response.Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    request=EmptySerializer,
    responses=UserSerializer,
)
class MeView(views.APIView):
    serializer_class = EmptySerializer

    def get(self, request):
        from .mfa import public_mfa_status

        payload = UserSerializer(request.user).data
        payload.update(open_desk_summary(request.user))
        payload["mfa"] = public_mfa_status(request.user)
        return response.Response(payload)


class DeskSelectView(views.APIView):
    """Remember the desk the person chose. Does not grant a new one."""

    def post(self, request):
        desk = str(request.data.get("desk") or "").strip()
        raw_club = request.data.get("club_id")
        club_id = None
        if raw_club not in (None, ""):
            try:
                club_id = int(raw_club)
            except (TypeError, ValueError):
                return response.Response({"detail": "desk_not_granted"}, status=status.HTTP_403_FORBIDDEN)
        if desk not in set(DeskGrant.Desk.values) and desk != "ops":
            return response.Response({"detail": "desk_not_granted"}, status=status.HTTP_403_FORBIDDEN)
        from rest_framework.exceptions import PermissionDenied

        try:
            preference = record_desk_switch(request.user, desk=desk, club_id=club_id)
        except PermissionDenied as exc:
            return response.Response({"detail": exc.detail}, status=status.HTTP_403_FORBIDDEN)
        summary = open_desk_summary(request.user)
        current = next(
            (
                row
                for row in summary["desks"]
                if row["desk"] == preference.desk and row["club_id"] == preference.club_id
            ),
            {"desk": preference.desk, "level": DeskGrant.Level.FULL, "club_id": preference.club_id, "club_name": ""},
        )
        return response.Response(current)


@extend_schema(
    request=ConsentSerializer,
    responses=UserSerializer,
)
class ConsentView(views.APIView):
    serializer_class = ConsentSerializer

    def post(self, request):
        serializer = ConsentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        consent_given = serializer.validated_data["consent_given"]
        if consent_given:
            request.user.give_consent()
        else:
            request.user.revoke_consent()
        return response.Response(UserSerializer(request.user).data)


@extend_schema(
    request=EmptySerializer,
    responses=DataExportSerializer,
)
class DataExportView(views.APIView):
    serializer_class = EmptySerializer

    def get(self, request):
        member = Member.all_objects.filter(user=request.user).first()
        licenses = License.objects.filter(member=member).values(
            "id",
            "year",
            "status",
            "start_date",
            "end_date",
        )
        from licenses.history import no_club_label

        locale = request.query_params.get("locale") or request.headers.get("Accept-Language")
        missing_club = no_club_label(locale)
        license_history = []
        for row in LicenseHistoryEvent.objects.filter(member=member).values(
            "id",
            "license_id",
            "club_id",
            "event_type",
            "event_at",
            "reason",
            "license_year",
            "status_before",
            "status_after",
            "club_name_snapshot",
            "order_id",
            "payment_id",
        ):
            if row["club_id"] is None:
                row["club_name_snapshot"] = missing_club
            license_history.append(row)
        grade_history = GradePromotionHistory.objects.filter(member=member).values(
            "id",
            "from_grade",
            "to_grade",
            "promotion_date",
            "exam_date",
            "proof_ref",
            "notes",
            "created_at",
        )
        profile_photo = None
        if member:
            has_photo = bool(member.profile_picture_processed or member.profile_picture_original)
            profile_photo = {
                "has_profile_picture": has_photo,
                "original_url": (
                    request.build_absolute_uri(member.profile_picture_original.url)
                    if member.profile_picture_original
                    else ""
                ),
                "processed_url": (
                    request.build_absolute_uri(member.profile_picture_processed.url)
                    if member.profile_picture_processed
                    else ""
                ),
                "thumbnail_url": (
                    request.build_absolute_uri(member.profile_picture_thumbnail.url)
                    if member.profile_picture_thumbnail
                    else ""
                ),
                "download_url": (
                    request.build_absolute_uri(
                        f"/api/members/{member.id}/profile-picture/download/"
                    )
                    if has_photo
                    else ""
                ),
                "photo_edit_metadata": member.photo_edit_metadata or {},
                "photo_consent_attested_at": member.photo_consent_attested_at,
                "photo_consent_attested_by": member.photo_consent_attested_by_id,
            }
        export = {
            "user": UserSerializer(request.user).data,
            "member": None,
            "profile_photo": profile_photo,
            "licenses": list(licenses),
            "license_history": list(license_history),
            "grade_history": list(grade_history),
        }
        if member:
            export["member"] = {
                "id": member.id,
                "first_name": member.first_name,
                "last_name": member.last_name,
                "belt_rank": member.belt_rank,
                "club_id": member.club_id,
            }
        return response.Response(export)


@extend_schema(
    request=EmptySerializer,
    responses=DataDeleteResponseSerializer,
)
class DataDeleteView(views.APIView):
    serializer_class = EmptySerializer

    def delete(self, request):
        from clubmgmt.models import MemberAddress, PersonAddress

        user_id = request.user.id
        members = list(Member.all_objects.filter(user=request.user))
        with transaction.atomic():
            for member in members:
                clear_member_profile_picture(member, clear_consent_attestation=True)
                GradePromotionHistory.objects.filter(member=member).update(
                    notes="",
                    proof_ref="",
                    metadata={"anonymized": True},
                )
                MemberAddress.objects.filter(member=member).delete()
            if members:
                # Person has no user column. The only link is the member this
                # person was converted into. Guardian contacts of other people
                # stay untouched.
                PersonAddress.objects.filter(person__converted_member__in=members).delete()
            request.user.delete()
        return response.Response({"deleted_user_id": user_id}, status=status.HTTP_200_OK)


@extend_schema(
    request=ResendVerificationSerializer,
    responses=DetailResponseSerializer,
)
class ResendVerificationView(views.APIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = ResendVerificationSerializer

    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        request.confirmation_locale = serializer.validated_data.get("locale")

        email_address = EmailAddress.objects.filter(email__iexact=email).first()
        if email_address and not email_address.verified:
            email_address.send_confirmation(request)

        return response.Response(
            {"detail": "If the email exists, a verification link has been sent."}
        )


@extend_schema(
    request=VerifyEmailSerializer,
    responses=DetailResponseSerializer,
)
class VerifyEmailView(views.APIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = VerifyEmailSerializer

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        key = serializer.validated_data["key"]

        confirmation = EmailConfirmationHMAC.from_key(key)
        if not confirmation:
            return response.Response(
                {"detail": "Invalid or expired verification key."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        confirmation.confirm(request)
        return response.Response({"detail": "Email verified successfully."})


@extend_schema(
    request=PasswordResetRequestSerializer,
    responses=DetailResponseSerializer,
)
class PasswordResetRequestView(views.APIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = PasswordResetRequestSerializer

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        locale = (
            serializer.validated_data.get("locale")
            or request.query_params.get("locale")
            or settings.FRONTEND_DEFAULT_LOCALE
        )

        user = User.objects.filter(email__iexact=email).first()
        if user:
            reset_url = build_password_reset_url(user, locale)
            ok, _ = send_password_reset_email(user, reset_url)

        return response.Response(
            {"detail": "If the email exists, a reset link has been sent."}
        )


@extend_schema(
    request=PasswordResetConfirmSerializer,
    responses=DetailResponseSerializer,
)
class PasswordResetConfirmView(views.APIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = PasswordResetConfirmSerializer

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uid = serializer.validated_data["uid"]
        token = serializer.validated_data["token"]
        password = serializer.validated_data["password"]

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            return response.Response(
                {"detail": "Invalid or expired reset link."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token_ok = PasswordResetTokenGenerator().check_token(user, token)

        if not token_ok:
            return response.Response(
                {"detail": "Invalid or expired reset link."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(password)
        user.is_email_verified = True
        user.save(update_fields=["password", "is_email_verified"])
        from allauth.account.signals import password_reset

        password_reset.send(sender=user.__class__, request=request._request, user=user)
        return response.Response({"detail": "Password reset successfully."})


class AccountSetupView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        invite, user = _open_setup_invite(request.query_params.get("token"))
        if invite is None or user is None:
            return _closed_setup_response(request.query_params.get("token"))
        member = Member.all_objects.filter(user=user).first()
        return response.Response(
            {
                "username": user.username,
                "first_name": member.first_name if member else user.first_name,
                "last_name": member.last_name if member else user.last_name,
                "assignments": account_setup_assignments(user),
            }
        )

    def post(self, request):
        invite, user = _open_setup_invite(request.data.get("token"))
        if invite is None or user is None:
            return _closed_setup_response(request.data.get("token"))
        email = str(request.data.get("email") or "").strip()
        password = str(request.data.get("password") or "")
        confirmation = str(request.data.get("password_confirm") or "")
        if not email or "@" not in email:
            return response.Response({"email": ["Enter a valid email address."]}, status=status.HTTP_400_BAD_REQUEST)
        if password != confirmation:
            return response.Response({"password_confirm": ["Passwords do not match."]}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists() or EmailAddress.objects.filter(email__iexact=email).exclude(user=user).exists():
            return response.Response({"email": ["That email is already used."]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(password, user=user)
        except DjangoValidationError as exc:
            return response.Response({"password": exc.messages}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            locked = AccountSetupInvite.objects.select_for_update().get(pk=invite.pk)
            if not invite_is_open(locked):
                return _closed_setup_response(request.data.get("token"))
            user.email = email
            user.is_email_verified = True
            user.set_password(password)
            user.save(update_fields=["email", "is_email_verified", "password"])
            address, _created = EmailAddress.objects.get_or_create(
                user=user,
                email=email,
                defaults={"verified": True, "primary": True},
            )
            EmailAddress.objects.filter(user=user).exclude(pk=address.pk).update(primary=False)
            if not address.verified or not address.primary:
                address.verified = True
                address.primary = True
                address.save(update_fields=["verified", "primary"])
            member = Member.all_objects.filter(user=user).first()
            if member is not None:
                member.email = email
                member.save(update_fields=["email", "updated_at"])
            locked.used_at = timezone.now()
            locked.save(update_fields=["used_at"])
        return response.Response({"detail": "Account ready."})


def _open_setup_invite(raw):
    invite = invite_for_token(str(raw or ""))
    if not invite_is_open(invite):
        return None, None
    return invite, invite.user


def _closed_setup_response(raw):
    """Why a link cannot be used, without the person's name, email, or clubs."""
    invite = invite_for_token(str(raw or ""))
    if invite is None:
        reason = "invalid"
    elif invite.used_at:
        reason = "used"
    elif invite.revoked_at:
        reason = "revoked"
    else:
        reason = "expired"
    return response.Response({"detail": NEUTRAL_DETAIL, "reason": reason}, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(
    request=EmptySerializer,
    responses=DetailResponseSerializer,
)
class ResendStatusView(views.APIView):
    serializer_class = EmptySerializer

    def get(self, request):
        if not request.user or request.user.role != "ltf_admin":
            return response.Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        api_key = settings.RESEND_API_KEY or ""
        return response.Response(
            {
                "detail": "Resend status",
                "resend_api_key_loaded": bool(api_key),
                "resend_api_key_length": len(api_key),
            }
        )
