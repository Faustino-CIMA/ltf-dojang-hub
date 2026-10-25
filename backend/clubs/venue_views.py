from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .access import user_can_edit_club
from .models import Club, TrainingVenue
from .serializers import TrainingVenueSerializer


class TrainingVenueListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _club(self, request, club_id):
        club = get_object_or_404(Club, pk=club_id)
        if not user_can_edit_club(request.user, club):
            return None, Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        return club, None

    def get(self, request, club_id):
        club, denied = self._club(request, club_id)
        if denied:
            return denied
        venues = club.training_venues.all()
        return Response(TrainingVenueSerializer(venues, many=True).data)

    def post(self, request, club_id):
        club, denied = self._club(request, club_id)
        if denied:
            return denied
        serializer = TrainingVenueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(club=club)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TrainingVenueDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _venue(self, request, club_id, venue_id):
        club = get_object_or_404(Club, pk=club_id)
        if not user_can_edit_club(request.user, club):
            return None, Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        venue = get_object_or_404(TrainingVenue, pk=venue_id, club=club)
        return venue, None

    def patch(self, request, club_id, venue_id):
        venue, denied = self._venue(request, club_id, venue_id)
        if denied:
            return denied
        serializer = TrainingVenueSerializer(venue, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, club_id, venue_id):
        venue, denied = self._venue(request, club_id, venue_id)
        if denied:
            return denied
        venue.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LuxembourgAddressLookupView(APIView):
    """Login-only Luxembourg address lookup. Not gated by the club-management module."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from clubmgmt.addresses import lookup_luxembourg

        postal_code = str(request.query_params.get("postal_code") or "")
        street = str(request.query_params.get("street") or "")
        return Response(lookup_luxembourg(postal_code, street))
