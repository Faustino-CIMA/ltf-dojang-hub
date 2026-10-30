"""Superuser screens for the office map, hand grants, contact links, and duty exceptions."""

from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import response, status, views

from accounts.duties import MAX_EXCEPTION_DAYS, OWN_CLUB, OWN_INVOICE, exception_span_ok
from accounts.models import DeskGrant, OfficeDeskMap, User
from accounts.offices import sync_office, sync_person
from clubmgmt.models import CommitteeMandate, Person

from .models import OpsAuditLog
from .permissions import IsSuperuser

OFFICES = [choice[0] for choice in CommitteeMandate.Role.choices]
DESKS = [choice[0] for choice in DeskGrant.Desk.choices]
LEVELS = [choice[0] for choice in DeskGrant.Level.choices]


def _name(user) -> str:
    last = (user.last_name or "").strip()
    first = (user.first_name or "").strip()
    if last or first:
        return f"{last} {first}".strip()
    return user.username


def _audit(request, action, target_type, target_id, message, metadata):
    OpsAuditLog.objects.create(
        actor=request.user,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        message=message,
        metadata=metadata,
    )


class OpsOfficeMapView(views.APIView):
    permission_classes = [IsSuperuser]

    def get(self, request):
        rows = OfficeDeskMap.objects.all()
        grouped = {office: [] for office in OFFICES}
        for row in rows:
            grouped.setdefault(row.office, []).append({"desk": row.desk, "level": row.level})
        return response.Response(
            {
                "offices": [{"office": office, "desks": grouped.get(office, [])} for office in OFFICES],
                "desk_choices": DESKS,
                "level_choices": LEVELS,
            }
        )

    def post(self, request):
        office = str(request.data.get("office") or "")
        if office not in OFFICES:
            return response.Response({"detail": "Unknown office."}, status=status.HTTP_400_BAD_REQUEST)
        incoming = request.data.get("desks") or []
        cleaned = []
        seen = set()
        for item in incoming:
            desk = str(item.get("desk") or "")
            level = str(item.get("level") or "")
            if desk not in DESKS or level not in LEVELS or desk in seen:
                return response.Response({"detail": "Choose a desk and a level."}, status=status.HTTP_400_BAD_REQUEST)
            if desk in {DeskGrant.Desk.CLUB_ADMIN, DeskGrant.Desk.COACH}:
                return response.Response({"detail": "Club desks are not granted by an office."}, status=status.HTTP_400_BAD_REQUEST)
            seen.add(desk)
            cleaned.append((desk, level))
        before = list(OfficeDeskMap.objects.filter(office=office).values("desk", "level"))
        OfficeDeskMap.objects.filter(office=office).exclude(desk__in=seen).delete()
        for desk, level in cleaned:
            OfficeDeskMap.objects.update_or_create(office=office, desk=desk, defaults={"level": level})
        sync_office(office, actor=request.user)
        _audit(
            request,
            "desk.map_changed",
            "office_desk_map",
            office,
            "Office map changed.",
            {"office": office, "before": before, "after": [{"desk": desk, "level": level} for desk, level in cleaned]},
        )
        return self.get(request)


class OpsDeskGrantView(views.APIView):
    permission_classes = [IsSuperuser]

    def get(self, request):
        today = timezone.localdate()
        grants = (
            DeskGrant.objects.filter(valid_from__lte=today)
            .filter(Q(valid_until__isnull=True) | Q(valid_until__gt=today))
            .select_related("user", "club")
            .order_by("user__last_name", "user__first_name", "desk")
        )
        return response.Response(
            {
                "results": [
                    {
                        "id": grant.id,
                        "user_id": grant.user_id,
                        "name": _name(grant.user),
                        "username": grant.user.username,
                        "desk": grant.desk,
                        "level": grant.level,
                        "club_id": grant.club_id,
                        "club_name": grant.club.name if grant.club_id else "",
                        "source": grant.source,
                        "valid_from": grant.valid_from.isoformat(),
                        "valid_until": grant.valid_until.isoformat() if grant.valid_until else None,
                        "reason": grant.reason,
                    }
                    for grant in grants
                ]
            }
        )

    def post(self, request):
        user = User.objects.filter(pk=request.data.get("user_id")).first()
        if user is None:
            return response.Response({"detail": "Choose a person."}, status=status.HTTP_400_BAD_REQUEST)
        desk = str(request.data.get("desk") or "")
        level = str(request.data.get("level") or "")
        if desk not in DESKS or level not in LEVELS:
            return response.Response({"detail": "Choose a desk and a level."}, status=status.HTTP_400_BAD_REQUEST)
        club_id = request.data.get("club_id") or None
        if desk in {DeskGrant.Desk.CLUB_ADMIN, DeskGrant.Desk.COACH} and not club_id:
            return response.Response({"detail": "This desk needs a club."}, status=status.HTTP_400_BAD_REQUEST)
        if desk not in {DeskGrant.Desk.CLUB_ADMIN, DeskGrant.Desk.COACH}:
            club_id = None
        try:
            valid_from = date.fromisoformat(str(request.data.get("valid_from") or "")[:10])
        except ValueError:
            valid_from = timezone.localdate()
        valid_until = None
        raw_until = request.data.get("valid_until") or None
        if raw_until:
            try:
                valid_until = date.fromisoformat(str(raw_until)[:10])
            except ValueError:
                return response.Response({"detail": "Enter an end date."}, status=status.HTTP_400_BAD_REQUEST)
        if level == DeskGrant.Level.READ_ONLY and valid_until is None:
            return response.Response({"detail": "A read-only grant needs an end date."}, status=status.HTTP_400_BAD_REQUEST)
        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            return response.Response({"detail": "A reason is required."}, status=status.HTTP_400_BAD_REQUEST)
        grant = DeskGrant.objects.create(
            user=user,
            desk=desk,
            level=level,
            club_id=club_id,
            source=DeskGrant.Source.MANUAL,
            valid_from=valid_from,
            valid_until=valid_until,
            reason=reason,
            granted_by=request.user,
        )
        _audit(
            request,
            "desk.grant_created",
            "desk_grant",
            grant.id,
            "Manual desk grant.",
            {"user_id": user.id, "desk": desk, "level": level, "club_id": club_id, "valid_until": grant.valid_until.isoformat() if grant.valid_until else None},
        )
        return response.Response({"id": grant.id}, status=status.HTTP_201_CREATED)


