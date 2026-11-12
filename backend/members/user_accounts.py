"""Member logins: create, link, or copy a first-login link.

Creating a login does not send mail. A later invitation, from the result
panel only, sends the first-login link with the mailer the app already uses.
"""

from __future__ import annotations

import base64
import csv
import io
import re
from collections import defaultdict
from dataclasses import dataclass, field

from django.db.models import Case, CharField, Exists, OuterRef, Q, Value, When
from django.db.models.functions import Lower
from django.utils import timezone
from django.utils.crypto import get_random_string

from accounts.models import AccountSetupInvite, User
from accounts.setup_invites import issue_setup_invite, setup_link
from clubs.admin_assignment import build_username
from ops.login_links import WARNINGS, build_login_link_file, render_csv, render_pdf

from .models import Member

ACCOUNT_STATES = ("none", "pending", "active", "disabled")
STAFF_ROLES = {
    User.Roles.CLUB_ADMIN,
    User.Roles.COACH,
    User.Roles.LTF_ADMIN,
    User.Roles.LTF_FINANCE,
}
SKIP_REASONS = {
    "has_account",
    "no_birth_date",
    "no_guardian_email",
    "inactive",
    "needs_link",
    "staff_login",
    "linked_elsewhere",
}
PARENT_RELATIONS = ("father", "mother", "guardian")


def annotate_account_state(queryset):
    """One query: none, pending, active, or disabled. Invites stay in subqueries."""
    now = timezone.now()
    used = AccountSetupInvite.objects.filter(user_id=OuterRef("user_id"), used_at__isnull=False)
    open_invite = AccountSetupInvite.objects.filter(
        user_id=OuterRef("user_id"),
        used_at__isnull=True,
        revoked_at__isnull=True,
        expires_at__gt=now,
    )
    return queryset.annotate(
        has_used_setup_invite=Exists(used),
        has_open_setup_invite=Exists(open_invite),
    ).annotate(
        account_state=Case(
            When(user_id__isnull=True, then=Value("none")),
            When(user__is_active=False, then=Value("disabled")),
            When(has_used_setup_invite=True, then=Value("active")),
            When(user__last_login__isnull=False, then=Value("active")),
            When(has_open_setup_invite=True, then=Value("pending")),
            default=Value("active"),
            output_field=CharField(),
        )
    )


def account_state_value(member: Member) -> str:
    """Fallback when the row was not annotated. List views always annotate."""
    annotated = getattr(member, "account_state", None)
    if annotated in ACCOUNT_STATES:
        return annotated
    if not member.user_id or getattr(member, "user", None) is None:
        return "none"
    user = member.user
    if not user.is_active:
        return "disabled"
    invites = AccountSetupInvite.objects.filter(user_id=member.user_id)
    if invites.filter(used_at__isnull=False).exists() or user.last_login is not None:
        return "active"
    now = timezone.now()
    if invites.filter(used_at__isnull=True, revoked_at__isnull=True, expires_at__gt=now).exists():
        return "pending"
    return "active"


def age_years(dob, day) -> int:
    return day.year - dob.year - ((day.month, day.day) < (dob.month, dob.day))


def is_minor_on(dob, day) -> bool:
    """Completed years, same count as the club record's under-18 check."""
    if dob is None:
        return False
    return age_years(dob, day) < 18


def still_minor(member, day=None) -> bool:
    day = day or timezone.localdate()
    return is_minor_on(getattr(member, "date_of_birth", None), day)


