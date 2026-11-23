"""Compare card text with a member and lock the legal fields when it matches.

The photo never arrives here. Callers must reject an image before this module
sees the body. The audit row stores names, date of birth, and sex. It does
not store the social security number.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import unicodedata
from dataclasses import dataclass
from datetime import date

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from accounts.desks import holds_desk

from .ssn_countries import (
    SsnError,
    belgian_century_matches,
    birth_agrees,
    compact_ssn,
    encoded_sex,
)

LOCKED_FIELD_NAMES = (
    "first_name",
    "last_name",
    "date_of_birth",
    "sex",
    "social_security_number",
)
_LOCKED_MESSAGE = "This field is locked. Unlock the member before changing it."
_COMPARE_LIMIT = 30
_COMPARE_WINDOW_SECONDS = 60 * 60


class VerificationError(Exception):
    def __init__(self, code: str, fields=()):
        self.code = code
        self.fields = tuple(fields)
        super().__init__(code)


@dataclass(frozen=True)
class CardText:
    first_names: str
    last_names: str
    number: str
    date_of_birth: date | None
    sex: str
    confirm_names: bool | None
    keep_usual_name: bool


@dataclass(frozen=True)
class CompareResult:
    match: bool
    fields: tuple[str, ...] = ()
    reason: str = ""
    card_first_name: str = ""
    card_last_name: str = ""


def _fold(value: str) -> list[str]:
    text = (value or "").replace("’", "'").replace("`", "'").replace("'", "")
    text = text.replace("-", " ")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.lower()
    text = re.sub(r"\s+", " ", text).strip()
    return [part for part in text.split(" ") if part]


def _distance_one(left: str, right: str) -> bool:
    if abs(len(left) - len(right)) > 1 or len(left) > 40 or len(right) > 40:
        return False
    if len(left) == len(right):
        return sum(a != b for a, b in zip(left, right)) == 1
    if len(left) < len(right):
        left, right = right, left
    # One extra character in `left`.
    shift = 0
    for index, char in enumerate(right):
        if char != left[index + shift]:
            if shift:
                return False
            shift = 1
            if char != left[index + shift]:
                return False
    return True


def _token_on_card(token: str, card_tokens: list[str]) -> bool:
    if token in card_tokens:
        return True
    if len(token) < 5:
        return False
    return any(_distance_one(token, candidate) for candidate in card_tokens)


def names_match(entered: str, card: str) -> bool:
    entered_tokens = _fold(entered)
    card_tokens = _fold(card)
    if not entered_tokens or not card_tokens:
        return False
    return all(_token_on_card(token, card_tokens) for token in entered_tokens)


def read_card_text(data) -> CardText:
    if data is None or not hasattr(data, "get"):
        raise VerificationError("invalid")
    first_names = str(data.get("first_names") or "").strip()
    last_names = str(data.get("last_names") or "").strip()
    if len(first_names) > 150 or len(last_names) > 150:
        raise VerificationError("name_too_long")
    number = str(data.get("number") or "").strip()
    if len(number) > 32:
        raise VerificationError("number_too_long")
    raw_date = str(data.get("date_of_birth") or "").strip()
    parsed_date = None
    if raw_date:
        try:
            parsed_date = date.fromisoformat(raw_date)
        except ValueError as exc:
            raise VerificationError("date") from exc
    sex = str(data.get("sex") or "").strip().upper()
    if sex and sex not in ("M", "F"):
        raise VerificationError("sex")
    confirm = None
    if "confirm_names" in data and data.get("confirm_names") is not None:
        confirm = data.get("confirm_names")
        if not isinstance(confirm, bool):
            raise VerificationError("confirm_names")
    return CardText(
        first_names=first_names,
        last_names=last_names,
        number=number,
        date_of_birth=parsed_date,
        sex=sex,
        confirm_names=confirm,
        keep_usual_name=data.get("keep_usual_name") is True,
    )


def _verification_row(member):
    from .models import MemberVerification

    # Query by id. The reverse one-to-one cache stays empty after a miss, so a
    # later read on the same instance would still look unverified.
    return MemberVerification.objects.filter(member_id=member.pk).first()


def is_verified(member) -> bool:
    row = _verification_row(member)
    return bool(row and row.status == row.Status.VERIFIED)


def verification_state(member, session_key: str = "") -> dict:
    country, number = _stored_number(member)
    has_number = bool(str(number or "").strip())
    row = _verification_row(member)
    if row is None or row.status != row.Status.VERIFIED:
        state = {
            "status": "unverified",
            "verified": False,
            "method": "",
            "verified_at": None,
            "locked_fields": [],
        }
    else:
        state = {
            "status": "verified",
            "verified": True,
            "method": row.method,
            "verified_at": row.verified_at,
            "locked_fields": list(row.locked_fields or []),
        }
    state["has_number"] = has_number
    state["country"] = country if has_number else ""
    open_challenge = _open_challenge(member, session_key)
    state["challenge_open"] = open_challenge is not None
    state["challenge_expires_at"] = open_challenge.expires_at if open_challenge is not None else None
    return state


def can_verify_member(user, member) -> bool:
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "role", "") == "coach":
        return False
    if holds_desk(user, "ltf_admin"):
        return True
    if getattr(user, "role", "") != "club_admin" or not getattr(member, "club_id", None):
        return False
    return member.club.admins.filter(pk=user.pk).exists()


def compare_is_limited(user_id: int, member_id: int) -> bool:
    key = f"member-verify:{user_id}:{member_id}"
    if cache.add(key, 1, timeout=_COMPARE_WINDOW_SECONDS):
        return False
    try:
        count = cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=_COMPARE_WINDOW_SECONDS)
        return False
    return count > _COMPARE_LIMIT


def _stored_number(member):
    from django.core.exceptions import ObjectDoesNotExist

    try:
        record = member.club_record
    except ObjectDoesNotExist:
        return "", ""
    country = (record.social_security_country or "").strip().upper() or "LU"
    return country, record.social_security_number or ""


def _same_number(stored: str, extracted: str) -> bool:
    if len(stored) != len(extracted):
        return False
    return hmac.compare_digest(stored.encode(), extracted.encode())


def compare_member(member, card: CardText) -> CompareResult:
    country, stored = _stored_number(member)
    if not stored:
        raise VerificationError("missing_number")
    if not card.number:
        return CompareResult(False, ("number",))
    try:
        extracted = compact_ssn(country, card.number)
    except SsnError as exc:
        reason = "health_card" if exc.ssn_code == "health_card" else ""
        return CompareResult(False, ("number",), reason)
    try:
        stored_compact = compact_ssn(country, stored)
    except SsnError:
        stored_compact = re.sub(r"[\s.\-]", "", stored).upper()
    if not _same_number(stored_compact, extracted):
        return CompareResult(False, ("number",))
    if country == "BE" and not belgian_century_matches(extracted, member.date_of_birth):
        return CompareResult(False, ("number",))

    fields: list[str] = []
    if not names_match(member.first_name, card.first_names):
        fields.append("first_name")
    if not names_match(member.last_name, card.last_names):
        fields.append("last_name")
    if member.date_of_birth and card.date_of_birth and card.date_of_birth != member.date_of_birth:
        fields.append("date_of_birth")
    elif not birth_agrees(country, extracted, member.date_of_birth):
        fields.append("date_of_birth")
    printed_sex = card.sex
    number_sex = encoded_sex(country, extracted)
    record_sex = (member.sex or "").upper()
    if record_sex:
        if printed_sex and printed_sex != record_sex:
            fields.append("sex")
        elif number_sex and number_sex != record_sex and "sex" not in fields:
            fields.append("sex")
    if fields:
        return CompareResult(False, tuple(fields))
    return CompareResult(
        True,
        card_first_name=card.first_names,
        card_last_name=card.last_names,
    )


def _values_differ(current, new) -> bool:
    if current == new:
        return False
    return str(current or "") != str(new or "")


def ensure_member_update_unlocked(member, attrs: dict) -> None:
    if not is_verified(member):
        return
    errors = {}
    for field in ("first_name", "last_name", "date_of_birth", "sex"):
        if field in attrs and _values_differ(getattr(member, field), attrs[field]):
            errors[field] = _LOCKED_MESSAGE
    if "social_security_number" in attrs or "social_security_country" in attrs:
        country, stored = _stored_number(member)
        if "social_security_number" in attrs and _values_differ(
            stored, str(attrs.get("social_security_number") or "").strip()
        ):
            errors["social_security_number"] = _LOCKED_MESSAGE
        if "social_security_country" in attrs and _values_differ(
            country, str(attrs.get("social_security_country") or "").strip().upper()
        ):
            errors["social_security_country"] = _LOCKED_MESSAGE
    if errors:
        raise ValidationError(errors)


def ensure_record_update_unlocked(record, attrs: dict) -> None:
    member = record.member
    if not is_verified(member):
        return
    errors = {}
    if "social_security_number" in attrs and _values_differ(
        record.social_security_number, attrs.get("social_security_number")
    ):
        errors["social_security_number"] = _LOCKED_MESSAGE
    if "social_security_country" in attrs and _values_differ(
        record.social_security_country, str(attrs.get("social_security_country") or "").strip().upper()
    ):
        errors["social_security_country"] = _LOCKED_MESSAGE
    if errors:
        raise ValidationError(errors)


def _audit(member, actor, action: str, *, reason: str, fields: list[str], old: dict, new: dict) -> None:
    from ops.models import OpsAuditLog
    from ops.verification_audit import verification_audit_message, verification_audit_metadata

    from .models import MemberVerificationEvent

    authenticated = actor if getattr(actor, "is_authenticated", False) else None
    event = MemberVerificationEvent.objects.create(
        member=member,
        actor=authenticated,
        action=action,
        reason=reason,
        fields=fields,
        old_first_name=old["first_name"],
        new_first_name=new["first_name"],
        old_last_name=old["last_name"],
        new_last_name=new["last_name"],
        old_date_of_birth=old["date_of_birth"],
        new_date_of_birth=new["date_of_birth"],
        old_sex=old["sex"],
        new_sex=new["sex"],
        ssn_changed=False,
    )
    club_name = ""
    club = getattr(member, "club", None)
    if club is not None:
        club_name = getattr(club, "name", "") or ""
    OpsAuditLog.objects.create(
        actor=authenticated,
        action=f"member_verification.{action}",
        target_type="member",
        target_id=str(member.pk),
        message=verification_audit_message(
            action=action,
            last_name=member.last_name,
            first_name=member.first_name,
            club_name=club_name,
            reason=reason,
        ),
        metadata=verification_audit_metadata(
            event_id=event.id,
            fields=fields,
            ssn_changed=event.ssn_changed,
            club_id=getattr(member, "club_id", None),
            club_name=club_name,
            old=old,
            new=new,
        ),
    )


@transaction.atomic
def lock_member(member, card: CardText, *, actor) -> None:
    from clubmgmt.models import MemberRecord

    from .models import Member, MemberVerification

    member = Member.objects.select_for_update().get(pk=member.pk)
    MemberRecord.objects.select_for_update().filter(member_id=member.pk).first()
    if is_verified(member):
        raise VerificationError("verified")
    result = compare_member(member, card)
    if not result.match:
        raise VerificationError("mismatch", result.fields)
    old = {
        "first_name": member.first_name,
        "last_name": member.last_name,
        "date_of_birth": member.date_of_birth,
        "sex": member.sex,
    }
    new = dict(old)
    if card.confirm_names:
        # The member form already stores given names in title case and surnames in capitals.
        new["first_name"] = Member.normalize_first_name(card.first_names)
        new["last_name"] = Member.normalize_last_name(card.last_names)
        if (
            card.keep_usual_name
            and not (member.usual_name or "").strip()
            and (new["first_name"] != old["first_name"] or new["last_name"] != old["last_name"])
        ):
            member.usual_name = f"{old['first_name']} {old['last_name']}".strip()[:150]
        member.first_name = new["first_name"]
        member.last_name = new["last_name"]
        member.save(update_fields=["first_name", "last_name", "usual_name", "updated_at"])
    MemberVerification.objects.update_or_create(
        member=member,
        defaults={
            "status": MemberVerification.Status.VERIFIED,
            "verified_at": timezone.now(),
            "verified_by": actor if getattr(actor, "is_authenticated", False) else None,
            "method": MemberVerification.Method.CARD,
            "locked_fields": list(LOCKED_FIELD_NAMES),
        },
    )
    _audit(
        member,
        actor,
        "verify",
        reason="",
        fields=list(LOCKED_FIELD_NAMES),
        old=old,
        new=new,
    )


@transaction.atomic
def unlock_member(member, *, actor, reason: str) -> None:
    from .models import Member, MemberVerification

    member = Member.objects.select_for_update().get(pk=member.pk)
    row = _verification_row(member)
    if row is None or row.status != MemberVerification.Status.VERIFIED:
        raise VerificationError("not_verified")
    reason = str(reason or "").strip()
    if not reason:
        raise VerificationError("reason")
    if len(reason) > 500:
        raise VerificationError("reason_too_long")
    current = {
        "first_name": member.first_name,
        "last_name": member.last_name,
        "date_of_birth": member.date_of_birth,
        "sex": member.sex,
    }
    row.status = MemberVerification.Status.UNVERIFIED
    row.locked_fields = []
    row.verified_at = None
    row.verified_by = None
    row.method = ""
    row.save(
        update_fields=["status", "locked_fields", "verified_at", "verified_by", "method"]
    )
    _audit(
        member,
        actor,
        "unlock",
        reason=reason,
        fields=list(LOCKED_FIELD_NAMES),
        old=current,
        new=current,
    )


_CHALLENGE_MINUTES = 10
_GUESS_LIMIT = 30


def request_session_key(request) -> str:
    """Bind a code to the desktop sign-in, even when a cookie is also present."""
    authorization = str(request.headers.get("Authorization") or "")
    if authorization.lower().startswith("token "):
        return authorization.split(" ", 1)[1].strip()[:128]
    header = str(request.headers.get("X-Session-Token") or "")
    if header:
        return header[:128]
    auth = getattr(request, "auth", None)
    for attr in ("session_key", "key"):
        value = getattr(auth, attr, None)
        if value:
            return str(value)[:128]
    django_request = getattr(request, "_request", request)
    session = getattr(django_request, "_allauth_token_session", None)
    return str(getattr(session, "session_key", "") or "")[:128]


def _token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _open_challenge(member, session_key: str):
    from .models import VerificationChallenge

    return (
        VerificationChallenge.objects.filter(
            member=member,
            session_key=session_key,
            used_at__isnull=True,
            cancelled_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .order_by("-id")
        .first()
    )


def create_challenge(member, *, actor, session_key: str) -> tuple[str, object]:
    from .models import VerificationChallenge

    if is_verified(member):
        raise VerificationError("verified")
    _country, number = _stored_number(member)
    if not str(number or "").strip():
        raise VerificationError("missing_number")
    now = timezone.now()
    VerificationChallenge.objects.filter(
        member=member,
        session_key=session_key,
        used_at__isnull=True,
        cancelled_at__isnull=True,
    ).update(cancelled_at=now)
    raw = secrets.token_urlsafe(32)
    row = VerificationChallenge.objects.create(
        member=member,
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
        session_key=session_key,
        token_hash=_token_hash(raw),
        expires_at=now + timezone.timedelta(minutes=_CHALLENGE_MINUTES),
    )
    return raw, row


def cancel_challenge(member, *, session_key: str, raw_token: str = "") -> None:
    from .models import VerificationChallenge

    now = timezone.now()
    rows = VerificationChallenge.objects.filter(
        member=member,
        session_key=session_key,
        used_at__isnull=True,
        cancelled_at__isnull=True,
    )
    if raw_token:
        rows = rows.filter(token_hash=_token_hash(raw_token))
    rows.update(cancelled_at=now)


def challenge_for_token(raw: str):
    from .models import VerificationChallenge

    if not raw or len(raw) > 128 or len(raw) < 20:
        return None
    return (
        VerificationChallenge.objects.select_related("member", "created_by")
        .filter(token_hash=_token_hash(raw))
        .first()
    )


def challenge_block_reason(row) -> str:
    if row is None:
        return "invalid"
    now = timezone.now()
    if row.cancelled_at is not None:
        return "cancelled"
    if row.used_at is not None:
        return "used"
    if row.expires_at <= now:
        return "expired"
    return ""


def mark_challenge_used(row) -> None:
    if row.used_at is None:
        row.used_at = timezone.now()
        row.save(update_fields=["used_at"])


def token_guess_limited(ip: str) -> bool:
    key = f"verify-token-guess:{ip or 'unknown'}"
    try:
        count = int(cache.get(key) or 0)
    except (TypeError, ValueError):
        count = 0
    return count >= _GUESS_LIMIT


def note_token_guess(ip: str) -> None:
    key = f"verify-token-guess:{ip or 'unknown'}"
    if cache.add(key, 1, timeout=_COMPARE_WINDOW_SECONDS):
        return
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=_COMPARE_WINDOW_SECONDS)
