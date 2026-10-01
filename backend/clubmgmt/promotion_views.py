from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from members.grades import OFFICIAL_GRADES
from members.models import Member

from .promotion import promotion_candidates, record_belt_result
from .training_models import BeltTest, BeltTestResult, PromotionRule, TrainingSeries
from .training_views import _club, _parse_date, _require_admin


def _rule_payload(rule: PromotionRule) -> dict:
    return {
        "id": rule.id,
        "to_grade": rule.to_grade,
        "required_hours": f"{rule.required_hours:.2f}",
        "audience": rule.audience,
    }


def _test_payload(row: BeltTest) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "held_on": row.held_on.isoformat(),
        "notes": row.notes,
        "passed_count": row.results.filter(result=BeltTestResult.Result.PASSED).count(),
    }


class PromotionRuleView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        club = _club(request)
        return Response(
            {
                "grades": [grade for grade in OFFICIAL_GRADES if grade != "10th Kup"],
                "rules": [_rule_payload(rule) for rule in club.promotion_rules.all()],
            }
        )

    def post(self, request):
        club = type(self)._club_admin(request)
        to_grade = str(request.data.get("to_grade") or "").strip()
        if to_grade == "10th Kup" or to_grade not in OFFICIAL_GRADES:
            raise ValidationError({"detail": "10th Kup is the white belt. Choose the next grade, from 9th Kup upward."})
        audience = str(request.data.get("audience") or "").strip()
        if audience and audience not in TrainingSeries.Audience.values:
            raise ValidationError({"detail": "Choose which training hours count."})
        try:
            hours = Decimal(str(request.data.get("required_hours")))
        except (InvalidOperation, TypeError) as error:
            raise ValidationError({"detail": "Enter the required hours."}) from error
        if hours < 0:
            raise ValidationError({"detail": "Required hours cannot be negative."})
        rule, _created = PromotionRule.objects.update_or_create(
            club=club,
            to_grade=to_grade,
            defaults={"required_hours": hours, "audience": audience},
        )
        return Response(_rule_payload(rule), status=201)

    @staticmethod
    def _club_admin(request):
        from clubs.models import Club

        return Club.objects.get(pk=_require_admin(request))


class PromotionRuleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, rule_id: int):
        club = PromotionRuleView._club_admin(request)
        rule = club.promotion_rules.filter(id=rule_id).first()
        if rule is None:
            raise ValidationError({"detail": "Rule not found."})
        to_grade = str(request.data.get("to_grade") or rule.to_grade).strip()
        if to_grade == "10th Kup" or to_grade not in OFFICIAL_GRADES:
            raise ValidationError({"detail": "10th Kup is the white belt. Choose the next grade, from 9th Kup upward."})
        if club.promotion_rules.exclude(id=rule.id).filter(to_grade=to_grade).exists():
            raise ValidationError({"detail": "That grade already has a rule."})
        audience = str(request.data.get("audience") if "audience" in request.data else rule.audience).strip()
        if audience and audience not in TrainingSeries.Audience.values:
            raise ValidationError({"detail": "Choose which training hours count."})
        try:
            hours = Decimal(str(request.data.get("required_hours", rule.required_hours)))
        except (InvalidOperation, TypeError) as error:
            raise ValidationError({"detail": "Enter the required hours."}) from error
        if hours < 0:
            raise ValidationError({"detail": "Required hours cannot be negative."})
        rule.to_grade = to_grade
        rule.audience = audience
        rule.required_hours = hours
        rule.save()
        return Response(_rule_payload(rule))

    def delete(self, request, rule_id: int):
        club = PromotionRuleView._club_admin(request)
        deleted, _ = club.promotion_rules.filter(id=rule_id).delete()
        if not deleted:
            raise ValidationError({"detail": "Rule not found."})
        return Response(status=204)


class BeltTestView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        club = _club(request)
        return Response([_test_payload(row) for row in club.belt_tests.all()])

    def post(self, request):
        club = PromotionRuleView._club_admin(request)
        name = str(request.data.get("name") or "").strip() or "Belt test"
        held_on = _parse_date(request.data.get("held_on"), "held_on")
        row = BeltTest.objects.create(club=club, name=name, held_on=held_on, notes=str(request.data.get("notes") or ""))
        return Response(_test_payload(row), status=201)


class BeltTestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, test_id: int):
        club = _club(request)
        row = club.belt_tests.filter(id=test_id).first()
        if row is None:
            raise ValidationError({"detail": "Belt test not found."})
        results = {item.member_id: item.result for item in row.results.all()}
        candidates = []
        for candidate in promotion_candidates(club, row.held_on):
            candidate["result"] = results.get(candidate["member_id"], "")
            candidates.append(candidate)
        return Response({**_test_payload(row), "candidates": candidates})

    def delete(self, request, test_id: int):
        club = PromotionRuleView._club_admin(request)
        row = club.belt_tests.filter(id=test_id).first()
        if row is None:
            raise ValidationError({"detail": "Belt test not found."})
        if row.results.filter(result=BeltTestResult.Result.PASSED).exists():
            raise ValidationError({"detail": "This test already recorded a pass. Remove that grade from the member first."})
        row.delete()
        return Response(status=204)


class BeltTestResultView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, test_id: int):
        club = _club(request)
        row = club.belt_tests.filter(id=test_id).first()
        if row is None:
            raise ValidationError({"detail": "Belt test not found."})
        member = Member.objects.filter(id=request.data.get("member_id"), club=club).first()
        if member is None:
            raise ValidationError({"detail": "Member not found."})
        try:
            saved = record_belt_result(row, member, str(request.data.get("result") or ""), request.user)
        except DjangoValidationError as error:
            raise ValidationError({"detail": " ".join(error.messages)}) from error
        return Response({"member_id": saved.member_id, "to_grade": saved.to_grade, "result": saved.result, "hours": f"{saved.hours:.2f}"})