def guardian_choices(member: Member) -> list[dict]:
    """Emails of father, mother, or guardian contacts. Invoice email wins for that person."""
    from clubmgmt.models import MemberContact

    contacts = (
        MemberContact.objects.filter(member=member, relation__in=PARENT_RELATIONS)
        .select_related("person")
        .prefetch_related("person__emails")
        .order_by("id")
    )
    rows: list[dict] = []
    seen: set[str] = set()
    for contact in contacts:
        emails = list(contact.person.emails.all())
        invoice = next((item.email for item in emails if item.use_for_invoice and str(item.email).strip()), "")
        first = next((item.email for item in emails if str(item.email).strip()), "")
        address = str(invoice or first or "").strip()
        key = address.lower()
        if not address or key in seen:
            continue
        seen.add(key)
        person = contact.person
        name = " ".join(
            part for part in (str(person.first_name or "").strip(), str(person.last_name or "").strip()) if part
        )
        rows.append(
            {
                "email": address,
                "name": name,
                "relation": contact.relation,
                "suggested": bool(contact.is_primary and invoice),
            }
        )
    return rows


def reset_destination(user) -> str:
    """Where a password reset may be sent. A minor's mail stops at 18."""
    if not getattr(user, "minor_account", False):
        return str(user.email or "").strip()
    member = getattr(user, "member_profile", None)
    if member is None or not still_minor(member):
        return ""
    return str(user.guardian_notice_email or "").strip()


def is_staff_login(user: User) -> bool:
    return bool(user.is_superuser or user.role in STAFF_ROLES)


def person_name(first_name: str, last_name: str) -> str:
    last = str(last_name or "").strip()
    first = str(first_name or "").strip()
    if last:
        last = last.upper()
    if first:
        first = first[:1].upper() + first[1:]
    return " ".join(part for part in (last, first) if part)


@dataclass
class AccountPlan:
    member: Member
    kind: str
    reason: str = ""
    username: str = ""
    match_user: User | None = None
    minor: bool = False
    guardian_choices: list = field(default_factory=list)

    def preview(self) -> dict:
        match = None
        if self.match_user is not None:
            match = {"user_id": self.match_user.id, "username": self.match_user.username}
        club = getattr(self.member, "club", None)
        return {
            "member_id": self.member.id,
            "name": person_name(self.member.first_name, self.member.last_name),
            "club_name": club.name if club is not None and self.member.club_id else "",
            "email": str(self.member.email or "").strip(),
            "account_state": account_state_value(self.member),
            "proposed_username": self.username,
            "reason": self.reason,
            "match": match,
            "can_create": self.kind == "create",
            "can_link": self.kind == "link",
            "can_copy": self.kind == "copy",
            "minor": self.minor,
            "guardian_choices": self.guardian_choices,
        }


def _email_index(members: list[Member]) -> tuple[dict[str, list[User]], dict[int, int]]:
    wanted = {str(member.email or "").strip().lower() for member in members}
    wanted.discard("")
    users_by_email: dict[str, list[User]] = defaultdict(list)
    if not wanted:
        return users_by_email, {}
    found = list(User.objects.annotate(email_key=Lower("email")).filter(email_key__in=wanted))
    for user in found:
        users_by_email[str(user.email or "").strip().lower()].append(user)
    linked_owner: dict[int, int] = {}
    if found:
        for row in Member.all_objects.filter(user_id__in=[user.id for user in found]).only("id", "user_id"):
            linked_owner[row.user_id] = row.id
    return users_by_email, linked_owner


def _match_for(member: Member, users_by_email: dict, linked_owner: dict) -> tuple[str, User | None]:
    email = str(member.email or "").strip().lower()
    if not email:
        return "", None
    matches = users_by_email.get(email) or []
    if not matches:
        return "", None
    for user in matches:
        owner = linked_owner.get(user.id)
        if owner is not None and owner != member.id:
            return "linked_elsewhere", user
    for user in matches:
        if is_staff_login(user):
            return "staff_login", user
    for user in matches:
        if user.role == User.Roles.MEMBER and not is_staff_login(user):
            owner = linked_owner.get(user.id)
            if owner is None:
                return "needs_link", user
    return "linked_elsewhere", matches[0]


