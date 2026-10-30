"""Fold extra logins into the one account that should remain.

The folded account is set inactive and kept, so history can still name it.
Nothing here matches people by name. The superuser picks both sides.
"""

from __future__ import annotations

from django.contrib.auth import SESSION_KEY
from django.contrib.sessions.models import Session
from django.db import IntegrityError, transaction
from django.db.models import ForeignKey, ManyToManyField, OneToOneField
from django.utils import timezone
from rest_framework.authtoken.models import Token

from .models import DeskGrant, User

# These point at a login but are not "who did this". The merge handles them itself.
_SKIP = {
    ("members.Member", "user"),
    ("clubmgmt.Person", "user"),
    ("accounts.DeskGrant", "user"),
    ("accounts.DeskPreference", "user"),
    ("accounts.StaffMfaGrace", "user"),
    ("accounts.EmailMfa", "user"),
    ("accounts.EmailMfaCode", "user"),
    ("account.EmailAddress", "user"),
    ("mfa.Authenticator", "user"),
    ("authtoken.Token", "user"),
}


class MergeError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def display_name(user) -> str:
    last = (getattr(user, "last_name", "") or "").strip()
    first = (getattr(user, "first_name", "") or "").strip()
    if last or first:
        return f"{last} {first}".strip()
    return user.username


def _members(user):
    from members.models import Member

    return list(Member.all_objects.filter(user=user).select_related("club"))


def _member_row(member) -> dict:
    club = member.club.name if member.club_id else ""
    return {
        "id": member.id,
        "name": f"{member.last_name} {member.first_name}".strip(),
        "club": club,
        "user_id": member.user_id,
    }


def _user_fks():
    from django.apps import apps

    for model in apps.get_models():
        if model._meta.app_label in {"contenttypes", "sessions"}:
            continue
        for field in model._meta.get_fields():
            if getattr(field, "related_model", None) is not User:
                continue
            if getattr(field, "auto_created", False) and not getattr(field, "concrete", False):
                continue
            if not isinstance(field, (ForeignKey, OneToOneField, ManyToManyField)):
                continue
            yield model, field


def _counts(source) -> list[dict]:
    rows = []
    for model, field in _user_fks():
        if (model._meta.label, field.name) in _SKIP:
            continue
        if isinstance(field, ManyToManyField):
            count = model.objects.filter(**{field.name: source}).count()
        else:
            count = model.objects.filter(**{field.attname: source.id}).count()
        if count:
            rows.append({"model": model._meta.verbose_name, "field": field.name, "count": count})
    return rows


def _grant_rows(user) -> list[dict]:
    rows = []
    grants = DeskGrant.objects.filter(user=user).select_related("club")
    for grant in grants:
        rows.append(
            {
                "id": grant.id,
                "desk": grant.desk,
                "level": grant.level,
                "club": grant.club.name if grant.club_id else "",
                "source": grant.source,
                "open": grant.valid_until is None or grant.valid_until > timezone.localdate(),
            }
        )
    return rows


def _emails(source, survivor) -> list[dict]:
    from allauth.account.models import EmailAddress

    rows = []
    seen = set()
    for address in [source.email, *EmailAddress.objects.filter(user=source).values_list("email", flat=True)]:
        email = (address or "").strip()
        key = email.lower()
        if not email or key in seen:
            continue
        seen.add(key)
        if key == (survivor.email or "").lower():
            rows.append({"email": email, "action": "kept_login"})
            continue
        taken = EmailAddress.objects.filter(email__iexact=email).exclude(user=source).exists()
        other_user = User.objects.filter(email__iexact=email).exclude(pk__in=[source.id, survivor.id]).exists()
        if taken or other_user:
            rows.append({"email": email, "action": "already_taken"})
        else:
            rows.append({"email": email, "action": "secondary"})
    return rows


def _authenticators(user) -> list[str]:
    from allauth.mfa.models import Authenticator

    return list(Authenticator.objects.filter(user=user).values_list("type", flat=True))


