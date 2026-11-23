"""Upload, map, and dry-run a club data file. Nothing is saved into the member list."""

from django.core.exceptions import ValidationError
from django.http import HttpResponse
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.desks import current_active_club, current_desk
from clubs.models import Club
from members.models import ClubDataImportBatch, ClubDataImportUpload, ClubDataSavedMapping
from members.tasks import commit_club_data_import
from ops.request_utils import write_ops_audit

from .club_data_export import normalize_locale
from .club_data_import import (
    ALLOWED_SHEETS,
    ImportFileError,
    build_template_csv,
    build_template_xlsx,
    check_upload,
    describe_upload,
    expire_uploads,
    header_shape,
    parse_upload,
    review_upload,
)
from .club_data_import_commit import public_result, result_csv, result_json, undo_batch

_FORMATS = {"csv": "text/csv", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
_SUFFIXES = {
    ".csv": "csv",
    ".xlsx": "xlsx",
    ".json": "json",
    ".zip": "zip",
}


def _club(request):
    if current_desk() != "club_admin":
        return None, Response({"detail": "This import is for a club admin."}, status=403)
    club_id = current_active_club()
    if club_id is None:
        return None, Response({"detail": "Open a club desk first."}, status=400)
    club = Club.objects.filter(pk=club_id, admins=request.user).first()
    if club is None:
        return None, Response({"detail": "This import is for a club admin."}, status=403)
    return club, None


def _audit(request, club, phase, **metadata):
    write_ops_audit(
        request,
        action="data.import",
        message="Club data import was checked.",
        target_type="club",
        target_id=club.id,
        metadata={"phase": phase, "numbers_included": bool(metadata.get("numbers_included")), **metadata},
    )


class ClubDataImportTemplateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        club, error = _club(request)
        if error is not None:
            return error
        file_format = str(request.query_params.get("file_format") or "xlsx")
        if file_format not in _FORMATS:
            return Response({"detail": "Choose CSV or XLSX."}, status=400)
        locale = normalize_locale(request.query_params.get("locale"))
        from modules.entitlements import is_club_assigned
        from modules.registry import CLUB_MANAGEMENT_MODULE_ID

        household = is_club_assigned(CLUB_MANAGEMENT_MODULE_ID, club.id)
        if file_format == "csv":
            payload = build_template_csv(locale, household=household)
            content_type = "application/zip"
            extension = "zip"
        else:
            payload = build_template_xlsx(locale, household=household)
            content_type = _FORMATS["xlsx"]
            extension = "xlsx"
        response = HttpResponse(payload, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="club-import-template.{extension}"'
        return response


class ClubDataImportUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        club, error = _club(request)
        if error is not None:
            return error
        expire_uploads(club.id)
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "Choose a file."}, status=400)
        name = (upload.name or "").lower()
        if name.endswith(".xlsm"):
            return Response({"detail": "A macro workbook is not accepted."}, status=400)
        suffix = next((item for item in _SUFFIXES if name.endswith(item)), "")
        if not suffix:
            return Response({"detail": "Use a CSV, Excel, JSON, or zip file."}, status=400)
        if upload.size > 5 * 1024 * 1024:
            return Response({"detail": "The file is larger than 5 MB."}, status=400)
        payload = upload.read()
        try:
            parsed = parse_upload(payload, _SUFFIXES[suffix])
        except ImportFileError as exc:
            return Response({"detail": exc.code}, status=400)
        from django.core.files.base import ContentFile

        stored = ClubDataImportUpload(
            club=club,
            requested_by=request.user,
            original_name=(upload.name or "")[:180],
            file_format=_SUFFIXES[suffix],
        )
        stored.stored.save(upload.name or "import.bin", ContentFile(payload), save=True)
        described = describe_upload(parsed, club.id)
        _audit(
            request,
            club,
            "upload",
            format=_SUFFIXES[suffix],
            sheets=[sheet["key"] for sheet in described["sheets"]],
            numbers_included=parsed["numbers_included"],
            batch_id=stored.id,
        )
        return Response({"id": stored.id, **described}, status=201)


class ClubDataImportCheckView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, upload_id: int):
        return _check(request, upload_id, dry_run=False)


class ClubDataImportDryRunView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, upload_id: int):
        return _check(request, upload_id, dry_run=True)


def _check(request, upload_id: int, *, dry_run: bool):
    club, error = _club(request)
    if error is not None:
        return error
    expire_uploads(club.id)
    stored = ClubDataImportUpload.objects.filter(pk=upload_id, club_id=club.id).first()
    if stored is None:
        return Response({"detail": "This file is no longer available."}, status=404)
    try:
        payload = stored.stored.read()
        parsed = parse_upload(payload, stored.file_format)
    except ImportFileError as exc:
        return Response({"detail": exc.code}, status=400)
    finally:
        stored.stored.close()
    mapping = request.data.get("mapping") or {}
    actions = request.data.get("actions") or {}
    if not isinstance(mapping, dict) or not isinstance(actions, dict):
        return Response({"detail": "The column mapping is not valid."}, status=400)
    report = check_upload(parsed, club.id, mapping, actions)
    report["dry_run"] = dry_run
    report["saved"] = False
    _audit(
        request,
        club,
        "dry_run" if dry_run else "check",
        format=stored.file_format,
        row_counts=report["counts"],
        numbers_included=report["numbers_included"],
        contacts_included=report.get("contacts_included", False),
        batch_id=stored.id,
    )
    return Response(report)


