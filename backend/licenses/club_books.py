from datetime import datetime
from decimal import Decimal

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.status import HTTP_400_BAD_REQUEST, HTTP_403_FORBIDDEN
from rest_framework.views import APIView

from accounts.permissions import IsClubAdmin
from clubmgmt.access import can_mutate_club_books, can_view_club_books
from config.pagination import OptionalPaginationListMixin
from clubs.models import Club

from .finance_reports import build_club_finance_report, render_finance_report_xlsx
from .models import (
    ClubFinanceYearOpening,
    Expense,
    ExpenseCategory,
    FinanceAuditLog,
    Income,
    IncomeCategory,
    Invoice,
    Order,
    Payment,
)
from .pdf_utils import render_statement_pdf
from .serializers import (
    ClubFinanceYearOpeningSerializer,
    ExpenseCategorySerializer,
    ExpenseSerializer,
    IncomeCategorySerializer,
    IncomeSerializer,
)


def _club_id(request) -> int | None:
    raw = request.query_params.get("club") or request.query_params.get("club_id") or request.data.get("club")
    try:
        return int(raw) if raw not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _require_view(request, club_id: int | None):
    if not can_view_club_books(request.user, club_id):
        raise PermissionDenied(detail="This module is not available.")
    return club_id


def _require_mutate(request, club_id: int | None):
    _require_view(request, club_id)
    if not can_mutate_club_books(request.user, club_id):
        raise PermissionDenied(detail="Only committee officers with bank access can change club books.")


def ensure_club_expense_categories(club: Club) -> None:
    if ExpenseCategory.objects.filter(club=club).exists():
        return
    templates = ExpenseCategory.objects.filter(club__isnull=True, is_active=True)
    ExpenseCategory.objects.bulk_create(
        [
            ExpenseCategory(
                name=row.name,
                code=row.code,
                club=club,
                sort_order=row.sort_order,
                is_active=True,
            )
            for row in templates
        ]
    )


def ensure_club_income_categories(club: Club) -> None:
    if IncomeCategory.objects.filter(club=club).exists():
        return
    templates = IncomeCategory.objects.filter(club__isnull=True, is_active=True)
    IncomeCategory.objects.bulk_create(
        [
            IncomeCategory(
                name=row.name,
                code=row.code,
                club=club,
                sort_order=row.sort_order,
                is_active=True,
            )
            for row in templates
        ]
    )


class ClubBooksPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "club_admin")


class ClubExpenseCategoryViewSet(OptionalPaginationListMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsClubAdmin]
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ExpenseCategory.objects.none()
        club_id = _club_id(self.request)
        _require_view(self.request, club_id)
        club = Club.objects.filter(id=club_id).first()
        if club is None:
            return ExpenseCategory.objects.none()
        ensure_club_expense_categories(club)
        queryset = ExpenseCategory.objects.filter(club_id=club_id)
        if self.request.query_params.get("active") == "1":
            queryset = queryset.filter(is_active=True)
        return queryset