def plan_member(member: Member, *, today, users_by_email, linked_owner, for_copy: bool = False) -> AccountPlan:
    if not member.is_active:
        return AccountPlan(member, "skip", "inactive")
    state = account_state_value(member)
    if for_copy:
        if state == "pending":
            username = member.user.username if member.user_id and member.user else ""
            return AccountPlan(member, "copy", username=username)
        if member.user_id:
            return AccountPlan(member, "skip", "has_account", username=getattr(member.user, "username", ""))
        return AccountPlan(member, "skip", "has_account")
    if member.user_id:
        username = member.user.username if member.user else ""
        return AccountPlan(member, "skip", "has_account", username=username)
    if member.date_of_birth is None:
        return AccountPlan(member, "skip", "no_birth_date")
    minor = is_minor_on(member.date_of_birth, today)
    choices = guardian_choices(member) if minor else []
    if minor and not choices:
        return AccountPlan(member, "skip", "no_guardian_email", minor=True)
    reason, match = _match_for(member, users_by_email, linked_owner)
    if reason == "needs_link" and match is not None:
        return AccountPlan(
            member, "link", "needs_link", username=match.username, match_user=match, minor=minor, guardian_choices=choices
        )
    if reason:
        username = match.username if match is not None else ""
        return AccountPlan(member, "skip", reason, username=username, match_user=match, minor=minor, guardian_choices=choices)
    return AccountPlan(member, "create", minor=minor, guardian_choices=choices)


def reserve_username(first_name: str, last_name: str, reserved: set[str]) -> str:
    username = build_username(first_name, last_name)
    if username not in reserved:
        reserved.add(username)
        return username
    base = f"{(first_name or '')[:1]}{last_name or ''}".lower()
    base = re.sub(r"[^a-z0-9]", "", base) or "member"
    base = base[:10]
    counter = 1
    while username in reserved or User.objects.filter(username=username).exists():
        suffix = str(counter)
        username = f"{base[: max(1, 10 - len(suffix))]}{suffix}"
        counter += 1
    reserved.add(username)
    return username


def plan_members(members: list[Member], *, for_copy: bool = False) -> list[AccountPlan]:
    today = timezone.localdate()
    if members:
        annotated = annotate_account_state(Member.objects.filter(id__in=[member.id for member in members]))
        states = {row.id: row.account_state for row in annotated}
    else:
        states = {}
    for member in members:
        member.account_state = states.get(member.id, account_state_value(member))
    users_by_email, linked_owner = _email_index(members)
    reserved: set[str] = set()
    plans = []
    for member in members:
        plan = plan_member(
            member,
            today=today,
            users_by_email=users_by_email,
            linked_owner=linked_owner,
            for_copy=for_copy,
        )
        if plan.kind == "create":
            plan.username = reserve_username(member.first_name, member.last_name, reserved)
        plans.append(plan)
    return plans


@dataclass
class AccountBatch:
    created_members: list[Member] = field(default_factory=list)
    issued_member_ids: list[int] = field(default_factory=list)
    linked: list[dict] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)
    needs_link: list[dict] = field(default_factory=list)
    created_users: list[User] = field(default_factory=list)
    copy_link: str = ""
    csv: str = ""
    pdf_base64: str = ""

    @property
    def created_count(self) -> int:
        return len(self.created_members)

    @property
    def linked_count(self) -> int:
        return len(self.linked)


def _skip(batch: AccountBatch, plan: AccountPlan) -> None:
    batch.skipped.append({"member_id": plan.member.id, "reason": plan.reason})
    if plan.reason == "needs_link" and plan.match_user is not None:
        batch.needs_link.append(
            {
                "member_id": plan.member.id,
                "user_id": plan.match_user.id,
                "username": plan.match_user.username,
            }
        )


