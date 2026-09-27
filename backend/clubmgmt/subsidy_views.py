from __future__ import annotations

from datetime import date
from pathlib import Path

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from clubs.models import Club
from members.models import Member

from .models import CoachQualification, ExtraordinarySubsidy, MemberRecord, SubsidySeason, validate_luxembourg_ssn
from .subsidies import (
    build_dossier,
    fill_extraordinary_pdf,
    get_or_create_season,
    is_adult,
    render_trainers_list_pdf,
    render_training_list_pdf,
    sync_subsidy_income,
    youth_csv,
    youth_xlsx,
)
from .views import ClubMgmtPermission, _require_club

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
UPLOAD_SUFFIXES = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}


def _club(request) -> Club:
    return Club.objects.get(pk=_require_club(request))


def _year(request) -> int:
    raw = request.query_params.get("year") or request.data.get("year") or date.today().year
    try:
        return int(raw)
    except (TypeError, ValueError) as error:
        raise ValidationError({"year": "Enter a year."}) from error


def _checked_upload(uploaded):
    if uploaded is None:
        raise ValidationError({"file": "Choose a file."})
    suffix = Path(getattr(uploaded, "name", "")).suffix.lower()
    if suffix not in UPLOAD_SUFFIXES:
        raise ValidationError({"file": "Use a PDF or a photo (JPG, PNG, WEBP)."})
    if getattr(uploaded, "size", 0) > MAX_UPLOAD_BYTES:
        raise ValidationError({"file": "The file must be 10 MB or smaller."})
    return uploaded


class SubsidyDossierView(APIView):
    permission_classes = [ClubMgmtPermission]

    def get(self, request):
        club = _club(request)
        year = _year(request)
        season = get_or_create_season(club, year)
        sync_subsidy_income(season, request.user, update_existing=False)
        return Response(build_dossier(club, year))

    def patch(self, request):
        club = _club(request)
        season = get_or_create_season(club, _year(request))
        data = request.data
        previous = season.status
        if "season_complete" in data:
            season.season_complete = bool(data.get("season_complete"))
        if "rib_attached" in data:
            season.rib_attached = bool(data.get("rib_attached"))
        if "myguichet_users" in data:
            season.myguichet_users = max(0, int(data.get("myguichet_users") or 0))
        if "non_licensed_count" in data:
            season.non_licensed_count = max(0, int(data.get("non_licensed_count") or 0))
        if "training_place" in data:
            from .training_models import TrainingSettings

            settings, _created = TrainingSettings.objects.get_or_create(club=club)
            settings.default_place = str(data.get("training_place") or "").strip()[:120]
            settings.save(update_fields=["default_place"])
        if data.get("status") in SubsidySeason.Status.values:
            season.status = data["status"]
        for field in ("submitted_on", "paid_on", "deadline"):
            if field in data:
                raw = str(data.get(field) or "").strip()
                setattr(season, field, date.fromisoformat(raw) if raw else None)
        if "paid_amount" in data:
            raw = str(data.get("paid_amount") or "").strip().replace(",", ".")
            season.paid_amount = raw or None
        today = timezone.localdate()
        if (
            season.status == SubsidySeason.Status.SUBMITTED
            and previous != SubsidySeason.Status.SUBMITTED
            and "submitted_on" not in data
            and season.submitted_on is None
        ):
            season.submitted_on = today
        if (
            season.status == SubsidySeason.Status.PAID
            and previous != SubsidySeason.Status.PAID
            and "paid_on" not in data
            and season.paid_on is None
        ):
            season.paid_on = today
        season.save()
        sync_subsidy_income(season, request.user, update_existing=True)
        return Response(build_dossier(club, season.year))


