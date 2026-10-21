from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from clubs.models import Club

from .access import CompetitionModulePermission, is_club_admin_of
from .body_measurements import measurement_club_ids
from .clothing import (
    ClubClothingItem,
    create_item,
    delete_clothing_item,
    item_payload,
    items_for_club,
    public_presets,
    reorder_items,
    update_item,
)


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


def _writable_club(request) -> Club:
    club = _readable_club(request)
    if not is_club_admin_of(request.user, club.id):
        raise PermissionDenied(detail="This module is not available.")
    return club


def _item(request, item_id: int, *, write: bool) -> ClubClothingItem:
    item = get_object_or_404(ClubClothingItem, pk=item_id)
    if item.club_id not in measurement_club_ids(request.user):
        raise PermissionDenied(detail="This module is not available.")
    if write and not is_club_admin_of(request.user, item.club_id):
        raise PermissionDenied(detail="This module is not available.")
    return item


class ClubClothingListView(APIView):
    permission_classes = [IsAuthenticated, CompetitionModulePermission]
    module_id = "competition"

    def get(self, request):
        club = _readable_club(request)
        return Response({"items": [item_payload(item) for item in items_for_club(club.id)], "presets": public_presets()})

    def post(self, request):
        club = _writable_club(request)
        item = create_item(club, request.data)
        return Response(item_payload(item), status=201)


class ClubClothingDetailView(APIView):
    permission_classes = [IsAuthenticated, CompetitionModulePermission]
    module_id = "competition"

    def patch(self, request, item_id):
        item = update_item(_item(request, item_id, write=True), request.data)
        return Response(item_payload(item))

    def delete(self, request, item_id):
        delete_clothing_item(_item(request, item_id, write=True))
        return Response(status=204)


class ClubClothingReorderView(APIView):
    permission_classes = [IsAuthenticated, CompetitionModulePermission]
    module_id = "competition"

    def post(self, request):
        club = _writable_club(request)
        reorder_items(club, request.data.get("order") if isinstance(request.data, dict) else None)
        return Response({"items": [item_payload(item) for item in items_for_club(club.id)]})