def _create_login(member: Member, *, guardian_email: str = "") -> User:
    minor = is_minor_on(member.date_of_birth, timezone.localdate())
    # A child's login has no email. The guardian address is only where mail is sent.
    email = "" if minor else str(member.email or "").strip()
    user = User.objects.create_user(
        username=build_username(member.first_name, member.last_name),
        email=email,
        password=get_random_string(32),
        role=User.Roles.MEMBER,
        first_name=member.first_name,
        last_name=member.last_name,
    )
    if minor:
        user.minor_account = True
        user.guardian_notice_email = guardian_email
        user.save(update_fields=["minor_account", "guardian_notice_email", "updated_at"])
    member.user = user
    member.save(update_fields=["user", "updated_at"])
    return user


def _setup_finished(user: User) -> bool:
    invites = AccountSetupInvite.objects.filter(user=user)
    if invites.filter(used_at__isnull=False).exists():
        return True
    now = timezone.now()
    open_invite = invites.filter(used_at__isnull=True, revoked_at__isnull=True, expires_at__gt=now).exists()
    return bool(user.has_usable_password() and not open_invite)


def _link_login(member: Member, user: User, actor, locale: str) -> str:
    member.user = user
    member.save(update_fields=["user", "updated_at"])
    if _setup_finished(user):
        return ""
    _invite, raw = issue_setup_invite(user, actor)
    return setup_link(raw, locale if locale in WARNINGS else "en")


def _file_for(created_users: list[User], plans: list[AccountPlan], locale: str, actor) -> tuple[str, str, str]:
    if not created_users:
        return "", "", ""
    locale_code = locale if locale in WARNINGS else "en"
    built = build_login_link_file(users=created_users, link_type="first_login", locale=locale_code, actor=actor)
    live_rows = list(csv.DictReader(io.StringIO(built["csv"])))
    copy_link = live_rows[0]["link"] if len(created_users) == 1 and live_rows else ""
    created_ids = {user.id for user in created_users}
    skipped_rows = []
    for plan in plans:
        if plan.kind == "create":
            continue
        if plan.member.user_id in created_ids:
            continue
        skipped_rows.append(
            {
                "username": plan.username,
                "name": person_name(plan.member.first_name, plan.member.last_name),
                "link_type": "first_login",
                "link": "",
                "expiry": "",
                "skipped": plan.reason,
            }
        )
    rows = live_rows + skipped_rows
    pdf_bytes = render_pdf(rows, WARNINGS[locale_code])
    return render_csv(rows), base64.b64encode(pdf_bytes).decode("ascii"), copy_link


def apply_plans(
    plans: list[AccountPlan],
    *,
    action: str,
    actor,
    locale: str,
    guardian_by_member: dict[int, str] | None = None,
) -> AccountBatch:
    batch = AccountBatch()
    for plan in plans:
        if action == "copy_link":
            if plan.kind != "copy" or not plan.member.user_id:
                _skip(batch, plan if plan.reason else AccountPlan(plan.member, "skip", "has_account"))
                continue
            _invite, raw = issue_setup_invite(plan.member.user, actor)
            batch.copy_link = setup_link(raw, locale if locale in WARNINGS else "en")
            batch.issued_member_ids.append(plan.member.id)
            continue
        if action == "link":
            if plan.kind != "link" or plan.match_user is None:
                reason = plan.reason or "has_account"
                _skip(batch, plan if plan.reason else AccountPlan(plan.member, "skip", reason))
                continue
            link = _link_login(plan.member, plan.match_user, actor, locale)
            batch.linked.append(
                {"member_id": plan.member.id, "user_id": plan.match_user.id, "username": plan.match_user.username}
            )
            if link and not batch.copy_link:
                batch.copy_link = link
            continue
        if plan.kind != "create":
            _skip(batch, plan)
            continue
        chosen = ""
        if plan.minor:
            chosen = str((guardian_by_member or {}).get(plan.member.id) or "").strip()
            allowed = {row["email"].lower() for row in plan.guardian_choices}
            if chosen.lower() not in allowed:
                _skip(batch, AccountPlan(plan.member, "skip", "no_guardian_email", minor=True))
                continue
        user = _create_login(plan.member, guardian_email=chosen)
        batch.created_users.append(user)
        batch.created_members.append(plan.member)
    if action == "create":
        batch.csv, batch.pdf_base64, batch.copy_link = _file_for(batch.created_users, plans, locale, actor)
    elif action == "copy_link" and len(batch.created_members) == 1:
        pass
    return batch


