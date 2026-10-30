# pyright: reportIncompatibleMethodOverride=false
from rest_framework.permissions import BasePermission

from .desks import holds_desk


class IsLtfAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and holds_desk(request.user, "ltf_admin")


class IsLtfFinance(BasePermission):
    def has_permission(self, request, view) -> bool:  # type: ignore
        return request.user.is_authenticated and holds_desk(request.user, "ltf_finance")


class IsLtfFinanceOrLtfAdmin(BasePermission):
    def has_permission(self, request, view) -> bool:  # type: ignore
        user = request.user
        return user.is_authenticated and (
            holds_desk(user, "ltf_finance") or holds_desk(user, "ltf_admin")
        )


class IsClubAdminOrCoach(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ["club_admin", "coach"]


class IsClubAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "club_admin"


class IsLtfAdminOrClubAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ["ltf_admin", "club_admin"]
