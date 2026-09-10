from django.shortcuts import get_object_or_404
from rest_framework import permissions, response, views
from rest_framework.exceptions import PermissionDenied, ValidationError

from clubs.models import Club

from .entitlements import is_club_assigned, is_install_entitled, status_for_user
from .registry import PREVIEW_MODULE_ID


class ModuleStatusView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return response.Response(status_for_user(request.user))


class PreviewModuleView(views.APIView):
    """Prove-out endpoint: 403 when the preview module is locked."""

    permission_classes = [permissions.IsAuthenticated]
    module_id = PREVIEW_MODULE_ID

    def get(self, request):
        if not is_install_entitled(PREVIEW_MODULE_ID):
            raise PermissionDenied(detail="This module is not available.")

        user = request.user
        role = getattr(user, "role", "")
        if getattr(user, "is_superuser", False) or role == "ltf_admin":
            return response.Response(
                {
                    "module": PREVIEW_MODULE_ID,
                    "scope": "install",
                    "status": "coming_soon",
                }
            )

        if role not in ("club_admin", "coach"):
            raise PermissionDenied(detail="This module is not available.")

        club_id = _optional_int(request.query_params.get("club"))
        administered = set(user.clubs_administered.values_list("id", flat=True))
        if club_id is None:
            if len(administered) == 1:
                club_id = next(iter(administered))
            else:
                raise ValidationError({"club": "Select a club."})
        if club_id not in administered:
            raise PermissionDenied(detail="This module is not available.")
        if not is_club_assigned(PREVIEW_MODULE_ID, club_id):
            raise PermissionDenied(detail="This module is not available.")
        club = get_object_or_404(Club, pk=club_id)
        return response.Response(
            {
                "module": PREVIEW_MODULE_ID,
                "scope": "club",
                "club_id": club.id,
                "club_name": club.name,
                "status": "coming_soon",
            }
        )


def _optional_int(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError({"club": "Select a club."})
