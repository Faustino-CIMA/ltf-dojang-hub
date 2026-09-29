from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from clubs.models import Club
from licenses.models import Invoice, Order, OrderItem
from members.models import Member
from members.transfers import list_member_club_transfers
from modules.registry import CLUB_MANAGEMENT_MODULE_ID

from .access import (
    can_manage_club_records,
    can_record_club_payments,
    club_mgmt_entitled,
    current_bank_access_mandate,
    is_ltf_manager,
)
from .addresses import lookup_luxembourg
from .member_match import adopt_member, link_contact_to_named_member, member_match_payload, members_with_name
from .models import (
    Committee,
    CommitteeMandate,
    Family,
    FamilyMember,
    FamilyRebateRule,
    MedicalCheckup,
    MemberAddress,
    MemberContact,
    MemberEmail,
    MemberPhone,
    MemberRecord,
    MembershipFee,
    MembershipFeePrice,
    Person,
    PersonAddress,
    PersonEmail,
    PersonPhone,
)
from .serializers import (
    CommitteeMandateSerializer,
    CommitteeSerializer,
    FamilyRebateRuleSerializer,
    FamilySerializer,
    MedicalCheckupSerializer,
    MemberAddressSerializer,
    MemberContactSerializer,
    MemberEmailSerializer,
    MemberPhoneSerializer,
    MemberRecordSerializer,
    MembershipFeeSerializer,
    PersonSerializer,
)


class ClubMgmtPermission(permissions.BasePermission):
    message = "This module is not available."

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if not club_mgmt_entitled():
            return False
        if is_ltf_manager(user):
            return True
        if user.role != "club_admin":
            return False
        club_id = _club_id(request)
        if club_id is None:
            return True
        return can_manage_club_records(user, club_id)


def _club_id(request):
    raw = request.query_params.get("club") or request.data.get("club") or request.data.get("club_id")
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _require_club(request):
    club_id = _club_id(request)
    if not can_manage_club_records(request.user, club_id):
        raise PermissionDenied(detail="This module is not available.")
    return club_id


class ClubFinanceAccessView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        club_id = _club_id(request)
        mandate = current_bank_access_mandate(request.user, club_id)
        return Response(
            {
                "can_record_payments": can_record_club_payments(request.user, club_id),
                "mandate_role": mandate.role if mandate else None,
            }
        )


class LuxembourgAddressView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not club_mgmt_entitled():
            raise PermissionDenied(detail="This module is not available.")
        postal_code = str(request.query_params.get("postal_code") or "")
        street = str(request.query_params.get("street") or "")
        return Response(lookup_luxembourg(postal_code, street))


