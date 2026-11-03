from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from clubs.models import Club

from .access import CompetitionModulePermission, is_club_admin_of
from .body_measurements import measurement_club_ids


def egear_flags(club) -> dict:
    return {
        "egear_daedo": bool(club.egear_daedo),
        "egear_kpnp": bool(club.egear_kpnp),
    }


def _club_id(request):
    raw = request.query_params.get("club")
    if raw in (None, "") and isinstance(request.data, dict):
        raw = request.data.get("club")
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _readable_club(request) -> Club:
    club_id = _club_id(request)
    if club_id is None or club_id not in measurement_club_ids(request.user):
        raise PermissionDenied(detail="This module is not available.")
    return get_object_or_404(Club, pk=club_id)


class EgearBrandsView(APIView):
    permission_classes = [IsAuthenticated, CompetitionModulePermission]
    module_id = "competition"

    def get(self, request):
        club = _readable_club(request)
        return Response({"club": club.id, **egear_flags(club)})

    def put(self, request):
        club = _readable_club(request)
        if not is_club_admin_of(request.user, club.id):
            raise PermissionDenied(detail="This module is not available.")
        if not isinstance(request.data, dict):
            raise ValidationError({"daedo": "flag_required"})
        updates = {}
        for key, field in (("daedo", "egear_daedo"), ("kpnp", "egear_kpnp")):
            if key not in request.data:
                continue
            value = request.data.get(key)
            if not isinstance(value, bool):
                raise ValidationError({key: "flag_required"})
            updates[field] = value
        if not updates:
            raise ValidationError({"daedo": "flag_required"})
        for field, value in updates.items():
            setattr(club, field, value)
        club.save(update_fields=[*updates.keys(), "updated_at"])
        return Response({"club": club.id, **egear_flags(club)})