def preview(survivor, folded: list) -> dict:
    profiles = []
    conflict = False
    survivor_members = _members(survivor)
    for source in folded:
        source_members = _members(source)
        if survivor_members and source_members:
            conflict = True
        profiles.append(
            {
                "user_id": source.id,
                "name": display_name(source),
                "members": [_member_row(member) for member in source_members],
            }
        )
    return {
        "survivor": {
            "id": survivor.id,
            "name": display_name(survivor),
            "email": survivor.email,
            "role": survivor.role,
            "members": [_member_row(member) for member in survivor_members],
            "authenticators": _authenticators(survivor),
        },
        "folded": [
            {
                "id": source.id,
                "name": display_name(source),
                "email": source.email,
                "role": source.role,
                "grants": _grant_rows(source),
                "emails": _emails(source, survivor),
                "authenticators": _authenticators(source),
                "clubs_administered": list(source.clubs_administered.values_list("name", flat=True)),
                "clubs_trained": list(source.clubs_trained.values_list("name", flat=True)),
                "records": _counts(source),
            }
            for source in folded
        ],
        "member_profiles": profiles,
        "member_conflict": conflict,
        "passkeys_note": "removed",
    }


def _check_pair(actor, survivor, source) -> None:
    if source.id == survivor.id:
        raise MergeError("same_account")
    if source.id == getattr(actor, "id", None):
        raise MergeError("cannot_fold_yourself")
    if not source.is_active:
        raise MergeError("already_inactive")
    if not survivor.is_active:
        raise MergeError("survivor_inactive")
    if source.is_superuser:
        left = User.objects.filter(is_superuser=True, is_active=True).exclude(pk=source.id).count()
        if left < 1:
            raise MergeError("last_superuser")


def _move_member(survivor, source, keep_member_id) -> None:
    from members.models import Member

    source_members = list(Member.all_objects.filter(user=source))
    survivor_members = list(Member.all_objects.filter(user=survivor))
    if source_members and survivor_members:
        if keep_member_id not in {member.id for member in source_members + survivor_members}:
            raise MergeError("member_conflict")
        for member in source_members + survivor_members:
            if member.id != keep_member_id and member.user_id in {source.id, survivor.id}:
                member.user = None
                member.save(update_fields=["user"])
        for member in source_members + survivor_members:
            if member.id == keep_member_id and member.user_id != survivor.id:
                member.user = survivor
                member.save(update_fields=["user"])
        return
    for member in source_members:
        member.user = survivor
        member.save(update_fields=["user"])


def _move_person(survivor, source) -> None:
    from clubmgmt.models import Person

    source_person = Person.objects.filter(user=source).first()
    if source_person is None:
        return
    if Person.objects.filter(user=survivor).exists():
        source_person.user = None
        source_person.save(update_fields=["user"])
        return
    source_person.user = survivor
    source_person.save(update_fields=["user"])


def _move_grants(survivor, source) -> list[dict]:
    today = timezone.localdate()
    moved = []
    for grant in list(DeskGrant.objects.filter(user=source)):
        duplicate = (
            DeskGrant.objects.filter(
                user=survivor,
                desk=grant.desk,
                club_id=grant.club_id,
                level=grant.level,
                source=grant.source,
            )
            .exclude(pk=grant.pk)
            .exists()
        )
        office_taken = False
        if grant.mandate_id and grant.source == DeskGrant.Source.OFFICE:
            office_taken = (
                DeskGrant.objects.filter(
                    mandate_id=grant.mandate_id,
                    desk=grant.desk,
                    level=grant.level,
                    source=DeskGrant.Source.OFFICE,
                )
                .exclude(pk=grant.pk)
                .exists()
            )
        if duplicate or office_taken:
            if grant.valid_until is None or grant.valid_until > today:
                grant.valid_until = today
                grant.save(update_fields=["valid_until"])
            moved.append({"id": grant.id, "desk": grant.desk, "action": "kept_existing"})
            continue
        grant.user = survivor
        grant.save(update_fields=["user"])
        moved.append({"id": grant.id, "desk": grant.desk, "action": "moved"})
    preference = getattr(source, "desk_preference", None)
    if preference is not None and not hasattr(survivor, "desk_preference"):
        preference.user = survivor
        preference.save(update_fields=["user"])
    return moved


def _move_authenticators(survivor, source, actor) -> dict:
    from allauth.mfa.models import Authenticator
    from ops.models import OpsAuditLog

    moved_types = []
    for kind in (Authenticator.Type.TOTP, Authenticator.Type.RECOVERY_CODES):
        row = Authenticator.objects.filter(user=source, type=kind).first()
        if row is None:
            continue
        if Authenticator.objects.filter(user=survivor, type=kind).exists():
            continue
        row.user = survivor
        row.save(update_fields=["user"])
        moved_types.append(kind)
    removed = 0
    for row in list(Authenticator.objects.filter(user=source, type=Authenticator.Type.WEBAUTHN)):
        row.delete()
        removed += 1
        OpsAuditLog.objects.create(
            actor=actor,
            action="passkey.removed",
            target_type="user",
            target_id=str(source.id),
            message="Passkey removed because the login was folded.",
            metadata={"survivor_id": survivor.id, "folded_id": source.id},
        )
    from .models import EmailMfa

    source_email = EmailMfa.objects.filter(user=source).first()
    if source_email is not None and not EmailMfa.objects.filter(user=survivor, enabled=True).exists():
        if EmailMfa.objects.filter(user=survivor).exists():
            EmailMfa.objects.filter(user=survivor).update(enabled=source_email.enabled)
            source_email.delete()
        else:
            source_email.user = survivor
            source_email.save(update_fields=["user"])
    return {"moved": moved_types, "passkeys_removed": removed}


