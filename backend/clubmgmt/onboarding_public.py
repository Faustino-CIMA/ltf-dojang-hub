"""Public club facts for the join page. No member list and no private numbers."""

from datetime import time
from pathlib import Path

from django.utils import timezone

from clubs.models import BrandingAsset, Club

from .models import (
    ClubLicenseFee,
    ClubLicenseFeePrice,
    Committee,
    CommitteeMandate,
    MembershipFee,
    MembershipFeePrice,
)
from .onboarding_models import ClubOnboardingSettings, ClubRulesVersion
from .training_models import TrainingSeries

_ROLE_ORDER = [
    CommitteeMandate.Role.PRESIDENT,
    CommitteeMandate.Role.VICE_PRESIDENT,
    CommitteeMandate.Role.SECRETARY_GENERAL,
    CommitteeMandate.Role.SECRETARY,
    CommitteeMandate.Role.TREASURER,
    CommitteeMandate.Role.CASHIER_AUDITOR,
    CommitteeMandate.Role.COMMITTEE_MEMBER,
    CommitteeMandate.Role.OTHER,
]
_LOGO_ORDER = (
    BrandingAsset.UsageType.INVOICE,
    BrandingAsset.UsageType.PRINT,
    BrandingAsset.UsageType.GENERAL,
    BrandingAsset.UsageType.DIGITAL,
)


def _money(amount) -> str:
    return f"{amount:.2f}"


def _person_name(last, first) -> str:
    return " ".join(part for part in (str(last or "").strip(), str(first or "").strip()) if part)


def _clock(value: time) -> str:
    return value.strftime("%H:%M")


def open_club(club_id: int) -> Club | None:
    club = Club.objects.filter(pk=club_id, is_active=True).first()
    if club is None:
        return None
    settings = ClubOnboardingSettings.objects.filter(club=club, public_link_enabled=True).first()
    if settings is None:
        return None
    club._onboarding_settings = settings
    return club


def _logo_path(club: Club) -> str:
    logos = [
        row
        for row in BrandingAsset.objects.filter(
            club=club,
            asset_type=BrandingAsset.AssetType.LOGO,
            is_selected=True,
        )
        if row.file
    ]
    chosen = None
    for usage in _LOGO_ORDER:
        chosen = next((row for row in logos if row.usage_type == usage), None)
        if chosen:
            break
    if chosen is None and logos:
        chosen = logos[0]
    if chosen is None:
        return ""
    return f"/api/clubs/{club.id}/logos/{chosen.id}/content/"


def _fees(club: Club, year: int) -> list[dict]:
    rows = MembershipFee.objects.filter(club=club, is_active=True).order_by("name", "id")
    payload = []
    for fee in rows:
        if fee.year not in (None, year):
            continue
        payload.append({"name": fee.name, "amount": _money(MembershipFeePrice.amount_for_year(fee, year))})
    return payload


def _license_fee(club: Club, year: int) -> dict | None:
    fee = ClubLicenseFee.objects.filter(club=club).first()
    if fee is None:
        return None
    amount = ClubLicenseFeePrice.amount_for_year(fee, year)
    if amount is None or amount <= 0:
        return None
    return {"name": fee.name, "amount": _money(amount)}


def _timetable(club: Club) -> list[dict]:
    series = (
        TrainingSeries.objects.filter(club=club, active=True)
        .select_related("venue")
        .order_by("weekday", "start_time", "id")
    )
    rows = []
    for row in series:
        place = row.venue.name if row.venue_id and row.venue else row.place
        rows.append(
            {
                "name": row.name,
                "audience": row.audience,
                "weekday": row.weekday,
                "start_time": _clock(row.start_time),
                "end_time": _clock(row.end_time),
                "place": place,
            }
        )
    return rows


def _committee(club: Club) -> list[dict]:
    today = timezone.localdate()
    mandates = (
        CommitteeMandate.objects.filter(
            committee__scope=Committee.Scope.CLUB,
            committee__club=club,
        )
        .filter(CommitteeMandate.active_q(today))
        .select_related("member", "person")
    )
    rows = []
    for mandate in mandates:
        if mandate.member_id:
            name = _person_name(mandate.member.last_name, mandate.member.first_name)
        elif mandate.person_id:
            name = _person_name(mandate.person.last_name, mandate.person.first_name)
        else:
            continue
        rows.append({"role": mandate.role, "title": mandate.title, "name": name})
    order = {role: index for index, role in enumerate(_ROLE_ORDER)}
    rows.sort(key=lambda row: (order.get(row["role"], 99), row["name"]))
    return rows


def _coaches(club: Club) -> list[str]:
    people = club.trainers.order_by("last_name", "first_name", "id")
    return [_person_name(user.last_name, user.first_name) for user in people if _person_name(user.last_name, user.first_name)]


def _rules(club: Club) -> dict | None:
    current = ClubRulesVersion.objects.filter(club=club, is_current=True).first()
    if current is None:
        return None
    if current.file:
        return {
            "version": current.version,
            "effective_on": current.effective_on.isoformat(),
            "kind": "file",
            "url": "",
            "filename": Path(current.file.name).name,
        }
    if not current.url:
        return None
    return {
        "version": current.version,
        "effective_on": current.effective_on.isoformat(),
        "kind": "url",
        "url": current.url,
        "filename": "",
    }


def public_overview(club: Club) -> dict:
    year = timezone.localdate().year
    settings = club._onboarding_settings
    return {
        "name": club.name,
        "city": club.city,
        "logo_url": _logo_path(club),
        "email": club.email,
        "website": club.website,
        "iban": club.iban,
        "bank_name": club.bank_name,
        "equipment_note": settings.equipment_note,
        "fees": _fees(club, year),
        "license_fee": _license_fee(club, year),
        "timetable": _timetable(club),
        "rules": _rules(club),
        "committee": _committee(club),
        "coaches": _coaches(club),
    }


def current_rules_file(club: Club) -> ClubRulesVersion | None:
    row = ClubRulesVersion.objects.filter(club=club, is_current=True).first()
    if row is None or not row.file:
        return None
    return row