class OpsDeskGrantEndView(views.APIView):
    permission_classes = [IsSuperuser]

    def post(self, request, grant_id: int):
        grant = DeskGrant.objects.filter(pk=grant_id).first()
        if grant is None:
            return response.Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        grant.valid_until = timezone.localdate()
        grant.save(update_fields=["valid_until"])
        _audit(request, "desk.grant_ended", "desk_grant", grant.id, "Desk grant ended.", {"user_id": grant.user_id, "desk": grant.desk})
        return response.Response({"id": grant.id})


class OpsContactLinkView(views.APIView):
    permission_classes = [IsSuperuser]

    def get(self, request):
        people = (
            Person.objects.filter(committee_mandates__committee__scope="federation")
            .distinct()
            .order_by("last_name", "first_name")
        )
        return response.Response(
            {
                "results": [
                    {
                        "id": person.id,
                        "name": f"{person.last_name} {person.first_name}".strip(),
                        "user_id": person.user_id,
                    }
                    for person in people
                ]
            }
        )

    def post(self, request):
        person = Person.objects.filter(pk=request.data.get("person_id")).first()
        user = User.objects.filter(pk=request.data.get("user_id")).first()
        if person is None or user is None:
            return response.Response({"detail": "Choose a contact and a login."}, status=status.HTTP_400_BAD_REQUEST)
        if Person.objects.filter(user=user).exclude(pk=person.pk).exists():
            return response.Response({"detail": "That login is already linked to a contact."}, status=status.HTTP_400_BAD_REQUEST)
        previous = person.user_id
        person.user = user
        person.save(update_fields=["user"])
        sync_person(person.id, actor=request.user)
        _audit(
            request,
            "desk.contact_linked",
            "person",
            person.id,
            "Committee contact linked to a login.",
            {"person_id": person.id, "before_user_id": previous, "user_id": user.id},
        )
        return response.Response({"person_id": person.id, "user_id": user.id})


class OpsDutyExceptionView(views.APIView):
    permission_classes = [IsSuperuser]

    def post(self, request):
        user = User.objects.filter(pk=request.data.get("user_id")).first()
        rule = str(request.data.get("rule") or "")
        reason = str(request.data.get("reason") or "").strip()
        if user is None or rule not in {OWN_CLUB, OWN_INVOICE} or not reason:
            return response.Response({"detail": "A person, a rule, and a reason are required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            raw_from = str(request.data.get("valid_from") or "")[:10]
            raw_until = str(request.data.get("valid_until") or "")[:10]
            valid_from = date.fromisoformat(raw_from) if raw_from else timezone.localdate()
            valid_until = date.fromisoformat(raw_until) if raw_until else None
        except ValueError:
            return response.Response({"detail": "Enter the dates."}, status=status.HTTP_400_BAD_REQUEST)
        club_id = request.data.get("club_id") or None
        invoice_id = request.data.get("invoice_id") or None
        if rule == OWN_CLUB:
            if not club_id or not exception_span_ok(valid_from, valid_until):
                return response.Response(
                    {"detail": f"An own-club exception needs a club and an end within {MAX_EXCEPTION_DAYS} days."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            invoice_id = None
        else:
            if not invoice_id:
                return response.Response({"detail": "An invoice exception needs an invoice."}, status=status.HTTP_400_BAD_REQUEST)
            if valid_until is None:
                valid_until = valid_from + timedelta(days=MAX_EXCEPTION_DAYS)
            club_id = None
        from licenses.models import DutyException

        row = DutyException.objects.create(
            user=user,
            rule=rule,
            club_id=club_id,
            invoice_id=invoice_id,
            reason=reason,
            granted_by=request.user,
            valid_from=valid_from,
            valid_until=valid_until,
        )
        _audit(
            request,
            "desk.exception",
            "duty_exception",
            row.id,
            "Separation exception recorded.",
            {
                "user_id": user.id,
                "rule": rule,
                "club_id": club_id,
                "invoice_id": invoice_id,
                "valid_from": valid_from.isoformat(),
                "valid_until": valid_until.isoformat() if valid_until else None,
                "reason": reason,
            },
        )
        return response.Response({"id": row.id}, status=status.HTTP_201_CREATED)
