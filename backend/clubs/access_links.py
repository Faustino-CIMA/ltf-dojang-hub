"""Single and bulk set-password links for club admins."""

from __future__ import annotations

import csv
import io
from datetime import timedelta

from allauth.account.models import EmailAddress
from django.core.cache import cache
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.email_utils import build_password_reset_url
from accounts.models import User
from accounts.setup_invites import issue_setup_invite, setup_link
from members.models import Member
from ops.request_utils import write_ops_audit

from .access_link_mail import normalize_locale, send_access_email
from .admin_assignment import home_club_id
from .models import Club

RATE_LIMIT = 30
RATE_WINDOW_SECONDS = 3600
SINGLE_EXPIRY = timedelta(days=7)
CSV_EXPIRY = timedelta(hours=48)
FEDERATION_ROLES = {User.Roles.LTF_ADMIN, User.Roles.LTF_FINANCE}


class AccessLinkError(Exception):
    def __init__(self, detail: str, status_code: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def is_privileged(user) -> bool:
    return bool(user and user.is_authenticated and (user.is_superuser or user.role == User.Roles.LTF_ADMIN))


def is_link_target(user) -> bool:
    if user is None or user.role in FEDERATION_ROLES:
        return False
    return user.clubs_administered.exists()


def actor_may_link(actor, target) -> bool:
    if not is_link_target(target):
        return False
    if is_privileged(actor):
        return True
    if getattr(actor, "role", None) != User.Roles.CLUB_ADMIN:
        return False
    home_id = home_club_id(actor)
    if not home_id or not Club.objects.filter(pk=home_id, admins=actor).exists():
        return False
    return Club.objects.filter(pk=home_id, admins=target).exists()


def never_set_password(user) -> bool:
    if user.has_usable_password():
        return False
    return not user.account_setup_invites.filter(used_at__isnull=False).exists()


def access_state(user) -> dict:
    invites = list(user.account_setup_invites.all())
    latest = invites[0] if invites else None
    used = any(item.used_at for item in invites)
    if latest is None:
        link_status = "none"
    elif latest.used_at:
        link_status = "used"
    elif latest.revoked_at:
        link_status = "revoked"
    elif latest.expires_at <= timezone.now():
        link_status = "expired"
    else:
        link_status = "active"
    show_dates = link_status in {"active", "expired"}
    return {
        "password_set": bool(user.has_usable_password() and (user.last_login or used)),
        "link_status": link_status,
        "link_sent_at": latest.created_at.isoformat() if latest and show_dates else None,
        "link_expires_at": latest.expires_at.isoformat() if latest and show_dates else None,
        "access_kind": "setup" if never_set_password(user) else "reset",
    }


def _reserve(actor_id: int, count: int) -> None:
    if count <= 0:
        return
    key = f"club-admin-access-link:{actor_id}"
    now = timezone.now().timestamp()
    bucket = cache.get(key)
    if not isinstance(bucket, dict) or now - float(bucket.get("start", 0)) >= RATE_WINDOW_SECONDS:
        bucket = {"start": now, "count": 0}
    if int(bucket["count"]) + count > RATE_LIMIT:
        raise AccessLinkError("rate_limited", 429)
    bucket["count"] = int(bucket["count"]) + count
    remaining = RATE_WINDOW_SECONDS - (now - float(bucket["start"]))
    cache.set(key, bucket, timeout=max(1, int(remaining)))


def _email_change(actor, user, requested: str | None) -> str | None:
    """Return the address to store, or None when the email stays as it is."""
    new_email = str(requested or "").strip()
    current = str(user.email or "").strip()
    if not new_email or new_email.lower() == current.lower():
        return None
    if current and not is_privileged(actor):
        raise AccessLinkError("email_change_forbidden", 403)
    taken = User.objects.filter(email__iexact=new_email).exclude(pk=user.pk).exclude(email="").exists()
    if taken or EmailAddress.objects.filter(email__iexact=new_email).exclude(user=user).exists():
        raise AccessLinkError("email_in_use", 400)
    return new_email


def _store_email(user, new_email: str) -> None:
    user.email = new_email
    user.save(update_fields=["email"])
    member = Member.all_objects.filter(user=user).first()
    if member is not None and not str(member.email or "").strip():
        member.email = new_email
        member.save(update_fields=["email", "updated_at"])


def _club_names(user) -> str:
    return ", ".join(user.clubs_administered.order_by("name").values_list("name", flat=True))


def issue_for_user(request, user, *, delivery: str, email: str | None, locale: str) -> dict:
    if delivery not in {"email", "copy", "both"}:
        raise AccessLinkError("invalid_delivery", 400)
    if not actor_may_link(request.user, user):
        raise AccessLinkError("Not allowed.", 403)
    new_email = _email_change(request.user, user, email)
    resulting = new_email if new_email is not None else str(user.email or "").strip()
    kind = "setup" if never_set_password(user) else "reset"
    if delivery in {"email", "both"} and not resulting:
        raise AccessLinkError("email_required", 400)
    _reserve(request.user.id, 1)
    locale_code = normalize_locale(locale)
    email_sent = False
    email_error = None
    expires_at = None
    link = ""
    with transaction.atomic():
        if new_email is not None:
            _store_email(user, new_email)
        if kind == "setup":
            invite, raw = issue_setup_invite(user, request.user, expires_in=SINGLE_EXPIRY)
            link = setup_link(raw, locale_code)
            expires_at = invite.expires_at
        else:
            link = build_password_reset_url(user, locale_code)
    if delivery in {"email", "both"}:
        expires_label = ""
        if expires_at is not None:
            expires_label = timezone.localtime(expires_at).strftime("%Y-%m-%d %H:%M")
        email_sent, email_error = send_access_email(
            user,
            kind=kind,
            url=link,
            locale=locale_code,
            clubs=_club_names(user),
            expires=expires_label,
        )
    reveal = delivery in {"copy", "both"} or not email_sent
    write_ops_audit(
        request,
        action="club_admin_access_link",
        target_type="user",
        target_id=user.id,
        message=f"Issued a {kind} link for {user.username} ({delivery}).",
        metadata={"kind": kind, "delivery": delivery, "email_sent": bool(email_sent)},
    )
    return {
        "kind": kind,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "email_sent": bool(email_sent),
        "email_error": email_error or None,
        "link": link if reveal else "",
    }


def issue_csv(request, user_ids, locale: str) -> HttpResponse:
    if not is_privileged(request.user):
        raise AccessLinkError("Not allowed.", 403)
    if not isinstance(user_ids, list) or not user_ids:
        raise AccessLinkError("user_ids is required.", 400)
    wanted = []
    seen = set()
    for item in user_ids:
        try:
            user_id = int(item)
        except (TypeError, ValueError):
            continue
        if user_id in seen:
            continue
        seen.add(user_id)
        wanted.append(user_id)
    users = {user.id: user for user in User.objects.filter(id__in=wanted).prefetch_related("account_setup_invites", "clubs_administered")}
    eligible = []
    skipped = []
    for user_id in wanted:
        user = users.get(user_id)
        if user is None or not is_link_target(user):
            skipped.append(user_id)
            continue
        if not never_set_password(user):
            skipped.append(user_id)
            continue
        eligible.append(user)
    _reserve(request.user.id, len(eligible))
    locale_code = normalize_locale(locale)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["username", "last_name", "first_name", "email", "clubs", "link", "expires_at", "kind"])
    with transaction.atomic():
        for user in eligible:
            invite, raw = issue_setup_invite(user, request.user, expires_in=CSV_EXPIRY)
            clubs = "; ".join(club.name for club in user.clubs_administered.all())
            writer.writerow(
                [
                    user.username,
                    user.last_name,
                    user.first_name,
                    user.email or "",
                    clubs,
                    setup_link(raw, locale_code),
                    invite.expires_at.isoformat(),
                    "setup",
                ]
            )
    write_ops_audit(
        request,
        action="club_admin_access_links_csv",
        target_type="user",
        target_id="",
        message=f"Downloaded {len(eligible)} club admin setup links.",
        metadata={"count": len(eligible), "user_ids": [user.id for user in eligible], "skipped_ids": skipped},
    )
    filename = f"club-admin-links-CONFIDENTIAL-{timezone.localdate().isoformat()}.csv"
    response = HttpResponse(buffer.getvalue(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response["X-Access-Links-Skipped"] = str(len(skipped))
    return response


class ClubAdminAccessLinkView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, user_id: int):
        user = User.objects.filter(pk=user_id).first()
        if user is None:
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        try:
            payload = issue_for_user(
                request,
                user,
                delivery=str(request.data.get("delivery") or ""),
                email=request.data.get("email"),
                locale=str(request.data.get("locale") or "en"),
            )
        except AccessLinkError as error:
            return Response({"detail": error.detail}, status=error.status_code)
        return Response(payload)


class ClubAdminAccessLinksCsvView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            return issue_csv(request, request.data.get("user_ids"), str(request.data.get("locale") or "en"))
        except AccessLinkError as error:
            return Response({"detail": error.detail}, status=error.status_code)
