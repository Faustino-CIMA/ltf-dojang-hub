"""Verify, unlock, and read the audit. The card photo is refused."""

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import MemberVerificationEvent
from .verification import (
    VerificationError,
    can_verify_member,
    compare_is_limited,
    compare_member,
    is_verified,
    lock_member,
    read_card_text,
    unlock_member,
    verification_state,
)

_IMAGE_KEYS = {
    "image",
    "photo",
    "card_image",
    "card_photo",
    "picture",
    "file",
    "document",
}
_ERROR_TEXT = {
    "invalid": "Send the card text as JSON.",
    "name_too_long": "Name is too long.",
    "number_too_long": "Number is too long.",
    "date": "Date of birth must be YYYY-MM-DD.",
    "sex": "Sex must be M or F.",
    "confirm_names": "confirm_names must be true or false.",
    "missing_number": "This member has no social security number.",
    "not_verified": "This member is not verified.",
    "reason": "A reason is required.",
    "reason_too_long": "The reason is too long.",
}


def _image_sent(request) -> bool:
    content_type = request.content_type or ""
    if content_type.startswith("multipart/"):
        return True
    data = request.data
    if not hasattr(data, "keys"):
        return False
    for key in data.keys():
        lowered = str(key).lower()
        if lowered in _IMAGE_KEYS or lowered.endswith("_image") or lowered.endswith("_photo"):
            return True
    return False


def _event_payload(event: MemberVerificationEvent) -> dict:
    return {
        "action": event.action,
        "at": event.created_at,
        "actor_id": event.actor_id,
        "reason": event.reason,
        "fields": list(event.fields or []),
        "old_first_name": event.old_first_name,
        "new_first_name": event.new_first_name,
        "old_last_name": event.old_last_name,
        "new_last_name": event.new_last_name,
        "old_date_of_birth": event.old_date_of_birth,
        "new_date_of_birth": event.new_date_of_birth,
        "old_sex": event.old_sex,
        "new_sex": event.new_sex,
        "ssn_changed": event.ssn_changed,
    }


class MemberVerificationActions:
    def _verification_forbidden(self, request, member):
        if not can_verify_member(request.user, member):
            return Response({"detail": "You cannot verify this member."}, status=403)
        return None

    @action(detail=True, methods=["get"], url_path="verification")
    def verification(self, request, pk=None):
        member = self.get_object()
        denied = self._verification_forbidden(request, member)
        if denied is not None:
            return denied
        return Response(verification_state(member))

    @action(detail=True, methods=["get"], url_path="verification/events")
    def verification_events(self, request, pk=None):
        member = self.get_object()
        denied = self._verification_forbidden(request, member)
        if denied is not None:
            return denied
        events = member.verification_events.all()[:50]
        return Response({"results": [_event_payload(event) for event in events]})

    @action(detail=True, methods=["post"], url_path="verification/compare")
    def verification_compare(self, request, pk=None):
        if _image_sent(request):
            return Response({"detail": "The card photo is not accepted."}, status=400)
        member = self.get_object()
        denied = self._verification_forbidden(request, member)
        if denied is not None:
            return denied
        if compare_is_limited(request.user.id, member.id):
            return Response({"detail": "Too many checks. Try again later."}, status=429)
        if is_verified(member):
            return Response({"detail": "This member is already verified."}, status=409)
        try:
            card = read_card_text(request.data)
        except VerificationError as exc:
            return Response({"detail": _ERROR_TEXT[exc.code]}, status=400)
        try:
            result = compare_member(member, card)
        except VerificationError as exc:
            return Response({"detail": _ERROR_TEXT[exc.code]}, status=400)
        if not result.match:
            body = {"match": False, "fields": list(result.fields), "verified": False}
            if result.reason:
                body["reason"] = result.reason
            return Response(body)
        if card.confirm_names is None:
            return Response(
                {
                    "match": True,
                    "needs_confirmation": True,
                    "card_first_name": result.card_first_name,
                    "card_last_name": result.card_last_name,
                    "verified": False,
                }
            )
        try:
            lock_member(member, card, actor=request.user)
        except VerificationError as exc:
            if exc.code == "verified":
                return Response({"detail": "This member is already verified."}, status=409)
            if exc.code == "mismatch":
                return Response(
                    {"match": False, "fields": list(exc.fields), "verified": False}
                )
            return Response({"detail": _ERROR_TEXT.get(exc.code, "The card could not be checked.")}, status=400)
        except DjangoValidationError as exc:
            return Response(getattr(exc, "message_dict", {"detail": exc.messages}), status=400)
        state = verification_state(member)
        state["match"] = True
        return Response(state)

    @action(detail=True, methods=["post"], url_path="verification/unlock")
    def verification_unlock(self, request, pk=None):
        if _image_sent(request):
            return Response({"detail": "The card photo is not accepted."}, status=400)
        member = self.get_object()
        denied = self._verification_forbidden(request, member)
        if denied is not None:
            return denied
        try:
            unlock_member(member, actor=request.user, reason=request.data.get("reason"))
        except VerificationError as exc:
            return Response({"detail": _ERROR_TEXT[exc.code]}, status=400)
        return Response(verification_state(member))
