from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from members.models import Member

from .access import CompetitionModulePermission
from .body_measurements import (
    BodyMeasurement,
    apply_measurement_fields,
    can_record_measurements,
    weight_suggestion,
)


def _member_for_write(request, member_id) -> Member:
    member = get_object_or_404(Member, pk=member_id)
    if not can_record_measurements(request.user, member.club_id):
        raise PermissionDenied(detail="This module is not available.")
    return member


def _measurement_payload(row: BodyMeasurement) -> dict:
    return {
        "id": row.id,
        "member": row.member_id,
        "measured_on": row.measured_on.isoformat(),
        "weight_kg": None if row.weight_kg is None else f"{row.weight_kg:.1f}",
        "height_cm": row.height_cm,
        "note": row.note,
        "recorded_by": row.recorded_by_id,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
    }


class BodyMeasurementListView(APIView):
    permission_classes = [IsAuthenticated, CompetitionModulePermission]
    module_id = "competition"

    def get(self, request):
        member = _member_for_write(request, request.query_params.get("member"))
        rows = BodyMeasurement.objects.filter(member=member).order_by("-measured_on", "-id")
        return Response(
            {
                "results": [_measurement_payload(row) for row in rows],
                "suggestion": weight_suggestion(member),
            }
        )

    def post(self, request):
        member = _member_for_write(request, request.data.get("member"))
        row = BodyMeasurement(member=member, recorded_by=request.user)
        apply_measurement_fields(row, request.data, creating=True)
        row.save()
        return Response(_measurement_payload(row), status=201)


class BodyMeasurementDetailView(APIView):
    permission_classes = [IsAuthenticated, CompetitionModulePermission]
    module_id = "competition"

    def _row(self, request, measurement_id) -> BodyMeasurement:
        row = get_object_or_404(
            BodyMeasurement.objects.select_related("member"),
            pk=measurement_id,
        )
        if not can_record_measurements(request.user, row.member.club_id):
            raise PermissionDenied(detail="This module is not available.")
        return row

    def patch(self, request, measurement_id):
        row = self._row(request, measurement_id)
        apply_measurement_fields(row, request.data, creating=False)
        row.recorded_by = request.user
        row.save()
        return Response(_measurement_payload(row))

    def delete(self, request, measurement_id):
        row = self._row(request, measurement_id)
        row.delete()
        return Response(status=204)
