from django.db.models import Q
from django.utils import timezone
from rest_framework.permissions import BasePermission

from accounts.desks import current_desk
from accounts.models import DeskGrant


class IsSuperuser(BasePermission):
    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_superuser)


class IsFullOpsDesk(BasePermission):
    """A superuser whose request is the ops desk, and not a read-only ops grant."""

    message = "Not allowed."

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated or not user.is_superuser:
            return False
        if current_desk() != "ops":
            return False
        today = timezone.localdate()
        read_only = DeskGrant.objects.filter(
            user_id=user.id,
            desk="ops",
            level=DeskGrant.Level.READ_ONLY,
            valid_from__lte=today,
        ).filter(Q(valid_until__isnull=True) | Q(valid_until__gt=today))
        return not read_only.exists()
