from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from members.models import Member

from .access import CompetitionModulePermission
from .body_measurements import can_record_measurements
from .gear import MemberGear, clean_gear_fields, gear_payload, gear_row_payload


def _member_for_gear(request, raw) -> Member:
    member = get_object_or_404(Member, pk=raw)
    if not can_record_measurements(request.user, member.club_id):
        raise PermissionDenied(detail="This module is not available.")
    return member


class MemberGearView(APIView):
    permission_classes = [IsAuthenticated, CompetitionModulePermission]
    module_id = "competition"

    def get(self, request):
        member = _member_for_gear(request, request.query_params.get("member"))
        return Response(gear_payload(member))

    def put(self, request):
        raw = request.data.get("member") if isinstance(request.data, dict) else None
        member = _member_for_gear(request, raw or request.query_params.get("member"))
        fields = clean_gear_fields(request.data)
        row, _created = MemberGear.objects.get_or_create(member=member)
        for key, value in fields.items():
            setattr(row, key, value)
        row.save()
        return Response(gear_row_payload(row))
