"""Create, link, or refresh a member login. The file is not emailed."""

from django.db import transaction
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ops.request_utils import write_ops_audit

from .user_accounts import (
    apply_plans,
    created_rows,
    desk_label,
    mint_allowed,
    plan_members,
    readable_members,
    send_created_invites,
)


def _ids(raw) -> list[int]:
    ordered: list[int] = []
    seen: set[int] = set()
    values = raw if isinstance(raw, list) else str(raw or "").split(",")
    for value in values:
        try:
            member_id = int(value)
        except (TypeError, ValueError):
            continue
        if member_id in seen:
            continue
        seen.add(member_id)
        ordered.append(member_id)
    return ordered


def _load(request, member_ids: list[int]):
    found = {member.id: member for member in readable_members(request).filter(id__in=member_ids)}
    if len(found) != len(member_ids):
        return None
    return [found[member_id] for member_id in member_ids]


class MemberUserAccountsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        member_ids = _ids(request.query_params.get("ids"))
        if not member_ids:
            return Response({"detail": "Choose at least one member."}, status=status.HTTP_400_BAD_REQUEST)
        members = _load(request, member_ids)
        if members is None:
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        plans = plan_members(members)
        return Response({"results": [plan.preview() for plan in plans]})

    def post(self, request):
        if not mint_allowed(request):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        action = str(request.data.get("action") or "").strip()
        if action not in {"create", "link", "copy_link", "send_invite", "send_reset"}:
            return Response({"detail": "Choose an action."}, status=status.HTTP_400_BAD_REQUEST)
        member_ids = _ids(request.data.get("member_ids"))
        if not member_ids:
            return Response({"detail": "Choose at least one member."}, status=status.HTTP_400_BAD_REQUEST)
        members = _load(request, member_ids)
        if members is None:
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        locale = str(request.data.get("locale") or "en").strip()[:8]
        if action == "send_reset":
            from .user_accounts import reset_destination
            from accounts.email_utils import build_password_reset_url, send_password_reset_email

            sent = 0
            skipped = []
            for member in members:
                user = getattr(member, "user", None)
                if user is None or not user.minor_account:
                    skipped.append({"member_id": member.id, "reason": "not_minor"})
                    continue
                destination = reset_destination(user)
                if not destination:
                    skipped.append({"member_id": member.id, "reason": "reset_stopped"})
                    continue
                reset_url = build_password_reset_url(user, locale)
                ok, _error = send_password_reset_email(user, reset_url, to_email=destination)
                if ok:
                    sent += 1
                else:
                    skipped.append({"member_id": member.id, "reason": "failed"})
            payload = Response({"sent": sent, "skipped": skipped})
            payload["Cache-Control"] = "no-store"
            return payload
        if action == "send_invite":
            with transaction.atomic():
                summary = send_created_invites(members, actor=request.user, screen_locale=locale)
                write_ops_audit(
                    request,
                    action="members.user_invite",
                    target_type="member",
                    message=f"Sent {summary['sent']} first-login invitations. {summary['missing_email']} had no email.",
                    metadata={
                        "actor_id": request.user.id,
                        "desk": desk_label(request),
                        "member_ids": [member.id for member in members],
                        "sent": summary["sent"],
                        "missing_email": summary["missing_email"],
                        "failed": summary["failed"],
                    },
                )
            payload = Response(summary)
            payload["Cache-Control"] = "no-store"
            return payload
        with transaction.atomic():
            plans = plan_members(members, for_copy=action == "copy_link")
            raw_choices = request.data.get("guardian_emails") or {}
            guardian_by_member = {}
            if isinstance(raw_choices, dict):
                for key, value in raw_choices.items():
                    try:
                        guardian_by_member[int(key)] = str(value or "").strip()
                    except (TypeError, ValueError):
                        continue
            batch = apply_plans(
                plans,
                action=action,
                actor=request.user,
                locale=locale,
                guardian_by_member=guardian_by_member,
            )
            if action == "link":
                audit_action = "members.user_linked"
                message = f"Linked {batch.linked_count} member logins. Skipped {len(batch.skipped)}."
            elif action == "copy_link":
                audit_action = "members.user_account"
                issued = 1 if batch.copy_link else 0
                message = f"Created {issued} first-login links. Skipped {len(batch.skipped)}."
            elif len(member_ids) > 1:
                audit_action = "members.bulk_user_accounts"
                message = f"Created {batch.created_count} member logins. Skipped {len(batch.skipped)}."
            else:
                audit_action = "members.user_account"
                message = f"Created {batch.created_count} member logins. Skipped {len(batch.skipped)}."
            write_ops_audit(
                request,
                action=audit_action,
                target_type="member",
                message=message,
                metadata={
                    "actor_id": request.user.id,
                    "desk": desk_label(request),
                    "created_member_ids": [member.id for member in batch.created_members],
                    "issued_member_ids": batch.issued_member_ids,
                    "linked_member_ids": [row["member_id"] for row in batch.linked],
                    "linked_user_ids": [row["user_id"] for row in batch.linked],
                    "skipped": batch.skipped,
                },
            )
        payload = Response(
            {
                "created_count": batch.created_count,
                "linked_count": batch.linked_count,
                "skipped": batch.skipped,
                "needs_link": batch.needs_link,
                "csv": batch.csv,
                "pdf_base64": batch.pdf_base64,
                "copy_link": batch.copy_link,
                "created": created_rows(batch.created_members, batch.created_users),
            }
        )
        payload["Cache-Control"] = "no-store"
        return payload
