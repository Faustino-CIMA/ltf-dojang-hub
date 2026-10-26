"""Review desk for members parked during import. LTF admins and superusers only."""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsLtfAdmin
from clubs.models import Club

from .models import Member
from .parking import (
    assign_club_to_parked,
    decode_reasons,
    finish_parked_member,
    record_delete_audit,
)


class IsLtfAdminOrSuperuser(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        return IsLtfAdmin().has_permission(request, view)


def _parked_queryset():
    return Member.all_objects.filter(import_status=Member.ImportStatus.PARKED).select_related("club")


def _row(member: Member) -> dict:
    detail = member.park_detail if isinstance(member.park_detail, dict) else {}
    return {
        "id": member.id,
        "first_name": member.first_name,
        "last_name": member.last_name,
        "wt_licenseid": member.wt_licenseid,
        "ltf_licenseid": member.ltf_licenseid,
        "reasons": decode_reasons(member.park_reason),
        "park_club_text": member.park_club_text,
        "park_detail": detail,
        "sex": member.sex,
        "club_id": member.club_id,
        "is_active": member.is_active,
    }


_ORDER = {
    "name": ("last_name", "first_name", "id"),
    "-name": ("-last_name", "-first_name", "-id"),
    "wt": ("wt_licenseid", "last_name", "id"),
    "-wt": ("-wt_licenseid", "-last_name", "-id"),
    "ltf": ("ltf_licenseid", "last_name", "id"),
    "-ltf": ("-ltf_licenseid", "-last_name", "-id"),
    "reason": ("park_reason", "last_name", "id"),
    "-reason": ("-park_reason", "last_name", "-id"),
    "club": ("park_club_text", "last_name", "id"),
    "-club": ("-park_club_text", "-last_name", "-id"),
}


class ParkedMemberListView(APIView):
    permission_classes = [IsLtfAdminOrSuperuser]

    def get(self, request):
        queryset = _parked_queryset()
        reason = str(request.query_params.get("reason") or "").strip()
        if reason:
            queryset = queryset.filter(park_reason__contains=f",{reason},")
        ordering = str(request.query_params.get("ordering") or "name").strip()
        queryset = queryset.order_by(*_ORDER.get(ordering, _ORDER["name"]))
        return Response({"results": [_row(member) for member in queryset]})


class ParkedMemberResolveView(APIView):
    permission_classes = [IsLtfAdminOrSuperuser]

    def post(self, request, pk):
        member = get_object_or_404(_parked_queryset(), pk=pk)
        sex = str(request.data.get("sex") or "").strip()
        ltf_staff = bool(request.data.get("ltf_staff"))
        raw_active = request.data.get("is_active", None)
        errors = {}
        if sex not in {Member.Sex.MALE, Member.Sex.FEMALE}:
            errors["sex"] = ["Choose male or female."]
        if raw_active is not True and raw_active is not False:
            errors["is_active"] = ["Choose active or inactive."]
        club = None
        if not ltf_staff:
            raw_club = request.data.get("club_id")
            try:
                club = Club.objects.get(pk=int(raw_club))
            except (TypeError, ValueError, Club.DoesNotExist):
                errors["club"] = ["Choose a club or LTF staff."]
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        finish_parked_member(
            member,
            sex=sex,
            is_active=bool(raw_active),
            club=club,
            ltf_staff=ltf_staff,
            actor=request.user,
            source="review",
        )
        member.refresh_from_db()
        return Response(_row(member) | {"import_status": member.import_status, "resolved": True})


class ParkedMemberDeleteView(APIView):
    permission_classes = [IsLtfAdminOrSuperuser]

    def delete(self, request, pk):
        member = get_object_or_404(_parked_queryset(), pk=pk)
        record_delete_audit(request.user, member, source="review")
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ParkedMemberBulkAssignView(APIView):
    permission_classes = [IsLtfAdminOrSuperuser]

    def post(self, request):
        raw_ids = request.data.get("ids") or []
        if not isinstance(raw_ids, list) or not raw_ids:
            return Response({"ids": ["Choose at least one parked member."]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            club = Club.objects.get(pk=int(request.data.get("club_id")))
        except (TypeError, ValueError, Club.DoesNotExist):
            return Response({"club": ["Choose a club."]}, status=status.HTTP_400_BAD_REQUEST)
        ids = []
        for value in raw_ids:
            try:
                ids.append(int(value))
            except (TypeError, ValueError):
                continue
        resolved = 0
        updated = 0
        for member in _parked_queryset().filter(id__in=ids):
            outcome = assign_club_to_parked(member, club, actor=request.user)
            if outcome == "resolved":
                resolved += 1
            else:
                updated += 1
        return Response({"resolved": resolved, "updated": updated})


class ParkedMemberBulkDeleteView(APIView):
    permission_classes = [IsLtfAdminOrSuperuser]

    def post(self, request):
        if request.data.get("confirm") is not True:
            return Response({"confirm": ["Confirm the delete."]}, status=status.HTTP_400_BAD_REQUEST)
        raw_ids = request.data.get("ids") or []
        if not isinstance(raw_ids, list) or not raw_ids:
            return Response({"ids": ["Choose at least one parked member."]}, status=status.HTTP_400_BAD_REQUEST)
        ids = []
        for value in raw_ids:
            try:
                ids.append(int(value))
            except (TypeError, ValueError):
                continue
        deleted = 0
        for member in list(_parked_queryset().filter(id__in=ids)):
            record_delete_audit(request.user, member, source="bulk_delete")
            member.delete()
            deleted += 1
        return Response({"deleted": deleted})