def created_rows(members: list[Member], users: list[User]) -> list[dict]:
    rows = []
    for member, user in zip(members, users, strict=True):
        club = member.club if member.club_id else None
        rows.append(
            {
                "member_id": member.id,
                "name": person_name(member.first_name, member.last_name),
                "username": user.username,
                "email": str(member.email or "").strip(),
                "invite_email": (
                    str(user.guardian_notice_email or "").strip()
                    if user.minor_account
                    else str(member.email or "").strip()
                ),
                "minor_account": bool(user.minor_account),
                "club_name": club.name if club is not None else "",
            }
        )
    return rows


def invite_language(member: Member, screen_locale: str) -> str:
    from clubs.document_copy import resolve_document_language

    club = member.club if member.club_id else None
    if club is not None:
        return resolve_document_language(club=club, prefer_club=True, explicit=screen_locale)
    return resolve_document_language(explicit=screen_locale)


def send_created_invites(members: list[Member], *, actor, screen_locale: str) -> dict:
    """Email the current first-login link. A new link replaces the older one."""
    from accounts.email_utils import send_member_invite_email

    sent = 0
    missing_email = 0
    failed = 0
    for member in members:
        user = getattr(member, "user", None)
        if user is None or is_staff_login(user):
            continue
        if user.minor_account:
            email = reset_destination(user)
        else:
            email = str(member.email or "").strip()
        if not email:
            missing_email += 1
            continue
        language = invite_language(member, screen_locale)
        _invite, raw = issue_setup_invite(user, actor)
        if user.minor_account:
            from accounts.email_utils import send_minor_invite_email

            ok, _error = send_minor_invite_email(
                user,
                setup_link(raw, language),
                language,
                person_name(member.first_name, member.last_name),
                email,
            )
        else:
            ok, _error = send_member_invite_email(
                user,
                setup_link(raw, language),
                language,
                person_name(member.first_name, member.last_name),
            )
        if ok:
            sent += 1
        else:
            failed += 1
    return {"sent": sent, "missing_email": missing_email, "failed": failed}


def readable_members(request):
    from accounts.desks import current_desk, holds_desk, scope_to_active_club

    user = request.user
    desk = current_desk()
    qs = Member.objects.select_related("user", "club")
    if desk == "ops" and user.is_superuser:
        base = qs
    elif holds_desk(user, "ltf_admin") or holds_desk(user, "ltf_finance"):
        base = qs
    elif desk == "club_admin" and user.is_superuser:
        base = qs
    elif user.role == "club_admin" or desk == "club_admin":
        base = qs.filter(club__admins=user) if user.role == "club_admin" else qs.none()
    elif user.role == "coach" or desk == "coach":
        base = qs.filter(Q(club__admins=user) | Q(club__trainers=user)).distinct()
    else:
        base = qs.filter(user=user)
    return scope_to_active_club(request, base, "club_id")


def mint_allowed(request) -> bool:
    from accounts.desks import current_active_club, current_desk

    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    if getattr(request, "desk_read_only", False):
        return False
    desk = current_desk()
    if desk in {"ltf_finance", "coach", "member"}:
        return False
    if desk == "ops":
        return bool(user.is_superuser)
    if desk == "ltf_admin":
        return True
    if desk == "club_admin":
        return current_active_club() is not None
    if user.is_superuser and user.role not in {User.Roles.LTF_ADMIN, User.Roles.CLUB_ADMIN}:
        return False
    return user.role in {User.Roles.LTF_ADMIN, User.Roles.CLUB_ADMIN}


def desk_label(request) -> str:
    from accounts.desks import current_desk

    return current_desk() or getattr(request.user, "role", "") or ""
