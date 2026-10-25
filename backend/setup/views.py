import json

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from imports.csv_utils import read_csv
from members.services import is_ltf_license_prefix_rewrite_enabled

from .availability import app_is_empty, get_state, setup_available_for, setup_is_completed, status_payload
from .clubs_step import apply_clubs, preview_clubs
from .members_step import apply_members, preview_members
from .models import SetupState


class SetupGone(APIException):
    status_code = 410
    default_detail = "Setup is finished."


class IsSuperuser(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_superuser)


def _payload(request) -> dict:
    raw = request.data.get("payload")
    if isinstance(raw, str) and raw.strip():
        return json.loads(raw)
    if isinstance(raw, dict):
        return raw
    return {}


def _file_rows(request):
    file_obj = request.data.get("file")
    if not file_obj:
        return None, None, Response({"detail": "CSV file is required."}, status=400)
    headers, rows = read_csv(file_obj)
    return headers, rows, None


class SetupStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(status_payload(request.user))


class SetupStartView(APIView):
    permission_classes = [IsSuperuser]

    def post(self, request):
        from django.conf import settings

        if getattr(settings, "DEMO_MODE", False):
            return Response({"detail": "Setup is not available."}, status=403)
        if setup_is_completed():
            raise SetupGone()
        if not app_is_empty() and not (get_state() and get_state().started_at):
            return Response({"detail": "Setup can only start while the app is empty."}, status=409)
        state = SetupState.objects.filter(pk=1).first() or SetupState(pk=1)
        if not state.started_at:
            state.started_at = timezone.now()
            state.started_by = request.user
            state.current_step = SetupState.Step.CLUBS
            state.ltf_prefix_rewrite = is_ltf_license_prefix_rewrite_enabled()
            state.step_results = {}
            state.save()
        return Response(status_payload(request.user))


class _OpenSetupView(APIView):
    permission_classes = [IsSuperuser]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if setup_is_completed():
            raise SetupGone()
        if not setup_available_for(request.user) or not (get_state() and get_state().started_at):
            self.permission_denied(request, message="Start setup first.")


class SetupClubsPreviewView(_OpenSetupView):
    def post(self, request):
        headers, rows, error = _file_rows(request)
        if error:
            return error
        return Response(preview_clubs(headers, rows, _payload(request)))


class SetupClubsConfirmView(_OpenSetupView):
    def post(self, request):
        headers, rows, error = _file_rows(request)
        if error:
            return error
        with transaction.atomic():
            state = SetupState.objects.select_for_update().get(pk=1)
            if state.completed_at:
                raise SetupGone()
            result = apply_clubs(headers, rows, _payload(request), request.user)
            if not result.get("confirmed"):
                return Response(result, status=400)
            results = dict(state.step_results or {})
            results["clubs"] = result
            state.step_results = results
            state.current_step = SetupState.Step.MEMBERS
            state.save(update_fields=["step_results", "current_step"])
        return Response(result)


class SetupMembersPreviewView(_OpenSetupView):
    def post(self, request):
        headers, rows, error = _file_rows(request)
        if error:
            return error
        state = get_state()
        return Response(
            preview_members(headers, rows, _payload(request), rewrite_enabled=bool(state and state.ltf_prefix_rewrite))
        )


class SetupMembersConfirmView(_OpenSetupView):
    def post(self, request):
        headers, rows, error = _file_rows(request)
        if error:
            return error
        with transaction.atomic():
            state = SetupState.objects.select_for_update().get(pk=1)
            if state.completed_at:
                raise SetupGone()
            result = apply_members(
                headers,
                rows,
                _payload(request),
                rewrite_enabled=bool(state.ltf_prefix_rewrite),
                actor=request.user,
            )
            if not result.get("confirmed"):
                return Response(result, status=400)
            results = dict(state.step_results or {})
            results["members"] = {
                "created": result["created"],
                "updated": result["updated"],
                "skipped": result["skipped"],
                "ltf_staff": result["ltf_staff"],
                "blank_rows_ignored": result["blank_rows_ignored"],
                "role_summary": result["role_summary"],
                "gender_summary": result["gender_summary"],
            }
            state.step_results = results
            state.current_step = SetupState.Step.ADMINS
            state.save(update_fields=["step_results", "current_step"])
        return Response(result)


class SetupFinishView(_OpenSetupView):
    def post(self, request):
        with transaction.atomic():
            state = SetupState.objects.select_for_update().get(pk=1)
            if state.completed_at:
                raise SetupGone()
            state.completed_at = timezone.now()
            state.completed_by = request.user
            state.current_step = SetupState.Step.DONE
            state.save(update_fields=["completed_at", "completed_by", "current_step"])
        user = request.user
        if user.role != User.Roles.LTF_ADMIN:
            user.role = User.Roles.LTF_ADMIN
            user.save(update_fields=["role"])
        cache.delete("dashboard:overview:ltf_admin:v6")
        delete_pattern = getattr(cache, "delete_pattern", None)
        if delete_pattern:
            delete_pattern("dashboard:overview:ltf_admin:*")
        return Response(status_payload(request.user))