class SubsidyRibView(APIView):
    permission_classes = [ClubMgmtPermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        club = _club(request)
        season = get_or_create_season(club, _year(request))
        upload = _checked_upload(request.FILES.get("file"))
        season.rib_file.save(Path(upload.name).name, upload, save=False)
        season.rib_attached = True
        season.save(update_fields=["rib_file", "rib_attached", "updated_at"])
        return Response(build_dossier(club, season.year))

    def get(self, request):
        club = _club(request)
        season = get_or_create_season(club, _year(request))
        if not season.rib_file:
            raise ValidationError({"detail": "No bank identity statement has been added."})
        return FileResponse(season.rib_file.open("rb"), as_attachment=True, filename=Path(season.rib_file.name).name)

    def delete(self, request):
        club = _club(request)
        season = get_or_create_season(club, _year(request))
        if season.rib_file:
            season.rib_file.delete(save=False)
        season.rib_attached = False
        season.save(update_fields=["rib_file", "rib_attached", "updated_at"])
        return Response(build_dossier(club, season.year))


class SubsidyCoachView(APIView):
    permission_classes = [ClubMgmtPermission]

    def post(self, request):
        club = _club(request)
        user_id = request.data.get("user_id")
        if not club.trainers.filter(id=user_id).exists():
            raise ValidationError({"user_id": "Choose a coach of this club."})
        level = str(request.data.get("eqf_level") or "")
        if level and level not in CoachQualification.Level.values:
            raise ValidationError({"eqf_level": "Unknown qualification."})
        diploma = str(request.data.get("diploma_status") or CoachQualification.Diploma.MISSING)
        if diploma not in CoachQualification.Diploma.values:
            raise ValidationError({"diploma_status": "Unknown diploma status."})
        CoachQualification.objects.update_or_create(
            club=club,
            user_id=user_id,
            defaults={
                "eqf_level": level,
                "coaches_under_16": bool(request.data.get("coaches_under_16")),
                "diploma_status": diploma,
            },
        )
        return Response(build_dossier(club, _year(request)))


class SubsidyDiplomaView(APIView):
    permission_classes = [ClubMgmtPermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _qualification(self, request, user_id: int) -> CoachQualification:
        club = _club(request)
        if not club.trainers.filter(id=user_id).exists():
            raise ValidationError({"user_id": "Choose a coach of this club."})
        qualification, _created = CoachQualification.objects.get_or_create(club=club, user_id=user_id)
        return qualification

    def post(self, request, user_id: int):
        qualification = self._qualification(request, user_id)
        upload = _checked_upload(request.FILES.get("file"))
        qualification.diploma_file.save(Path(upload.name).name, upload, save=False)
        qualification.diploma_status = CoachQualification.Diploma.ATTACHED
        qualification.save(update_fields=["diploma_file", "diploma_status", "updated_at"])
        return Response(build_dossier(qualification.club, _year(request)))

    def get(self, request, user_id: int):
        qualification = self._qualification(request, user_id)
        if not qualification.diploma_file:
            raise ValidationError({"detail": "No diploma has been added."})
        return FileResponse(
            qualification.diploma_file.open("rb"),
            as_attachment=True,
            filename=Path(qualification.diploma_file.name).name,
        )

    def delete(self, request, user_id: int):
        qualification = self._qualification(request, user_id)
        if qualification.diploma_file:
            qualification.diploma_file.delete(save=False)
        if qualification.diploma_status == CoachQualification.Diploma.ATTACHED:
            qualification.diploma_status = CoachQualification.Diploma.MISSING
        qualification.save(update_fields=["diploma_file", "diploma_status", "updated_at"])
        return Response(build_dossier(qualification.club, _year(request)))


class SubsidyYouthIdView(APIView):
    permission_classes = [ClubMgmtPermission]

    def post(self, request):
        club = _club(request)
        member = Member.objects.filter(id=request.data.get("member_id"), club=club).first()
        if member is None:
            raise ValidationError({"member_id": "Member not found."})
        raw = str(request.data.get("national_id") or "").strip()
        if raw:
            try:
                validate_luxembourg_ssn(raw)
            except DjangoValidationError as error:
                raise ValidationError({"national_id": error.messages}) from error
        record, _created = MemberRecord.objects.get_or_create(member=member)
        record.social_security_number = raw
        record.save(update_fields=["social_security_number"])
        return Response(build_dossier(club, _year(request)))


class SubsidyYouthCsvView(APIView):
    permission_classes = [ClubMgmtPermission]

    def get(self, request):
        club = _club(request)
        year = _year(request)
        payload = youth_csv(club, year)
        response = HttpResponse(payload, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="youth-{club.id}-{year}.csv"'
        return response


class SubsidyTrainingListPdfView(APIView):
    permission_classes = [ClubMgmtPermission]

    def get(self, request):
        club = _club(request)
        year = _year(request)
        pdf = render_training_list_pdf(club, year)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="entrainements-{club.id}-{year}.pdf"'
        return response


class SubsidyTrainersListPdfView(APIView):
    permission_classes = [ClubMgmtPermission]

    def get(self, request):
        club = _club(request)
        year = _year(request)
        pdf = render_trainers_list_pdf(club, year)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="entraineurs-{club.id}-{year}.pdf"'
        return response


class SubsidyYouthXlsxView(APIView):
    permission_classes = [ClubMgmtPermission]

    def get(self, request):
        club = _club(request)
        year = _year(request)
        payload = youth_xlsx(club, year)
        response = HttpResponse(
            payload,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="effectifs-{club.id}-{year}.xlsx"'
        return response


class ExtraordinarySubsidyView(APIView):
    permission_classes = [ClubMgmtPermission]

    def post(self, request):
        club = _club(request)
        year = _year(request)
        case = ExtraordinarySubsidy(club=club, year=year)
        _apply_case(case, request.data)
        case.save()
        return Response({"id": case.id, **build_dossier(club, year)})


class ExtraordinarySubsidyDetailView(APIView):
    permission_classes = [ClubMgmtPermission]

    def patch(self, request, case_id: int):
        club = _club(request)
        case = _case_or_404(club, case_id)
        _apply_case(case, request.data, partial=True)
        case.save()
        return Response(build_dossier(club, case.year))

    def delete(self, request, case_id: int):
        club = _club(request)
        case = _case_or_404(club, case_id)
        year = case.year
        case.delete()
        return Response(build_dossier(club, year))


class ExtraordinarySubsidyPdfView(APIView):
    permission_classes = [ClubMgmtPermission]

    def get(self, request, case_id: int):
        club = _club(request)
        case = _case_or_404(club, case_id)
        pdf = fill_extraordinary_pdf(case)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="subsidy-{case.id}.pdf"'
        return response


def _case_or_404(club, case_id: int) -> ExtraordinarySubsidy:
    case = ExtraordinarySubsidy.objects.filter(id=case_id, club=club).first()
    if case is None:
        raise ValidationError({"detail": "Request not found."})
    return case


def _apply_case(case: ExtraordinarySubsidy, data, *, partial: bool = False) -> None:
    if not partial or "kind" in data:
        kind = str(data.get("kind") or case.kind or "")
        if kind not in ExtraordinarySubsidy.Kind.values:
            raise ValidationError({"kind": "Choose a subsidy type."})
        case.kind = kind
    if not partial or "title" in data:
        title = str(data.get("title") or "").strip()
        if not title:
            raise ValidationError({"title": "Name the event."})
        case.title = title
    if not partial or "place" in data:
        case.place = str(data.get("place") or "")
    if not partial or "starts_on" in data:
        case.starts_on = _optional_date(data.get("starts_on"))
    if not partial or "ends_on" in data:
        case.ends_on = _optional_date(data.get("ends_on"))
    if not partial or "athlete_ids" in data:
        case.athlete_ids = _id_list(data.get("athlete_ids"))
    if not partial or "official_ids" in data:
        case.official_ids = _adult_official_ids(case.club, case.year, _id_list(data.get("official_ids")))
    if not partial or "travel_mode" in data:
        mode = str(data.get("travel_mode") or "")
        if mode and mode not in ExtraordinarySubsidy.Travel.values:
            raise ValidationError({"travel_mode": "Choose train, car, or plane."})
        case.travel_mode = mode
    if not partial or "travel_units" in data:
        case.travel_units = _optional_decimal(data.get("travel_units"))
    if not partial or "travel_rate" in data:
        case.travel_rate = _optional_decimal(data.get("travel_rate"))
    if not partial or "stay_people" in data:
        case.stay_people = _optional_int(data.get("stay_people"))
    if not partial or "stay_days" in data:
        case.stay_days = _optional_int(data.get("stay_days"))
    if not partial or "stay_rate" in data:
        case.stay_rate = _optional_decimal(data.get("stay_rate"))
    if not partial or "entry_fee" in data:
        case.entry_fee = _optional_decimal(data.get("entry_fee"))
    if not partial or "medical_fee" in data:
        case.medical_fee = _optional_decimal(data.get("medical_fee"))
    if not partial or "supplies_fee" in data:
        case.supplies_fee = _optional_decimal(data.get("supplies_fee"))
    if not partial or "notes" in data:
        case.notes = str(data.get("notes") or "")
    if data.get("status") in ExtraordinarySubsidy.Status.values:
        case.status = data["status"]
    elif not partial and not case.status:
        case.status = ExtraordinarySubsidy.Status.DRAFT


def _optional_date(value):
    raw = str(value or "").strip()
    return date.fromisoformat(raw) if raw else None


def _optional_int(value) -> int:
    raw = str(value or "").strip()
    if not raw:
        return 0
    try:
        return max(0, int(raw))
    except ValueError as error:
        raise ValidationError({"detail": "Enter a whole number."}) from error


def _optional_decimal(value):
    raw = str(value or "").strip().replace(",", ".")
    return raw or None


def _adult_official_ids(club, year: int, ids: list[int]) -> list[int]:
    if not ids:
        return []
    cutoff = date(year, 12, 31)
    allowed = {
        member.id
        for member in Member.objects.filter(club=club, id__in=ids, is_active=True)
        if is_adult(member.date_of_birth, cutoff)
    }
    return [member_id for member_id in ids if member_id in allowed]


def _id_list(value) -> list[int]:
    if not isinstance(value, list):
        return []
    ids = []
    for item in value:
        try:
            ids.append(int(item))
        except (TypeError, ValueError):
            continue
    return ids