class ClubDataImportMappingView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        club, error = _club(request)
        if error is not None:
            return error
        name = str(request.data.get("name") or "").strip()[:80]
        sheet = str(request.data.get("sheet") or "")
        headers = request.data.get("headers") or []
        mapping = request.data.get("mapping") or {}
        if not name or sheet not in ALLOWED_SHEETS:
            return Response({"detail": "Name this mapping."}, status=400)
        if not isinstance(headers, list) or not isinstance(mapping, dict):
            return Response({"detail": "The column mapping is not valid."}, status=400)
        saved = ClubDataSavedMapping.objects.create(
            club=club,
            name=name,
            sheet_key=sheet,
            headers=header_shape([str(item) for item in headers]),
            mapping={str(key): str(value) for key, value in mapping.items()},
            created_by=request.user,
        )
        return Response({"id": saved.id, "name": saved.name}, status=201)


class ClubDataImportCommitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, upload_id: int):
        club, error = _club(request)
        if error is not None:
            return error
        stored = ClubDataImportUpload.objects.filter(pk=upload_id, club_id=club.id).first()
        if stored is None:
            return Response({"detail": "This file is no longer available."}, status=404)
        mapping = request.data.get("mapping") or {}
        actions = request.data.get("actions") or {}
        if not isinstance(mapping, dict) or not isinstance(actions, dict):
            return Response({"detail": "The column mapping is not valid."}, status=400)
        try:
            parsed = parse_upload(stored.stored.read(), stored.file_format)
        except ImportFileError as exc:
            return Response({"detail": exc.code}, status=400)
        finally:
            stored.stored.close()
        report, _decisions = review_upload(parsed, club.id, mapping, actions)
        workable = report["counts"]["create"] + report["counts"]["update"] + report["counts"].get("remove", 0)
        if report["counts"]["error"] or workable < 1:
            return Response({"detail": "Fix the errors before importing.", "counts": report["counts"]}, status=400)
        batch = ClubDataImportBatch.objects.create(
            club=club,
            upload=stored,
            requested_by=request.user,
            mapping=mapping,
            actions=actions,
            grades_included=report["grades_included"],
            numbers_included=report["numbers_included"],
            rows_total=sum(report["counts"].values()),
        )
        _audit(
            request,
            club,
            "commit",
            format=stored.file_format,
            batch_id=batch.id,
            numbers_included=report["numbers_included"],
            grades_included=report["grades_included"],
            contacts_included=report.get("contacts_included", False),
        )
        commit_club_data_import.delay(batch.id)
        batch.refresh_from_db()
        return Response(public_result(batch), status=202)


class ClubDataImportBatchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id: int):
        club, error = _club(request)
        if error is not None:
            return error
        batch = ClubDataImportBatch.objects.filter(pk=batch_id, club_id=club.id).first()
        if batch is None:
            return Response({"detail": "This import is no longer available."}, status=404)
        return Response(public_result(batch))


class ClubDataImportResultView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id: int):
        club, error = _club(request)
        if error is not None:
            return error
        batch = ClubDataImportBatch.objects.filter(pk=batch_id, club_id=club.id).first()
        if batch is None or batch.status != ClubDataImportBatch.Status.SUCCEEDED:
            return Response({"detail": "The result is not ready."}, status=404)
        file_format = str(request.query_params.get("file_format") or "json")
        if file_format == "csv":
            payload = result_csv(batch)
            content_type = "text/csv"
            extension = "csv"
        else:
            payload = result_json(batch)
            content_type = "application/json"
            extension = "json"
        response = HttpResponse(payload, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="import-result-{batch.id}.{extension}"'
        return response


class ClubDataImportUndoView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, batch_id: int):
        club, error = _club(request)
        if error is not None:
            return error
        batch = ClubDataImportBatch.objects.filter(pk=batch_id, club_id=club.id).first()
        if batch is None or batch.status != ClubDataImportBatch.Status.SUCCEEDED:
            return Response({"detail": "This import is no longer available."}, status=404)
        typed = str(request.data.get("batch_id") or "").strip()
        if typed != str(batch.id):
            return Response({"detail": "Type the batch number shown on this page."}, status=400)
        try:
            outcome = undo_batch(batch)
        except ValidationError as exc:
            return Response({"detail": exc.messages[0] if getattr(exc, "messages", None) else str(exc)}, status=400)
        _audit(
            request,
            club,
            "undo",
            batch_id=batch.id,
            grades_kept=outcome["grades_kept"],
            members_kept=outcome["members_kept"],
            numbers_included=False,
        )
        body = public_result(batch)
        body["grades_kept"] = outcome["grades_kept"]
        body["members_kept"] = outcome["members_kept"]
        return Response(body)