def _move_emails(survivor, source) -> list[dict]:
    from allauth.account.models import EmailAddress

    done = []
    for row in list(EmailAddress.objects.filter(user=source)):
        if (row.email or "").lower() == (survivor.email or "").lower():
            row.delete()
            done.append({"email": row.email, "action": "kept_login"})
            continue
        if EmailAddress.objects.filter(email__iexact=row.email).exclude(pk=row.pk).exists():
            done.append({"email": row.email, "action": "already_taken"})
            continue
        row.user = survivor
        row.primary = False
        row.save(update_fields=["user", "primary"])
        done.append({"email": row.email, "action": "secondary"})
    return done


def _repoint(source, survivor) -> list[dict]:
    moved = []
    for model, field in _user_fks():
        if (model._meta.label, field.name) in _SKIP:
            continue
        if isinstance(field, ManyToManyField):
            count = 0
            for obj in model.objects.filter(**{field.name: source}).iterator():
                relation = getattr(obj, field.name)
                try:
                    with transaction.atomic():
                        relation.add(survivor)
                except IntegrityError:
                    pass
                relation.remove(source)
                count += 1
            if count:
                moved.append({"model": model._meta.label, "field": field.name, "count": count})
            continue
        queryset = model.objects.filter(**{field.attname: source.id})
        if not queryset.exists():
            continue
        if isinstance(field, OneToOneField) and model.objects.filter(**{field.attname: survivor.id}).exists():
            continue
        try:
            with transaction.atomic():
                count = queryset.update(**{field.attname: survivor.id})
        except IntegrityError:
            count = 0
            for obj in queryset.iterator():
                setattr(obj, field.attname, survivor.id)
                try:
                    with transaction.atomic():
                        obj.save(update_fields=[field.attname])
                    count += 1
                except IntegrityError:
                    continue
        if count:
            moved.append({"model": model._meta.label, "field": field.name, "count": count})
    return moved


def _expire_sessions(user) -> int:
    expired = 0
    user_key = str(user.pk)
    for session in Session.objects.filter(expire_date__gte=timezone.now()).iterator():
        try:
            data = session.get_decoded()
        except Exception:
            continue
        if str(data.get(SESSION_KEY) or "") == user_key:
            session.delete()
            expired += 1
    Token.objects.filter(user=user).delete()
    return expired


def _audit(actor, survivor, source, detail: dict) -> None:
    from ops.models import OpsAuditLog

    OpsAuditLog.objects.create(
        actor=actor,
        action="account.merged",
        target_type="user",
        target_id=str(survivor.id),
        message=f"Folded {display_name(source)} into {display_name(survivor)}.",
        metadata={
            "survivor_id": survivor.id,
            "folded_id": source.id,
            "folded_username": source.username,
            "survivor_username": survivor.username,
            **detail,
        },
    )


@transaction.atomic
def merge_accounts(actor, survivor, folded: list, keep_member_id: int | None = None) -> dict:
    if not folded:
        raise MergeError("nothing_to_fold")
    for source in folded:
        _check_pair(actor, survivor, source)
    for source in folded:
        _move_member(survivor, source, keep_member_id)
    results = []
    for source in folded:
        _move_person(survivor, source)
        grants = _move_grants(survivor, source)
        factors = _move_authenticators(survivor, source, actor)
        emails = _move_emails(survivor, source)
        records = _repoint(source, survivor)
        sessions = _expire_sessions(source)
        source.is_active = False
        source.save(update_fields=["is_active"])
        detail = {
            "grants": grants,
            "authenticators": factors,
            "emails": emails,
            "records": records,
            "sessions_expired": sessions,
            "keep_member_id": keep_member_id,
        }
        _audit(actor, survivor, source, detail)
        results.append({"id": source.id, **detail})
    return {"survivor_id": survivor.id, "folded": results}
