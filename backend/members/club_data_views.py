"""Club desk export of members, licences, and grade history."""

from datetime import timedelta

from django.http import FileResponse, HttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.desks import current_active_club, current_desk
from clubs.models import Club
from licenses.models import License
from members.models import ClubDataExportJob, GradePromotionHistory, Member
from ops.request_utils import write_ops_audit

from .club_data_export import (
    PREPARE_ROW_LIMIT,
    build_csv_zip,
    build_json,
    build_own_file,
    build_xlsx,
    download_name,
    export_tables,
    normalize_locale,
)
from .tasks import build_club_data_pdf

_ALLOWED = {"members", "licences", "grades"}
_FORMATS = {"csv", "xlsx", "json", "pdf"}
_KEEP_FOR = timedelta(hours=72)


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
        return Response(
            {
                "club_name": club.name,
                "member_count": Member.objects.filter(club_id=club.id).count(),
                "license_count": License.objects.filter(club_id=club.id, member__club_id=club.id).count(),
                "grade_count": GradePromotionHistory.objects.filter(club_id=club.id, member__club_id=club.id).count(),
                "prepare_above": PREPARE_ROW_LIMIT,
            }
        )

    def post(self, request):
        club, error = self._club(request)
        if error is not None:
            return error
        raw_sheets = request.data.get("sheets") or []
        if not isinstance(raw_sheets, list):
            return Response({"detail": "Choose at least one list."}, status=400)
        sheets = {str(item) for item in raw_sheets}
        if not sheets or not sheets <= _ALLOWED:
            return Response({"detail": "Choose at least one list."}, status=400)
        file_format = str(request.data.get("format") or "")
        if file_format not in _FORMATS:
            return Response({"detail": "Choose a file format."}, status=400)
        locale = normalize_locale(request.data.get("locale"))
        counts = {
            "member_rows": Member.objects.filter(club_id=club.id).count() if "members" in sheets else 0,
            "license_rows": License.objects.filter(club_id=club.id, member__club_id=club.id).count()
            if "licences" in sheets
            else 0,
            "grade_rows": GradePromotionHistory.objects.filter(club_id=club.id, member__club_id=club.id).count()
            if "grades" in sheets
            else 0,
        }
        write_ops_audit(
            request,
            action="data.export",
            message="Club data export.",
            target_type="club",
            target_id=club.id,
            metadata={
                "format": file_format,
                "sheets": sorted(sheets),
                **counts,
                "social_security_numbers": False,
            },
        )
        if file_format == "pdf":
            job = ClubDataExportJob.objects.create(
                club=club,
                requested_by=request.user,
                file_format="pdf",
                locale=locale,
                sheets=sorted(sheets),
            )
            build_club_data_pdf.delay(job.id)
            return Response({"id": job.id, "status": job.status}, status=202)
        tables = export_tables(
            club.id,
            include_members="members" in sheets,
            include_licences="licences" in sheets,
            include_grades="grades" in sheets,
        )
        if file_format == "csv":
            payload = build_csv_zip(tables, locale)
            content_type = "application/zip"
            extension = "zip"
        elif file_format == "json":
            payload = build_json(tables, club.name)
            content_type = "application/json"
            extension = "json"
        else:
            payload = build_xlsx(tables, locale)
            content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            extension = "xlsx"
        response = HttpResponse(payload, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{download_name(club.name, extension)}"'
        return response


class ClubDataExportJobView(APIView):
    permission_classes = [IsAuthenticated]

    def _job(self, request, job_id: int):
        if current_desk() != "club_admin" or current_active_club() is None:
            return None, Response({"detail": "This export is for a club admin."}, status=403)
        job = ClubDataExportJob.objects.filter(
            pk=job_id,
            club_id=current_active_club(),
            requested_by=request.user,
        ).first()
        if job is None:
            return None, Response({"detail": "This file is not available."}, status=404)
        if job.created_at < timezone.now() - _KEEP_FOR:
            if job.artifact:
                job.artifact.delete(save=False)
            job.delete()
            return None, Response({"detail": "This file has expired."}, status=404)
        return job, None

    def get(self, request, job_id: int):
        job, error = self._job(request, job_id)
        if error is not None:
            return error
        return Response(
            {
                "id": job.id,
                "status": job.status,
                "progress": job.progress,
                "error_detail": job.error_detail,
            }
        )


class ClubDataExportFileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, job_id: int):
        view = ClubDataExportJobView()
        job, error = view._job(request, job_id)
        if error is not None:
            return error
        if job.status != ClubDataExportJob.Status.SUCCEEDED or not job.artifact:
            return Response({"detail": "The file is not ready."}, status=409)
        handle = job.artifact.open("rb")
        response = FileResponse(handle, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{download_name(job.club.name, "pdf")}"'
        return response


class MemberOwnDataView(APIView):
    """One member's row, licences, and grades. The PDF masks the number. The other files include it."""

    permission_classes = [IsAuthenticated]

    def get(self, request, member_id: int):
        member = Member.objects.filter(pk=member_id).select_related("club").first()
        if member is None:
            return Response({"detail": "This member is not available."}, status=404)
        own = bool(member.user_id and member.user_id == request.user.id)
        admin = False
        if not own and member.club_id and current_desk() == "club_admin":
            from clubmgmt.access import is_club_admin_of

            admin = is_club_admin_of(request.user, member.club_id) and current_active_club() == member.club_id
        if not own and not admin:
            return Response({"detail": "You cannot download this file."}, status=403)
        file_format = str(request.query_params.get("file_format") or "json")
        if file_format not in {"json", "pdf", "csv", "xlsx"}:
            return Response({"detail": "Choose a file format."}, status=400)
        payload, content_type, extension = build_own_file(member, file_format, request.query_params.get("locale"))
        if not payload:
            return Response({"detail": "The file could not be prepared."}, status=503)
        if admin:
            write_ops_audit(
                request,
                action="data.export",
                message="A club admin downloaded one member's data.",
                target_type="member",
                target_id=member.id,
                metadata={
                    "format": file_format,
                    "member_rows": 1,
                    "numbers_included": file_format != "pdf",
                    "own_file": True,
                },
            )
        filename = f"my-data.{extension}"
        response = HttpResponse(payload, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