class MemberRecordViewSet(viewsets.ModelViewSet):
    serializer_class = MemberRecordSerializer
    permission_classes = [ClubMgmtPermission]

    def get_queryset(self):
        qs = MemberRecord.objects.select_related("member")
        club_id = _club_id(self.request)
        if club_id:
            qs = qs.filter(member__club_id=club_id)
        elif self.request.user.role == "club_admin":
            qs = qs.filter(member__club__in=self.request.user.clubs_administered.all())
        return qs

    def perform_create(self, serializer):
        member = serializer.validated_data["member"]
        if not can_manage_club_records(self.request.user, member.club_id):
            raise PermissionDenied(detail="This module is not available.")
        serializer.save()

    @action(detail=False, methods=["get", "put"], url_path="for-member/(?P<member_id>[0-9]+)")
    def for_member(self, request, member_id=None):
        member = Member.objects.filter(pk=member_id).first()
        if member is None:
            return Response({"detail": "Member not found."}, status=404)
        if not can_manage_club_records(request.user, member.club_id):
            raise PermissionDenied(detail="This module is not available.")
        record, _created = MemberRecord.objects.get_or_create(member=member)
        if record.joined_at is None:
            joined = _joined_from_transfer(request.user, member)
            if joined:
                record.joined_at = joined
                record.save(update_fields=["joined_at"])
        if request.method == "GET":
            return Response(MemberRecordSerializer(record).data)
        serializer = MemberRecordSerializer(record, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _sync_member_contacts_lists(member, request.data)
        record.refresh_from_db()
        return Response(MemberRecordSerializer(record).data)


def _joined_from_transfer(user, member):
    try:
        history = list_member_club_transfers(user=user, member_id=member.id)
    except Exception:
        return None
    rows = history if isinstance(history, list) else history.get("results") or history.get("transfers") or []
    for row in rows:
        if str(row.get("to_club") or row.get("to_club_id") or "") == str(member.club_id):
            raw = row.get("accepted_at") or row.get("completed_at") or row.get("created_at")
            if raw:
                return str(raw)[:10]
    return None


def _sync_member_contacts_lists(member, data):
    if "emails" in data:
        MemberEmail.objects.filter(member=member).delete()
        for row in data.get("emails") or []:
            if row.get("email"):
                MemberEmail.objects.create(
                    member=member,
                    email=row["email"],
                    use_for_invoice=bool(row.get("use_for_invoice")),
                )
    if "phones" in data:
        MemberPhone.objects.filter(member=member).delete()
        for row in data.get("phones") or []:
            if row.get("number"):
                MemberPhone.objects.create(
                    member=member,
                    number=row["number"],
                    label=row.get("label") or "",
                )
    if "addresses" in data:
        MemberAddress.objects.filter(member=member).delete()
        for row in data.get("addresses") or []:
            MemberAddress.objects.create(
                member=member,
                street=row.get("street") or "",
                house_number=row.get("house_number") or "",
                line2=row.get("line2") or "",
                postal_code=row.get("postal_code") or "",
                locality=row.get("locality") or "",
                country=row.get("country") or "Luxembourg",
                use_for_invoice=bool(row.get("use_for_invoice")),
            )


class PersonViewSet(viewsets.ModelViewSet):
    serializer_class = PersonSerializer
    permission_classes = [ClubMgmtPermission]

    def get_queryset(self):
        qs = Person.objects.all()
        club_id = _club_id(self.request)
        if club_id:
            qs = qs.filter(club_id=club_id)
        return qs

    def perform_create(self, serializer):
        club_id = _require_club(self.request)
        person = serializer.save(club_id=club_id)
        _sync_person_lists(person, self.request.data)

    def perform_update(self, serializer):
        person = serializer.save()
        _sync_person_lists(person, self.request.data)

    @action(detail=False, methods=["get"], url_path="matches")
    def matches(self, request):
        club_id = _require_club(request)
        exclude = request.query_params.get("exclude_member")
        exclude_ids = [int(exclude)] if str(exclude or "").isdigit() else []
        found = members_with_name(
            club_id,
            request.query_params.get("first_name") or "",
            request.query_params.get("last_name") or "",
            exclude_ids=exclude_ids,
        )
        return Response({"matches": [member_match_payload(member) for member in found]})

    @action(detail=True, methods=["post"], url_path="convert-to-member")
    def convert_to_member(self, request, pk=None):
        from django.db import transaction
        from members.services import ensure_ltf_license_id

        person = self.get_object()
        if not can_manage_club_records(request.user, person.club_id):
            raise PermissionDenied(detail="This module is not available.")
        if not person.club_id:
            raise ValidationError({"club": "This person is not linked to a club."})
        with transaction.atomic():
            person = Person.objects.select_for_update().get(pk=person.pk)
            if person.converted_member_id:
                member = person.converted_member
                ensure_ltf_license_id(member)
                return Response({"member_id": member.id, "ltf_licenseid": member.ltf_licenseid})
            owner_ids = list(MemberContact.objects.filter(person=person).values_list("member_id", flat=True))
            matches = members_with_name(person.club_id, person.first_name, person.last_name, exclude_ids=owner_ids)
            if len(matches) == 1:
                chosen = adopt_member(person, matches[0])
                if chosen.id != person.id:
                    MemberContact.objects.filter(person=person).update(person=chosen)
                    person.delete()
                ensure_ltf_license_id(matches[0])
                return Response({"member_id": matches[0].id, "ltf_licenseid": matches[0].ltf_licenseid})
            member = self._create_member_from_person(person)
        return Response({"member_id": member.id, "record_id": member.club_record.id, "ltf_licenseid": member.ltf_licenseid}, status=201)

    def _create_member_from_person(self, person):
        from members.services import ensure_ltf_license_id

        member = Member.objects.create(
            club_id=person.club_id,
            first_name=person.first_name,
            last_name=person.last_name,
            sex=person.sex,
            email=person.emails.filter(use_for_invoice=True).values_list("email", flat=True).first()
            or person.emails.values_list("email", flat=True).first()
            or "",
        )
        MemberRecord.objects.create(member=member, joined_at=date.today())
        for row in person.emails.all():
            MemberEmail.objects.create(member=member, email=row.email, use_for_invoice=row.use_for_invoice)
        for row in person.phones.all():
            MemberPhone.objects.create(member=member, number=row.number, label=row.label)
        for row in person.addresses.all():
            MemberAddress.objects.create(
                member=member,
                street=row.street,
                house_number=row.house_number,
                line2=row.line2,
                postal_code=row.postal_code,
                locality=row.locality,
                country=row.country,
                use_for_invoice=row.use_for_invoice,
            )
        person.converted_member = member
        person.save(update_fields=["converted_member"])
        ensure_ltf_license_id(member)
        return member


def _sync_person_lists(person, data):
    if "emails" in data:
        PersonEmail.objects.filter(person=person).delete()
        for row in data.get("emails") or []:
            if row.get("email"):
                PersonEmail.objects.create(
                    person=person, email=row["email"], use_for_invoice=bool(row.get("use_for_invoice"))
                )
    if "phones" in data:
        PersonPhone.objects.filter(person=person).delete()
        for row in data.get("phones") or []:
            if row.get("number"):
                PersonPhone.objects.create(person=person, number=row["number"], label=row.get("label") or "")
    if "addresses" in data:
        PersonAddress.objects.filter(person=person).delete()
        for row in data.get("addresses") or []:
            PersonAddress.objects.create(
                person=person,
                street=row.get("street") or "",
                house_number=row.get("house_number") or "",
                line2=row.get("line2") or "",
                postal_code=row.get("postal_code") or "",
                locality=row.get("locality") or "",
                country=row.get("country") or "Luxembourg",
                use_for_invoice=bool(row.get("use_for_invoice")),
            )


class MemberContactViewSet(viewsets.ModelViewSet):
    serializer_class = MemberContactSerializer
    permission_classes = [ClubMgmtPermission]

    def get_queryset(self):
        qs = MemberContact.objects.select_related("person", "member")
        member_id = self.request.query_params.get("member")
        if member_id:
            qs = qs.filter(member_id=member_id)
        return qs

    def list(self, request, *args, **kwargs):
        contacts = list(self.filter_queryset(self.get_queryset()))
        for contact in contacts:
            link_contact_to_named_member(contact)
        contacts = list(self.filter_queryset(self.get_queryset()))
        return Response(self.get_serializer(contacts, many=True).data)

    @action(detail=False, methods=["post"], url_path="link")
    def link(self, request):
        member = Member.objects.filter(pk=request.data.get("member")).first()
        if member is None or not can_manage_club_records(request.user, member.club_id):
            raise PermissionDenied(detail="This module is not available.")
        first_name = request.data.get("first_name") or ""
        last_name = request.data.get("last_name") or ""
        relation = request.data.get("relation") or MemberContact.Relation.OTHER
        if relation not in MemberContact.Relation.values:
            raise ValidationError({"relation": "Choose a relation."})
        different = bool(request.data.get("different_person"))
        chosen_id = request.data.get("member_id")
        matches = [] if different else members_with_name(member.club_id, first_name, last_name, exclude_ids=[member.id])
        if chosen_id and not different:
            matches = [item for item in matches if item.id == int(chosen_id)]
            if not matches:
                raise ValidationError({"member_id": "Choose one of the matching members."})
        if not different and len(matches) > 1 and not chosen_id:
            return Response({"matches": [member_match_payload(item) for item in matches]}, status=409)
        linked_member = matches[0] if len(matches) == 1 else None
        if linked_member:
            person = Person.objects.filter(converted_member=linked_member).first()
            if person is None:
                person = Person.objects.create(
                    club=member.club,
                    first_name=first_name,
                    last_name=last_name,
                    sex=linked_member.sex,
                )
                person.converted_member = linked_member
                person.save(update_fields=["converted_member"])
        else:
            person = Person.objects.create(club=member.club, first_name=first_name, last_name=last_name, sex="M")
        contact = MemberContact.objects.filter(member=member, person=person).first()
        if contact is None:
            contact = MemberContact.objects.create(
                member=member,
                person=person,
                relation=relation,
                is_emergency=bool(request.data.get("is_emergency")),
            )
        payload = MemberContactSerializer(contact).data
        payload["already_member"] = linked_member is not None
        payload["linked_member_id"] = linked_member.id if linked_member else None
        payload["linked_member_name"] = f"{linked_member.first_name} {linked_member.last_name}".strip() if linked_member else ""
        return Response(payload, status=201)


class MedicalCheckupViewSet(viewsets.ModelViewSet):
    serializer_class = MedicalCheckupSerializer
    permission_classes = [ClubMgmtPermission]

    def get_queryset(self):
        qs = MedicalCheckup.objects.all()
        member_id = self.request.query_params.get("member")
        if member_id:
            qs = qs.filter(member_id=member_id)
        return qs


def _family_already_invoiced(family, year: int) -> bool:
    member_ids = list(family.memberships.values_list("member_id", flat=True))
    if family.invoice_member_id:
        member_ids.append(family.invoice_member_id)
    if not member_ids:
        return False
    return (
        OrderItem.objects.filter(
            order__club_id=family.club_id,
            fee_type__isnull=True,
            license__isnull=True,
            order__invoice__status__in=[Invoice.Status.ISSUED, Invoice.Status.PAID],
            order__member_id__in=member_ids,
        )
        .filter(
            Q(billing_year=year)
            | Q(billing_year__isnull=True, description__startswith=f"Membership {year}")
        )
        .exists()
    )


class FamilyViewSet(viewsets.ModelViewSet):
    serializer_class = FamilySerializer
    permission_classes = [ClubMgmtPermission]

    def get_queryset(self):
        qs = Family.objects.prefetch_related("memberships__member")
        club_id = _club_id(self.request)
        if club_id:
            qs = qs.filter(club_id=club_id)
        return qs

    def perform_create(self, serializer):
        club_id = _require_club(self.request)
        serializer.save(club_id=club_id)

    @action(detail=True, methods=["post"], url_path="add-member")
    def add_member(self, request, pk=None):
        family = self.get_object()
        if not can_manage_club_records(request.user, family.club_id):
            raise PermissionDenied(detail="This module is not available.")
        member_id = request.data.get("member")
        member = Member.objects.filter(pk=member_id, club_id=family.club_id).first()
        if member is None:
            raise ValidationError({"member": "Member not found in this club."})
        count = family.memberships.count()
        FamilyMember.objects.get_or_create(
            family=family, member=member, defaults={"sort_order": count + 1}
        )
        return Response(FamilySerializer(family).data)

    @action(detail=True, methods=["post"], url_path="remove-member")
    def remove_member(self, request, pk=None):
        family = self.get_object()
        if not can_manage_club_records(request.user, family.club_id):
            raise PermissionDenied(detail="This module is not available.")
        FamilyMember.objects.filter(family=family, member_id=request.data.get("member")).delete()
        remaining = list(family.memberships.order_by("sort_order", "id"))
        for index, link in enumerate(remaining, start=1):
            if link.sort_order != index:
                link.sort_order = index
                link.save(update_fields=["sort_order"])
        family = self.get_object()
        return Response(FamilySerializer(family).data)

    @action(detail=True, methods=["get"], url_path="invoice-preview")
    def invoice_preview(self, request, pk=None):
        family = self.get_object()
        if not can_manage_club_records(request.user, family.club_id):
            raise PermissionDenied(detail="This module is not available.")
        try:
            year = int(request.query_params.get("year") or timezone.now().year)
        except (TypeError, ValueError):
            year = timezone.now().year
        from .billing import household_plan

        fee, unit, payer, lines, total = household_plan(club=family.club, year=year, family=family)
        return Response(
            {
                "year": year,
                "fee_id": fee.id,
                "fee_name": fee.name,
                "unit_amount": str(unit),
                "payer_id": payer.id,
                "payer_name": f"{payer.first_name} {payer.last_name}",
                "lines": lines,
                "total": str(total),
                "already_invoiced": _family_already_invoiced(family, year),
            }
        )

    @action(detail=True, methods=["post"], url_path="create-invoice")
    def create_invoice(self, request, pk=None):
        family = self.get_object()
        if not can_manage_club_records(request.user, family.club_id):
            raise PermissionDenied(detail="This module is not available.")
        year = int(request.data.get("year") or timezone.now().year)
        from .billing import create_membership_invoice, existing_membership_invoice, household_plan

        _fee, _unit, payer, lines, total = household_plan(club=family.club, year=year, family=family)
        member_ids = list(family.memberships.values_list("member_id", flat=True))
        if family.invoice_member_id:
            member_ids.append(family.invoice_member_id)
        if existing_membership_invoice(family.club_id, year, member_ids):
            raise ValidationError(
                {"year": "This family already has a membership invoice for that year."}
            )
        invoice = create_membership_invoice(
            club=family.club, year=year, payer=payer, lines=lines, total=total, actor=request.user
        )
        return Response(
            {
                "order_id": invoice.order_id,
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "total": str(total),
            },
            status=201,
        )


class FamilyRebateRuleViewSet(viewsets.ModelViewSet):
    serializer_class = FamilyRebateRuleSerializer
    permission_classes = [ClubMgmtPermission]

    def get_queryset(self):
        qs = FamilyRebateRule.objects.all()
        club_id = _club_id(self.request)
        if club_id:
            qs = qs.filter(club_id=club_id)
        return qs


class MembershipFeeViewSet(viewsets.ModelViewSet):
    serializer_class = MembershipFeeSerializer
    permission_classes = [ClubMgmtPermission]

    def get_queryset(self):
        qs = MembershipFee.objects.prefetch_related("prices")
        club_id = _club_id(self.request)
        if club_id:
            qs = qs.filter(club_id=club_id)
        return qs

    def perform_create(self, serializer):
        fee = serializer.save()
        MembershipFeePrice.objects.create(
            fee=fee,
            amount=fee.amount,
            effective_from=date(timezone.now().year, 1, 1),
        )

    @action(detail=True, methods=["post"], url_path="add-price")
    def add_price(self, request, pk=None):
        fee = self.get_object()
        if not can_manage_club_records(request.user, fee.club_id):
            raise PermissionDenied(detail="This module is not available.")
        amount = request.data.get("amount")
        effective_from = request.data.get("effective_from") or timezone.localdate().isoformat()
        if amount in (None, ""):
            raise ValidationError({"amount": "Amount is required."})
        MembershipFeePrice.objects.create(
            fee=fee,
            amount=amount,
            effective_from=effective_from,
        )
        fee.amount = amount
        fee.save(update_fields=["amount"])
        fee = self.get_queryset().get(pk=fee.pk)
        return Response(MembershipFeeSerializer(fee).data)

    def _guard_fee(self, fee):
        if not can_manage_club_records(self.request.user, fee.club_id):
            raise PermissionDenied(detail="This module is not available.")

    def perform_update(self, serializer):
        self._guard_fee(serializer.instance)
        previous = serializer.instance.amount
        fee = serializer.save()
        if fee.amount == previous:
            return
        latest = fee.prices.order_by("-effective_from", "-id").first()
        if latest is None:
            MembershipFeePrice.objects.create(
                fee=fee,
                amount=fee.amount,
                effective_from=date(timezone.now().year, 1, 1),
            )
            return
        latest.amount = fee.amount
        latest.save(update_fields=["amount"])

    def perform_destroy(self, instance):
        self._guard_fee(instance)
        instance.delete()


class CommitteeViewSet(viewsets.ModelViewSet):
    serializer_class = CommitteeSerializer
    permission_classes = [ClubMgmtPermission]

    def get_queryset(self):
        qs = Committee.objects.prefetch_related("mandates__member", "mandates__person")
        scope = self.request.query_params.get("scope")
        club_id = _club_id(self.request)
        if scope:
            qs = qs.filter(scope=scope)
        if club_id:
            qs = qs.filter(club_id=club_id)
        elif scope == Committee.Scope.FEDERATION:
            qs = qs.filter(scope=Committee.Scope.FEDERATION)
        return qs

    def perform_create(self, serializer):
        scope = serializer.validated_data.get("scope")
        club_id = serializer.validated_data.get("club").id if serializer.validated_data.get("club") else None
        if scope == Committee.Scope.FEDERATION:
            if not is_ltf_manager(self.request.user):
                raise PermissionDenied(detail="This module is not available.")
            serializer.save(club=None)
            return
        _require_club(self.request)
        serializer.save(club_id=club_id or _club_id(self.request))


class CommitteeMandateViewSet(viewsets.ModelViewSet):
    serializer_class = CommitteeMandateSerializer
    permission_classes = [ClubMgmtPermission]

    def get_queryset(self):
        qs = CommitteeMandate.objects.select_related("member", "person", "committee")
        committee_id = self.request.query_params.get("committee")
        if committee_id:
            qs = qs.filter(committee_id=committee_id)
        return qs
