from rest_framework.permissions import BasePermission

from .entitlements import is_club_assigned, is_install_entitled


class IsModuleEntitled(BasePermission):
    message = "This module is not available."

    def has_permission(self, request, view) -> bool:
        module_id = getattr(view, "module_id", None)
        if not module_id:
            return False
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return is_install_entitled(module_id)


class IsClubModuleAssigned(BasePermission):
    message = "This module is not available for this club."

    def has_permission(self, request, view) -> bool:
        module_id = getattr(view, "module_id", None)
        if not module_id:
            return False
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if not is_install_entitled(module_id):
            return False
        club_id = _club_id_from_request(request)
        if club_id is None:
            return getattr(user, "is_superuser", False) or getattr(user, "role", "") == "ltf_admin"
        return is_club_assigned(module_id, club_id)


def _club_id_from_request(request) -> int | None:
    raw = request.query_params.get("club") or request.data.get("club") or request.data.get("club_id")
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None