class ClubIncomeCategoryViewSet(OptionalPaginationListMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = IncomeCategorySerializer
    permission_classes = [IsClubAdmin]
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return IncomeCategory.objects.none()
        club_id = _club_id(self.request)
        _require_view(self.request, club_id)
        club = Club.objects.filter(id=club_id).first()
        if club is None:
            return IncomeCategory.objects.none()
        ensure_club_income_categories(club)
        queryset = IncomeCategory.objects.filter(club_id=club_id)
        if self.request.query_params.get("active") == "1":
            queryset = queryset.filter(is_active=True)
        return queryset


class ClubExpenseViewSet(OptionalPaginationListMixin, viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsClubAdmin]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Expense.objects.none()
        user = self.request.user
        queryset = (
            Expense.objects.select_related("category", "club", "created_by")
            .filter(ledger=Order.Ledger.CLUB, club__admins=user)
        )
        club_id = self.request.query_params.get("club_id") or self.request.query_params.get("club")
        if club_id:
            try:
                club_id_int = int(club_id)
            except (TypeError, ValueError):
                return Expense.objects.none()
            if not can_view_club_books(user, club_id_int):
                return Expense.objects.none()
            queryset = queryset.filter(club_id=club_id_int)
        elif getattr(self, "action", None) in {None, "list"}:
            return Expense.objects.none()
        status_param = self.request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(
                status__in=[value.strip() for value in status_param.split(",") if value.strip()]
            )
        year_param = self.request.query_params.get("year")
        if year_param:
            try:
                queryset = queryset.filter(expense_date__year=int(year_param))
            except (TypeError, ValueError):
                queryset = queryset.none()
        search_value = self.request.query_params.get("q", "").strip()
        if search_value:
            from django.db.models import Q

            queryset = queryset.filter(
                Q(expense_number__icontains=search_value)
                | Q(description__icontains=search_value)
                | Q(payee__icontains=search_value)
                | Q(reference__icontains=search_value)
                | Q(category__name__icontains=search_value)
            )
        return queryset.order_by("-expense_date", "-id")

    def retrieve(self, request, *args, **kwargs):
        expense = self.get_object()
        _require_view(request, expense.club_id)
        return Response(self.get_serializer(expense).data)

    def perform_create(self, serializer):
        club_id = serializer.validated_data.get("club").id if serializer.validated_data.get("club") else _club_id(self.request)
        _require_mutate(self.request, club_id)
        category = serializer.validated_data.get("category")
        if category and category.club_id != club_id:
            raise ValidationError({"category": "Choose a category for this club."})
        expense = serializer.save(
            created_by=self.request.user,
            club_id=club_id,
            ledger=Order.Ledger.CLUB,
        )
        FinanceAuditLog.objects.create(
            action="expense.created",
            message=f"Expense {expense.expense_number} recorded.",
            actor=self.request.user,
            club=expense.club,
            metadata={
                "expense_id": expense.id,
                "ledger": Order.Ledger.CLUB,
                "amount": str(expense.amount),
            },
        )

    def perform_update(self, serializer):
        expense = self.get_object()
        _require_mutate(self.request, expense.club_id)
        serializer.save()

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        expense = self.get_object()
        _require_mutate(request, expense.club_id)
        if expense.status == Expense.Status.VOID:
            return Response({"detail": "Void expenses cannot be marked paid."}, status=HTTP_400_BAD_REQUEST)
        if expense.status == Expense.Status.PAID:
            return Response(self.get_serializer(expense).data)
        paid_at = request.data.get("paid_at")
        payment_method = request.data.get("payment_method") or expense.payment_method
        reference = request.data.get("reference")
        expense.status = Expense.Status.PAID
        if paid_at:
            parsed = str(paid_at).replace("Z", "+00:00")
            try:
                resolved_paid_at = datetime.fromisoformat(parsed)
            except ValueError:
                resolved_paid_at = timezone.now()
            if timezone.is_naive(resolved_paid_at):
                resolved_paid_at = timezone.make_aware(resolved_paid_at)
            expense.paid_at = resolved_paid_at
        else:
            expense.paid_at = timezone.now()
        if payment_method:
            expense.payment_method = payment_method
        if reference:
            expense.reference = reference
        expense.save()
        return Response(self.get_serializer(expense).data)

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        expense = self.get_object()
        _require_mutate(request, expense.club_id)
        if expense.status != Expense.Status.VOID:
            expense.status = Expense.Status.VOID
            expense.paid_at = None
            expense.save()
        return Response(self.get_serializer(expense).data)


class ClubIncomeViewSet(OptionalPaginationListMixin, viewsets.ModelViewSet):
    serializer_class = IncomeSerializer
    permission_classes = [IsClubAdmin]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Income.objects.none()
        user = self.request.user
        queryset = (
            Income.objects.select_related("category", "club", "created_by")
            .filter(ledger=Order.Ledger.CLUB, club__admins=user)
        )
        club_id = self.request.query_params.get("club_id") or self.request.query_params.get("club")
        if club_id:
            try:
                club_id_int = int(club_id)
            except (TypeError, ValueError):
                return Income.objects.none()
            if not can_view_club_books(user, club_id_int):
                return Income.objects.none()
            queryset = queryset.filter(club_id=club_id_int)
        elif getattr(self, "action", None) in {None, "list"}:
            return Income.objects.none()
        status_param = self.request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(
                status__in=[value.strip() for value in status_param.split(",") if value.strip()]
            )
        year_param = self.request.query_params.get("year")
        if year_param:
            try:
                queryset = queryset.filter(income_date__year=int(year_param))
            except (TypeError, ValueError):
                queryset = queryset.none()
        search_value = self.request.query_params.get("q", "").strip()
        if search_value:
            from django.db.models import Q

            queryset = queryset.filter(
                Q(income_number__icontains=search_value)
                | Q(description__icontains=search_value)
                | Q(payer__icontains=search_value)
                | Q(reference__icontains=search_value)
                | Q(category__name__icontains=search_value)
            )
        return queryset.order_by("-income_date", "-id")

    def retrieve(self, request, *args, **kwargs):
        income = self.get_object()
        _require_view(request, income.club_id)
        return Response(self.get_serializer(income).data)

    def perform_create(self, serializer):
        club_id = serializer.validated_data.get("club").id if serializer.validated_data.get("club") else _club_id(self.request)
        _require_mutate(self.request, club_id)
        category = serializer.validated_data.get("category")
        if category and category.club_id != club_id:
            raise ValidationError({"category": "Choose a category for this club."})
        serializer.save(
            created_by=self.request.user,
            club_id=club_id,
            ledger=Order.Ledger.CLUB,
        )

    def perform_update(self, serializer):
        income = self.get_object()
        _require_mutate(self.request, income.club_id)
        serializer.save()

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        income = self.get_object()
        _require_mutate(request, income.club_id)
        if income.status != Income.Status.VOID:
            income.status = Income.Status.VOID
            income.received_at = None
            income.save()
        return Response(self.get_serializer(income).data)


class ClubFinanceYearOpeningView(APIView):
    permission_classes = [IsClubAdmin]

    def put(self, request):
        club_id = _club_id(request)
        _require_mutate(request, club_id)
        serializer = ClubFinanceYearOpeningSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        opening, _created = ClubFinanceYearOpening.objects.update_or_create(
            club_id=club_id,
            year=serializer.validated_data["year"],
            defaults={
                "opening_cash": serializer.validated_data["opening_cash"],
                "notes": serializer.validated_data.get("notes", ""),
                "updated_by": request.user,
            },
        )
        return Response(ClubFinanceYearOpeningSerializer(opening).data)


class ClubFinanceReportView(APIView):
    permission_classes = [IsClubAdmin]

    def get(self, request):
        club_id = _club_id(request)
        _require_view(request, club_id)
        year_param = request.query_params.get("year")
        try:
            year = int(year_param) if year_param else timezone.localdate().year
        except (TypeError, ValueError):
            return Response({"detail": "Enter a valid year."}, status=HTTP_400_BAD_REQUEST)
        if year < 2000 or year > 2100:
            return Response({"detail": "Enter a valid year."}, status=HTTP_400_BAD_REQUEST)
        return Response(build_club_finance_report(club_id, year))


class ClubFinanceReportExportView(APIView):
    permission_classes = [IsClubAdmin]

    def get(self, request):
        club_id = _club_id(request)
        _require_view(request, club_id)
        year_param = request.query_params.get("year")
        try:
            year = int(year_param) if year_param else timezone.localdate().year
        except (TypeError, ValueError):
            return Response({"detail": "Enter a valid year."}, status=HTTP_400_BAD_REQUEST)
        report = build_club_finance_report(club_id, year)
        payload = render_finance_report_xlsx(report)
        filename = f"club_financial_report_{year}.xlsx"
        response = HttpResponse(
            payload,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class ClubStatementView(APIView):
    permission_classes = [IsClubAdmin]

    def get(self, request):
        from clubmgmt.models import Family
        from members.models import Member

        club_id = _club_id(request)
        _require_view(request, club_id)
        year_param = request.query_params.get("year")
        try:
            year = int(year_param) if year_param else timezone.localdate().year
        except (TypeError, ValueError):
            return Response({"detail": "Enter a valid year."}, status=HTTP_400_BAD_REQUEST)
        member_id = request.query_params.get("member")
        family_id = request.query_params.get("family")
        member_ids: list[int] = []
        title = "Account statement"
        if family_id:
            family = Family.objects.filter(id=family_id, club_id=club_id).first()
            if family is None:
                return Response({"detail": "Family not found."}, status=status.HTTP_404_NOT_FOUND)
            member_ids = list(family.memberships.values_list("member_id", flat=True))
            if family.invoice_member_id and family.invoice_member_id not in member_ids:
                member_ids.append(family.invoice_member_id)
            title = f"{family.name} — {year}"
        elif member_id:
            member = Member.objects.filter(id=member_id, club_id=club_id).first()
            if member is None:
                return Response({"detail": "Member not found."}, status=status.HTTP_404_NOT_FOUND)
            member_ids = [member.id]
            title = f"{member.first_name} {member.last_name} — {year}"
        else:
            return Response({"detail": "Provide member or family."}, status=HTTP_400_BAD_REQUEST)

        invoices = (
            Invoice.objects.select_related("order", "member")
            .prefetch_related("credit_notes", "payments")
            .filter(
                club_id=club_id,
                order__ledger=Order.Ledger.CLUB,
                member_id__in=member_ids,
                created_at__year=year,
            )
            .exclude(status=Invoice.Status.VOID)
            .order_by("issued_at", "id")
        )
        rows = []
        outstanding_total = Decimal("0.00")
        for invoice in invoices:
            due = invoice.outstanding()
            outstanding_total += due
            rows.append(
                {
                    "invoice_number": invoice.invoice_number,
                    "issued_at": invoice.issued_at or invoice.created_at,
                    "status": invoice.status,
                    "total": invoice.total,
                    "credited": invoice.credited_total(),
                    "paid": invoice.paid_total(),
                    "outstanding": due,
                }
            )
        club = Club.objects.filter(id=club_id).first()
        pdf = render_statement_pdf(
            {
                "title": title,
                "club_name": club.name if club else "",
                "year": year,
                "rows": rows,
                "outstanding_total": outstanding_total,
                "generated_at": timezone.now(),
            },
            base_url=request.build_absolute_uri("/"),
        )
        if not pdf:
            return Response({"detail": "PDF generation is not available."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="statement_{year}.pdf"'
        return response
