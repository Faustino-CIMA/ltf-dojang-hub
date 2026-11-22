"""Club desk export of members and licences."""

from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.desks import current_active_club, current_desk
from clubs.models import Club
from licenses.models import License
from members.models import Member
from ops.request_utils import write_ops_audit

from .club_data_export import (
    PREPARE_ROW_LIMIT,
    build_csv_zip,
    build_xlsx,
    download_name,
    export_tables,
    normalize_locale,
)


class ClubDataExportView(APIView):
    permission_classes = [IsAuthenticated]

    def _club(self, request):
        if current_desk() != "club_admin":
            return None, Response({"detail": "This export is for a club admin."}, status=403)
        club_id = current_active_club()
        if club_id is None:
            return None, Response({"detail": "Open a club desk first."}, status=400)
        club = Club.objects.filter(pk=club_id, admins=request.user).first()
        if club is None:
            return None, Response({"detail": "This export is for a club admin."}, status=403)
        return club, None

    def get(self, request):
        club, error = self._club(request)
        if error is not None:
            return error
        member_count = Member.objects.filter(club_id=club.id).count()
        license_count = License.objects.filter(club_id=club.id, member__club_id=club.id).count()
        return Response(
            {
                "club_name": club.name,
                "member_count": member_count,
                "license_count": license_count,
                "prepare_above": PREPARE_ROW_LIMIT,
            }
        )

    def post(self, request):
        club, error = self._club(request)
        if error is not None:
            return error
        raw_sheets = request.data.get("sheets") or []
        if not isinstance(raw_sheets, list):
            return Response({"detail": "Choose members, licences, or both."}, status=400)
        sheets = {str(item) for item in raw_sheets}
        allowed = {"members", "licences"}
        if not sheets or not sheets <= allowed:
            return Response({"detail": "Choose members, licences, or both."}, status=400)
        file_format = str(request.data.get("format") or "")
        if file_format not in {"csv", "xlsx"}:
            return Response({"detail": "Choose CSV or XLSX."}, status=400)
        locale = normalize_locale(request.data.get("locale"))
        tables = export_tables(
            club.id,
            include_members="members" in sheets,
            include_licences="licences" in sheets,
        )
        if file_format == "csv":
            payload = build_csv_zip(tables, locale)
            content_type = "application/zip"
            extension = "zip"
        else:
            payload = build_xlsx(tables, locale)
            content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            extension = "xlsx"
        write_ops_audit(
            request,
            action="data.export",
            message="Club data export.",
            target_type="club",
            target_id=club.id,
            metadata={
                "format": file_format,
                "sheets": sorted(sheets),
                "member_rows": len(tables.get("members", [])),
                "license_rows": len(tables.get("licences", [])),
                "social_security_numbers": False,
            },
        )
        response = HttpResponse(payload, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{download_name(club.name, extension)}"'
        return response
