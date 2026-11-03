"""Superuser merge. The second factor is required. Nothing is matched by name."""

from rest_framework import response, status, views

from accounts.merge import MergeError, merge_accounts, preview
from accounts.mfa import session_proved_strong
from accounts.models import User

from .permissions import IsSuperuser


def _users(ids):
    unique = []
    seen = set()
    for pk in ids:
        number = int(pk)
        if number in seen:
            continue
        seen.add(number)
        unique.append(number)
    by_id = {row.id: row for row in User.objects.filter(pk__in=unique)}
    return [by_id[pk] for pk in unique if pk in by_id]


class OpsMergeView(views.APIView):
    permission_classes = [IsSuperuser]

    def _guard(self, request):
        if not session_proved_strong(request):
            return response.Response({"detail": "mfa_required"}, status=status.HTTP_403_FORBIDDEN)
        return None

    def get(self, request):
        blocked = self._guard(request)
        if blocked is not None:
            return blocked
        try:
            survivor_id = int(request.query_params.get("survivor") or 0)
            folded_ids = [int(part) for part in str(request.query_params.get("folded") or "").split(",") if part.strip()]
        except ValueError:
            return response.Response({"detail": "Choose the login to keep and the logins to fold."}, status=status.HTTP_400_BAD_REQUEST)
        survivor = User.objects.filter(pk=survivor_id).first()
        folded = _users(folded_ids)
        if survivor is None or len(folded) != len(folded_ids) or not folded_ids:
            return response.Response({"detail": "Choose the login to keep and the logins to fold."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            for source in folded:
                if source.id == survivor.id:
                    raise MergeError("same_account")
        except MergeError as exc:
            return response.Response({"detail": exc.code}, status=status.HTTP_400_BAD_REQUEST)
        return response.Response(preview(survivor, folded))

    def post(self, request):
        blocked = self._guard(request)
        if blocked is not None:
            return blocked
        try:
            survivor_id = int(request.data.get("survivor_id") or 0)
            folded_ids = [int(part) for part in request.data.get("folded_ids") or []]
            raw_member = request.data.get("keep_member_id")
            keep_member_id = int(raw_member) if raw_member not in (None, "") else None
        except (TypeError, ValueError):
            return response.Response({"detail": "Choose the login to keep and the logins to fold."}, status=status.HTTP_400_BAD_REQUEST)
        survivor = User.objects.filter(pk=survivor_id).first()
        folded = _users(folded_ids)
        if survivor is None or len(folded) != len(set(folded_ids)) or not folded_ids:
            return response.Response({"detail": "Choose the login to keep and the logins to fold."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            payload = merge_accounts(request.user, survivor, folded, keep_member_id)
        except MergeError as exc:
            code = status.HTTP_409_CONFLICT if exc.code == "member_conflict" else status.HTTP_400_BAD_REQUEST
            return response.Response({"detail": exc.code}, status=code)
        return response.Response(payload)
