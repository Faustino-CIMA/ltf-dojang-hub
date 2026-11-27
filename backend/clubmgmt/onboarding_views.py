import hashlib
from datetime import date
from pathlib import Path

from django.db import transaction
from django.http import FileResponse
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from clubs.models import Club

from .onboarding_models import ClubOnboardingSettings, ClubRulesVersion
from .views import ClubMgmtPermission, _require_club

REQUIREMENTS = {choice for choice, _label in ClubOnboardingSettings.Requirement.choices}
NOTE_LIMIT = 1000
FILE_LIMIT = 8 * 1024 * 1024
ALLOWED_SUFFIXES = {".pdf", ".txt"}


def settings_for(club: Club) -> ClubOnboardingSettings:
    row, _created = ClubOnboardingSettings.objects.get_or_create(club=club)
    return row


def rules_payload(row: ClubRulesVersion) -> dict:
    name = Path(row.file.name).name if row.file else ""
    return {
        "id": row.id,
        "version": row.version,
        "effective_on": row.effective_on.isoformat(),
        "kind": "file" if row.file else "url",
        "filename": name,
        "url": row.url,
        "sha256": row.sha256,
        "is_current": row.is_current,
    }


def onboarding_payload(club: Club) -> dict:
    row = settings_for(club)
    versions = ClubRulesVersion.objects.filter(club=club)
    return {
        "public_link_enabled": row.public_link_enabled,
        "invites_enabled": row.invites_enabled,
        "equipment_note": row.equipment_note,
        "photo_requirement": row.photo_requirement,
        "medico_requirement": row.medico_requirement,
        "rules": [rules_payload(version) for version in versions],
    }


def _requirement(value, field: str) -> str:
    choice = str(value or "").strip()
    if choice not in REQUIREMENTS:
        raise ValidationError({field: "Choose hidden, optional, or required."})
    return choice


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class ClubOnboardingView(APIView):
    permission_classes = [ClubMgmtPermission]

    def get(self, request):
        club_id = _require_club(request)
        club = Club.objects.get(pk=club_id)
        return Response(onboarding_payload(club))

    def patch(self, request):
        club_id = _require_club(request)
        club = Club.objects.get(pk=club_id)
        row = settings_for(club)
        data = request.data
        if "public_link_enabled" in data:
            row.public_link_enabled = bool(data.get("public_link_enabled"))
        if "invites_enabled" in data:
            row.invites_enabled = bool(data.get("invites_enabled"))
        if "equipment_note" in data:
            note = str(data.get("equipment_note") or "").strip()
            if len(note) > NOTE_LIMIT:
                raise ValidationError({"equipment_note": "Keep the equipment note to 1000 characters."})
            row.equipment_note = note
        if "photo_requirement" in data:
            row.photo_requirement = _requirement(data.get("photo_requirement"), "photo_requirement")
        if "medico_requirement" in data:
            row.medico_requirement = _requirement(data.get("medico_requirement"), "medico_requirement")
        row.save()
        return Response(onboarding_payload(club))


class ClubRulesVersionView(APIView):
    permission_classes = [ClubMgmtPermission]

    def post(self, request):
        club_id = _require_club(request)
        club = Club.objects.get(pk=club_id)
        raw_date = str(request.data.get("effective_on") or "").strip()
        try:
            effective_on = date.fromisoformat(raw_date)
        except ValueError as exc:
            raise ValidationError({"effective_on": "Enter the date this version is in force."}) from exc
        upload = request.FILES.get("file")
        url = str(request.data.get("url") or "").strip()
        if bool(upload) == bool(url):
            raise ValidationError({"file": "Add a file or a link, not both."})
        if upload:
            suffix = Path(upload.name).suffix.lower()
            if suffix not in ALLOWED_SUFFIXES:
                raise ValidationError({"file": "Upload a PDF or a text file."})
            if upload.size > FILE_LIMIT:
                raise ValidationError({"file": "The file is too large."})
            digest = _sha256(upload.read())
            upload.seek(0)
            stored_url = ""
        else:
            if not url.startswith("https://") and not url.startswith("http://"):
                raise ValidationError({"url": "The link must start with http:// or https://."})
            if len(url) > 500:
                raise ValidationError({"url": "The link is too long."})
            digest = _sha256(url.encode("utf-8"))
            stored_url = url
            upload = None
        with transaction.atomic():
            ClubRulesVersion.objects.filter(club=club, is_current=True).update(is_current=False)
            last = ClubRulesVersion.objects.filter(club=club).order_by("-version").first()
            version = ClubRulesVersion(
                club=club,
                version=(last.version if last else 0) + 1,
                effective_on=effective_on,
                url=stored_url,
                sha256=digest,
                is_current=True,
                created_by=request.user if request.user.is_authenticated else None,
            )
            if upload is not None:
                version.file = upload
            version.save()
        return Response(rules_payload(version), status=201)


class ClubRulesFileView(APIView):
    permission_classes = [ClubMgmtPermission]

    def get(self, request, version_id: int):
        club_id = _require_club(request)
        row = ClubRulesVersion.objects.filter(pk=version_id, club_id=club_id).first()
        if row is None or not row.file:
            raise NotFound()
        return FileResponse(row.file.open("rb"), as_attachment=False, filename=Path(row.file.name).name)
