from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError

from members.grades import OFFICIAL_GRADES
from members.models import GradePromotionHistory, Member
from members.services import add_grade_promotion

from .training import age_on, session_hours
from .training_models import BeltTest, BeltTestResult, PromotionRule, TrainingAttendance, TrainingSession

KUP = [grade for grade in OFFICIAL_GRADES if grade.endswith(" Kup")]
POOM = [grade for grade in OFFICIAL_GRADES if grade.endswith(" Poom")]
DAN = [grade for grade in OFFICIAL_GRADES if grade.endswith(" Dan")]


def next_grade(current: str, age: int | None) -> str | None:
    grade = str(current or "").strip() or KUP[0]
    if grade in KUP:
        index = KUP.index(grade)
        if index + 1 < len(KUP):
            return KUP[index + 1]
        return POOM[0] if age is not None and age < 15 else DAN[0]
    if grade in POOM:
        index = POOM.index(grade)
        if age is not None and age < 15 and index + 1 < len(POOM):
            return POOM[index + 1]
        return DAN[index + 1] if index + 1 < len(DAN) else None
    if grade in DAN:
        index = DAN.index(grade)
        return DAN[index + 1] if index + 1 < len(DAN) else None
    return None


def _hours_for(member_ids: list[int], club_id: int) -> dict[int, list[tuple]]:
    rows: dict[int, list[tuple]] = {member_id: [] for member_id in member_ids}
    attendances = TrainingAttendance.objects.filter(
        member_id__in=member_ids,
        session__club_id=club_id,
        session__status=TrainingSession.Status.HELD,
    ).select_related("session")
    for row in attendances:
        rows[row.member_id].append((row.session.held_on, row.session.audience, session_hours(row.session)))
    return rows


def _counted_hours(events: list[tuple], since, audience: str) -> Decimal:
    total = Decimal("0")
    for held_on, event_audience, hours in events:
        if since is not None and held_on < since:
            continue
        if audience and event_audience != audience:
            continue
        total += hours
    return total


def promotion_candidates(club, on) -> list[dict]:
    members = list(club.members.filter(is_active=True).order_by("last_name", "first_name", "id"))
    member_ids = [member.id for member in members]
    latest: dict[int, GradePromotionHistory] = {}
    for row in GradePromotionHistory.objects.filter(member_id__in=member_ids).order_by("-promotion_date", "-created_at"):
        latest.setdefault(row.member_id, row)
    rules = {rule.to_grade: rule for rule in PromotionRule.objects.filter(club=club)}
    events = _hours_for(member_ids, club.id)
    candidates = []
    for member in members:
        age = age_on(member.date_of_birth, on)
        current = str(member.belt_rank or "").strip() or KUP[0]
        target = next_grade(current, age)
        if target is None:
            continue
        previous = latest.get(member.id)
        since = previous.promotion_date if previous else None
        rule = rules.get(target)
        audience = rule.audience if rule else ""
        hours = _counted_hours(events.get(member.id, []), since, audience)
        required = rule.required_hours if rule else None
        candidates.append(
            {
                "member_id": member.id,
                "name": f"{member.first_name} {member.last_name}".strip(),
                "age": age,
                "from_grade": current,
                "to_grade": target,
                "since": since.isoformat() if since else "",
                "hours": f"{hours:.2f}",
                "required_hours": f"{required:.2f}" if required is not None else "",
                "audience": audience,
                "ready": required is not None and hours >= required,
            }
        )
    return candidates


def record_belt_result(belt_test: BeltTest, member: Member, result: str, actor) -> BeltTestResult:
    if result not in BeltTestResult.Result.values:
        raise ValidationError({"detail": "Choose passed or failed."})
    if member.club_id != belt_test.club_id or not member.is_active:
        raise ValidationError({"detail": "Choose an active member of this club."})
    existing = BeltTestResult.objects.filter(belt_test=belt_test, member=member).first()
    if existing and existing.result == BeltTestResult.Result.PASSED:
        raise ValidationError({"detail": "This pass is already recorded on the member's grades."})
    age = age_on(member.date_of_birth, belt_test.held_on)
    current = str(member.belt_rank or "").strip() or KUP[0]
    target = next_grade(current, age)
    if target is None:
        raise ValidationError({"detail": "This member has no next official grade."})
    snapshot = next(
        (row for row in promotion_candidates(belt_test.club, belt_test.held_on) if row["member_id"] == member.id),
        None,
    )
    hours = Decimal(snapshot["hours"]) if snapshot else Decimal("0")
    if result == BeltTestResult.Result.PASSED:
        try:
            add_grade_promotion(
                member,
                to_grade=target,
                from_grade=current,
                actor=actor,
                promotion_date=belt_test.held_on,
                exam_date=belt_test.held_on,
                notes=belt_test.name,
                created_by=getattr(actor, "username", "") or "",
                metadata={"belt_test_id": belt_test.id},
            )
        except DjangoValidationError as error:
            messages = getattr(error, "messages", None) or [str(error)]
            raise ValidationError({"detail": " ".join(str(item) for item in messages)}) from error
    saved, _created = BeltTestResult.objects.update_or_create(
        belt_test=belt_test,
        member=member,
        defaults={
            "to_grade": target,
            "result": result,
            "hours": hours,
            "recorded_by": actor if getattr(actor, "is_authenticated", False) else None,
        },
    )
    return saved
