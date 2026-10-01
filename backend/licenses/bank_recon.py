from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from xml.etree import ElementTree

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.status import HTTP_400_BAD_REQUEST, HTTP_403_FORBIDDEN
from rest_framework.views import APIView

from accounts.permissions import IsClubAdmin, IsLtfFinance
from clubmgmt.access import can_mutate_club_books, can_view_club_books
from config.pagination import OptionalPaginationListMixin
from clubs.models import Club

from .finance_reports import money_str
from .ledgers import federation_q
from .models import (
    BankStatement,
    BankStatementLine,
    Expense,
    ExpenseCategory,
    FinanceAuditLog,
    FinanceBudgetLine,
    Income,
    IncomeCategory,
    Invoice,
    Order,
    Payment,
)

MATCH_WINDOW = timedelta(days=3)
CASH_METHODS = {"cash"}


def _local_date(value) -> date:
    if isinstance(value, datetime):
        if timezone.is_aware(value):
            return timezone.localtime(value).date()
        return value.date()
    return value


def parse_money(raw: str) -> Decimal:
    text = (raw or "").strip()
    if not text:
        raise InvalidOperation("empty")
    negative = text.startswith("(") and text.endswith(")")
    text = text.replace(" ", "").replace("€", "").replace("EUR", "")
    text = text.strip("()+")
    if text.endswith("-"):
        negative = True
        text = text[:-1]
    if text.startswith("-"):
        negative = True
        text = text[1:]
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")
    amount = Decimal(text)
    return -amount if negative else amount


def parse_date(raw: str) -> date | None:
    text = (raw or "").strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d.%m.%y", "%d/%m/%y"):
        try:
            return datetime.strptime(text[:10], fmt).date()
        except ValueError:
            continue
    return None


def _norm_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").strip().lower()).strip()


DATE_HEADERS = {
    "date",
    "booking date",
    "booked",
    "value date",
    "wertstellung",
    "buchungsdatum",
    "datum",
    "operation date",
    "transaction date",
}
AMOUNT_HEADERS = {"amount", "betrag", "montant", "value", "amt"}
DEBIT_HEADERS = {"debit", "soll", "debit amount", "withdrawal"}
CREDIT_HEADERS = {"credit", "haben", "credit amount", "deposit"}
DESCRIPTION_HEADERS = {
    "description",
    "details",
    "buchungstext",
    "libelle",
    "libellé",
    "narrative",
    "communication",
    "text",
}
REFERENCE_HEADERS = {"reference", "referenz", "ref", "end to end", "mandate", "transaction id"}
COUNTERPARTY_HEADERS = {
    "counterparty",
    "name",
    "beneficiary",
    "payer",
    "payee",
    "beguenstigter",
    "begünstigter",
    "donneur",
}


def _pick_column(headers: list[str], names: set[str]) -> int | None:
    normalized = [_norm_header(header) for header in headers]
    for index, header in enumerate(normalized):
        if header in names:
            return index
    for index, header in enumerate(normalized):
        if any(name in header for name in names if len(name) > 3):
            return index
    return None


def parse_csv_statement(payload: bytes) -> list[dict]:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            text = payload.decode(encoding)
            break
        except UnicodeDecodeError:
            text = ""
    if not text.strip():
        raise ValidationError({"file": "The file is empty."})
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,|\t,")
    except csv.Error:
        class _CsvDialect(csv.excel):
            delimiter = ";" if sample.count(";") >= sample.count(",") else ","

        dialect = _CsvDialect()
    reader = csv.reader(io.StringIO(text), dialect)
    rows = [row for row in reader if any(cell.strip() for cell in row)]
    if len(rows) < 2:
        raise ValidationError({"file": "The CSV file has no data rows."})
    headers = rows[0]
    date_i = _pick_column(headers, DATE_HEADERS)
    amount_i = _pick_column(headers, AMOUNT_HEADERS)
    debit_i = _pick_column(headers, DEBIT_HEADERS)
    credit_i = _pick_column(headers, CREDIT_HEADERS)
    desc_i = _pick_column(headers, DESCRIPTION_HEADERS)
    ref_i = _pick_column(headers, REFERENCE_HEADERS)
    party_i = _pick_column(headers, COUNTERPARTY_HEADERS)
    if date_i is None or (amount_i is None and debit_i is None and credit_i is None):
        raise ValidationError({"file": "Could not find date and amount columns in the CSV file."})
    parsed = []
    for row in rows[1:]:
        booked = parse_date(row[date_i] if date_i < len(row) else "")
        if booked is None:
            continue
        amount = Decimal("0.00")
        if amount_i is not None and amount_i < len(row) and row[amount_i].strip():
            try:
                amount = parse_money(row[amount_i])
            except (InvalidOperation, ValueError):
                continue
        else:
            debit = Decimal("0.00")
            credit = Decimal("0.00")
            try:
                if debit_i is not None and debit_i < len(row) and row[debit_i].strip():
                    debit = abs(parse_money(row[debit_i]))
                if credit_i is not None and credit_i < len(row) and row[credit_i].strip():
                    credit = abs(parse_money(row[credit_i]))
            except (InvalidOperation, ValueError):
                continue
            amount = credit - debit
        if amount == 0:
            continue
        direction = BankStatementLine.Direction.CREDIT if amount > 0 else BankStatementLine.Direction.DEBIT
        parsed.append(
            {
                "booked_on": booked,
                "amount": abs(amount),
                "direction": direction,
                "description": (row[desc_i] if desc_i is not None and desc_i < len(row) else "").strip()[:255],
                "reference": (row[ref_i] if ref_i is not None and ref_i < len(row) else "").strip()[:255],
                "counterparty": (row[party_i] if party_i is not None and party_i < len(row) else "").strip()[:255],
            }
        )
    if not parsed:
        raise ValidationError({"file": "No usable rows were found in the CSV file."})
    return parsed


def _xml_tag(element) -> str:
    return element.tag.split("}")[-1] if "}" in element.tag else element.tag


def _xml_text(parent, *names: str) -> str:
    if parent is None:
        return ""
    wanted = set(names)
    for child in parent.iter():
        if _xml_tag(child) in wanted and (child.text or "").strip():
            return child.text.strip()
    return ""


def parse_camt053_statement(payload: bytes) -> list[dict]:
    try:
        root = ElementTree.fromstring(payload)
    except ElementTree.ParseError as error:
        raise ValidationError({"file": "The CAMT file is not valid XML."}) from error
    parsed = []
    for element in root.iter():
        if _xml_tag(element) != "Ntry":
            continue
        booked_raw = _xml_text(element, "Dt", "DtTm")
        booked = parse_date(booked_raw[:10]) if booked_raw else None
        amount_raw = _xml_text(element, "Amt")
        indicator = _xml_text(element, "CdtDbtInd").upper()
        try:
            amount = abs(parse_money(amount_raw))
        except (InvalidOperation, ValueError):
            continue
        if booked is None or amount <= 0:
            continue
        direction = (
            BankStatementLine.Direction.DEBIT
            if indicator.startswith("DBIT")
            else BankStatementLine.Direction.CREDIT
        )
        parsed.append(
            {
                "booked_on": booked,
                "amount": amount,
                "direction": direction,
                "description": _xml_text(element, "Ustrd", "AddtlNtryInf")[:255],
                "reference": _xml_text(element, "EndToEndId", "AcctSvcrRef", "TxId")[:255],
                "counterparty": _xml_text(element, "Nm")[:255],
            }
        )
    if not parsed:
        raise ValidationError({"file": "No entries were found in the CAMT.053 file."})
    return parsed


def detect_and_parse(filename: str, payload: bytes) -> tuple[str, list[dict]]:
    name = (filename or "").lower()
    head = payload.lstrip()[:80].lower()
    if name.endswith(".xml") or head.startswith(b"<?xml") or b"<document" in head or b"<bkto" in head:
        return BankStatement.SourceFormat.CAMT053, parse_camt053_statement(payload)
    return BankStatement.SourceFormat.CSV, parse_csv_statement(payload)


def _books_q(*, ledger: str, club_id: int | None):
    if ledger == Order.Ledger.CLUB:
        return Q(ledger=Order.Ledger.CLUB, club_id=club_id)
    return federation_q()


def unmatched_payments(*, ledger: str, club_id: int | None):
    queryset = Payment.objects.select_related("invoice", "order").filter(
        status=Payment.Status.PAID,
        bank_match__isnull=True,
    ).exclude(method__in=CASH_METHODS)
    if ledger == Order.Ledger.CLUB:
        queryset = queryset.filter(order__ledger=Order.Ledger.CLUB, order__club_id=club_id)
    else:
        queryset = queryset.filter(federation_q(through_order=True))
    return queryset


def unmatched_incomes(*, ledger: str, club_id: int | None):
    queryset = Income.objects.filter(
        status=Income.Status.RECEIVED,
        bank_match__isnull=True,
    ).exclude(payment_method__in=CASH_METHODS)
    if ledger == Order.Ledger.CLUB:
        queryset = queryset.filter(ledger=Order.Ledger.CLUB, club_id=club_id)
    else:
        queryset = queryset.filter(federation_q())
    return queryset


def unmatched_expenses(*, ledger: str, club_id: int | None):
    queryset = Expense.objects.filter(
        status=Expense.Status.PAID,
        bank_match__isnull=True,
    ).exclude(payment_method__in=CASH_METHODS)
    if ledger == Order.Ledger.CLUB:
        queryset = queryset.filter(ledger=Order.Ledger.CLUB, club_id=club_id)
    else:
        queryset = queryset.filter(federation_q())
    return queryset


def _score(line: BankStatementLine, booked_on: date | None, reference: str, extra: str) -> float:
    if booked_on is None:
        return 0.0
    delta = abs((booked_on - line.booked_on).days)
    if delta > MATCH_WINDOW.days:
        return 0.0
    score = 1.0 if delta == 0 else 0.75 if delta == 1 else 0.45
    haystack = f"{line.description} {line.reference} {line.counterparty}".lower()
    needles = [part.lower() for part in (reference, extra) if part]
    if any(part and part in haystack for part in needles):
        score += 0.2
    if line.reference and any(line.reference.lower() in part.lower() for part in needles if part):
        score += 0.15
    return min(score, 1.0)


def suggest_matches(line: BankStatementLine, limit: int = 8) -> list[dict]:
    statement = line.statement
    ledger = statement.ledger
    club_id = statement.club_id
    start = line.booked_on - MATCH_WINDOW
    end = line.booked_on + MATCH_WINDOW
    candidates: list[dict] = []
    if line.direction == BankStatementLine.Direction.CREDIT:
        for payment in unmatched_payments(ledger=ledger, club_id=club_id).filter(
            amount=line.amount,
            paid_at__date__gte=start,
            paid_at__date__lte=end,
        )[:50]:
            booked = _local_date(payment.paid_at) if payment.paid_at else None
            score = _score(line, booked, payment.reference, payment.invoice.invoice_number if payment.invoice_id else "")
            if score <= 0:
                continue
            candidates.append(
                {
                    "kind": BankStatementLine.MatchKind.PAYMENT,
                    "id": payment.id,
                    "label": payment.invoice.invoice_number if payment.invoice_id else f"Payment {payment.id}",
                    "amount": money_str(payment.amount),
                    "date": booked.isoformat() if booked else "",
                    "reference": payment.reference,
                    "score": round(score, 2),
                }
            )
        for income in unmatched_incomes(ledger=ledger, club_id=club_id).filter(
            amount=line.amount,
            income_date__gte=start,
            income_date__lte=end,
        )[:50]:
            score = _score(line, income.income_date, income.reference, income.income_number)
            if score <= 0:
                continue
            candidates.append(
                {
                    "kind": BankStatementLine.MatchKind.INCOME,
                    "id": income.id,
                    "label": income.income_number,
                    "amount": money_str(income.amount),
                    "date": income.income_date.isoformat(),
                    "reference": income.reference,
                    "score": round(score, 2),
                }
            )
    else:
        for expense in unmatched_expenses(ledger=ledger, club_id=club_id).filter(
            amount=line.amount,
            paid_at__date__gte=start,
            paid_at__date__lte=end,
        )[:50]:
            booked = _local_date(expense.paid_at) if expense.paid_at else None
            score = _score(line, booked, expense.reference, expense.expense_number)
            if score <= 0:
                continue
            candidates.append(
                {
                    "kind": BankStatementLine.MatchKind.EXPENSE,
                    "id": expense.id,
                    "label": expense.expense_number,
                    "amount": money_str(expense.amount),
                    "date": booked.isoformat() if booked else "",
                    "reference": expense.reference,
                    "score": round(score, 2),
                }
            )
    candidates.sort(key=lambda row: (-row["score"], row["date"]))
    return candidates[:limit]


def apply_match(line: BankStatementLine, *, kind: str, target_id: int, actor=None) -> BankStatementLine:
    if line.statement.status == BankStatement.Status.COMPLETED:
        raise ValidationError({"detail": "Completed statements cannot be changed."})
    statement = line.statement
    if kind == BankStatementLine.MatchKind.PAYMENT:
        target = unmatched_payments(ledger=statement.ledger, club_id=statement.club_id).filter(id=target_id).first()
        if target is None:
            raise ValidationError({"detail": "That payment is not available to match."})
        if target.amount != line.amount:
            raise ValidationError({"detail": "Amount does not match the statement line."})
        line.payment = target
        line.income = None
        line.expense = None
    elif kind == BankStatementLine.MatchKind.INCOME:
        target = unmatched_incomes(ledger=statement.ledger, club_id=statement.club_id).filter(id=target_id).first()
        if target is None:
            raise ValidationError({"detail": "That income is not available to match."})
        if target.amount != line.amount:
            raise ValidationError({"detail": "Amount does not match the statement line."})
        line.income = target
        line.payment = None
        line.expense = None
    elif kind == BankStatementLine.MatchKind.EXPENSE:
        target = unmatched_expenses(ledger=statement.ledger, club_id=statement.club_id).filter(id=target_id).first()
        if target is None:
            raise ValidationError({"detail": "That expense is not available to match."})
        if target.amount != line.amount:
            raise ValidationError({"detail": "Amount does not match the statement line."})
        line.expense = target
        line.payment = None
        line.income = None
    else:
        raise ValidationError({"kind": "Choose payment, income, or expense."})
    line.match_kind = kind
    line.status = BankStatementLine.Status.MATCHED
    line.matched_by = actor if actor and getattr(actor, "is_authenticated", False) else None
    line.matched_at = timezone.now()
    line.save()
    return line


def clear_match(line: BankStatementLine) -> BankStatementLine:
    if line.statement.status == BankStatement.Status.COMPLETED:
        raise ValidationError({"detail": "Completed statements cannot be changed."})
    line.payment = None
    line.income = None
    line.expense = None
    line.match_kind = ""
    line.status = BankStatementLine.Status.UNMATCHED
    line.matched_by = None
    line.matched_at = None
    line.save()
    return line


def ignore_line(line: BankStatementLine) -> BankStatementLine:
    if line.statement.status == BankStatement.Status.COMPLETED:
        raise ValidationError({"detail": "Completed statements cannot be changed."})
    line.payment = None
    line.income = None
    line.expense = None
    line.match_kind = ""
    line.status = BankStatementLine.Status.IGNORED
    line.matched_at = timezone.now()
    line.save()
    return line


def import_statement(
    *,
    payload: bytes,
    filename: str,
    ledger: str,
    club_id: int | None,
    actor=None,
    opening_balance: Decimal | None = None,
    closing_balance: Decimal | None = None,
    source_file=None,
) -> BankStatement:
    source_format, rows = detect_and_parse(filename, payload)
    dates = [row["booked_on"] for row in rows]
    statement = BankStatement(
        ledger=ledger,
        club_id=club_id,
        period_start=min(dates),
        period_end=max(dates),
        opening_balance=opening_balance or Decimal("0.00"),
        closing_balance=closing_balance or Decimal("0.00"),
        source_filename=filename[:255],
        source_format=source_format,
        created_by=actor if actor and getattr(actor, "is_authenticated", False) else None,
    )
    if source_file is not None:
        statement.source_file = source_file
    with transaction.atomic():
        statement.save()
        BankStatementLine.objects.bulk_create(
            [
                BankStatementLine(
                    statement=statement,
                    booked_on=row["booked_on"],
                    amount=row["amount"],
                    direction=row["direction"],
                    description=row["description"],
                    reference=row["reference"],
                    counterparty=row["counterparty"],
                )
                for row in rows
            ]
        )
    FinanceAuditLog.objects.create(
        action="bank_statement.imported",
        message=f"Bank statement {statement.statement_number} imported ({len(rows)} lines).",
        actor=statement.created_by,
        club=statement.club,
        metadata={
            "statement_id": statement.id,
            "ledger": ledger,
            "lines": len(rows),
            "source_format": source_format,
        },
    )
    return statement


def reload_statement(statement: BankStatement) -> BankStatement:
    return (
        BankStatement.objects.prefetch_related(
            "lines__payment__invoice",
            "lines__income",
            "lines__expense",
        ).get(pk=statement.pk)
    )


def statement_payload(statement: BankStatement, request=None) -> dict:
    from .serializers import BankStatementSerializer

    fresh = reload_statement(statement)
    data = BankStatementSerializer(fresh, context={"request": request}).data
    data["summary"] = statement_summary(fresh)
    return data


def statement_summary(statement: BankStatement) -> dict:
    counts = statement.lines.values("status").annotate(total=Count("id"))
    by_status = {row["status"]: row["total"] for row in counts}
    matched_in = statement.lines.filter(
        status=BankStatementLine.Status.MATCHED,
        direction=BankStatementLine.Direction.CREDIT,
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    matched_out = statement.lines.filter(
        status=BankStatementLine.Status.MATCHED,
        direction=BankStatementLine.Direction.DEBIT,
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
    return {
        "line_count": statement.lines.count(),
        "unmatched_count": by_status.get(BankStatementLine.Status.UNMATCHED, 0),
        "matched_count": by_status.get(BankStatementLine.Status.MATCHED, 0),
        "ignored_count": by_status.get(BankStatementLine.Status.IGNORED, 0),
        "matched_in": money_str(matched_in),
        "matched_out": money_str(matched_out),
    }


def build_budget(*, ledger: str, club_id: int | None, year: int) -> dict:
    from .finance_reports import _invoice_recognition_q, _sum, period_bounds, year_as_of

    start, as_of, start_dt, as_of_end_dt = period_bounds(year, year_as_of(year))
    if ledger == Order.Ledger.CLUB:
        income_cats = IncomeCategory.objects.filter(club_id=club_id, is_active=True)
        expense_cats = ExpenseCategory.objects.filter(club_id=club_id, is_active=True)
        license_actual = _sum(
            Invoice.objects.filter(
                order__ledger=Order.Ledger.CLUB,
                club_id=club_id,
                status__in=[Invoice.Status.ISSUED, Invoice.Status.PAID],
            ).filter(_invoice_recognition_q(start_dt, as_of_end_dt)),
            "total",
        )
        income_actuals = {
            row["category_id"]: row["total"]
            for row in Income.objects.filter(
                ledger=Order.Ledger.CLUB,
                club_id=club_id,
                status=Income.Status.RECEIVED,
                income_date__gte=start,
                income_date__lte=as_of,
            )
            .values("category_id")
            .annotate(total=Sum("amount"))
        }
        expense_actuals = {
            row["category_id"]: row["total"]
            for row in Expense.objects.filter(
                ledger=Order.Ledger.CLUB,
                club_id=club_id,
                status__in=[Expense.Status.RECORDED, Expense.Status.PAID],
                expense_date__gte=start,
                expense_date__lte=as_of,
            )
            .values("category_id")
            .annotate(total=Sum("amount"))
        }
        stored = FinanceBudgetLine.objects.filter(ledger=Order.Ledger.CLUB, club_id=club_id, year=year)
    else:
        income_cats = IncomeCategory.objects.filter(club__isnull=True, is_active=True)
        expense_cats = ExpenseCategory.objects.filter(club__isnull=True, is_active=True)
        license_actual = _sum(
            Invoice.objects.filter(
                federation_q(through_order=True),
                status__in=[Invoice.Status.ISSUED, Invoice.Status.PAID],
            ).filter(_invoice_recognition_q(start_dt, as_of_end_dt)),
            "total",
        )
        income_actuals = {
            row["category_id"]: row["total"]
            for row in Income.objects.filter(
                federation_q(),
                status=Income.Status.RECEIVED,
                income_date__gte=start,
                income_date__lte=as_of,
            )
            .values("category_id")
            .annotate(total=Sum("amount"))
        }
        expense_actuals = {
            row["category_id"]: row["total"]
            for row in Expense.objects.filter(
                federation_q(),
                status__in=[Expense.Status.RECORDED, Expense.Status.PAID],
                expense_date__gte=start,
                expense_date__lte=as_of,
            )
            .values("category_id")
            .annotate(total=Sum("amount"))
        }
        stored = FinanceBudgetLine.objects.filter(ledger=Order.Ledger.FEDERATION, club__isnull=True, year=year)

    stored_map = {(row.kind, row.income_category_id, row.expense_category_id): row.amount for row in stored}
    lines = []
    license_budget = stored_map.get((FinanceBudgetLine.Kind.LICENSE_FEES, None, None), Decimal("0.00"))
    lines.append(
        {
            "kind": FinanceBudgetLine.Kind.LICENSE_FEES,
            "category": None,
            "category_name": "Membership / license fees",
            "budget": money_str(license_budget),
            "actual": money_str(license_actual),
            "variance": money_str(license_actual - license_budget),
        }
    )
    for category in income_cats.order_by("sort_order", "name"):
        budget = stored_map.get((FinanceBudgetLine.Kind.INCOME, category.id, None), Decimal("0.00"))
        actual = income_actuals.get(category.id, Decimal("0.00"))
        lines.append(
            {
                "kind": FinanceBudgetLine.Kind.INCOME,
                "category": category.id,
                "category_name": category.name,
                "budget": money_str(budget),
                "actual": money_str(actual),
                "variance": money_str(actual - budget),
            }
        )
    for category in expense_cats.order_by("sort_order", "name"):
        budget = stored_map.get((FinanceBudgetLine.Kind.EXPENSE, None, category.id), Decimal("0.00"))
        actual = expense_actuals.get(category.id, Decimal("0.00"))
        lines.append(
            {
                "kind": FinanceBudgetLine.Kind.EXPENSE,
                "category": category.id,
                "category_name": category.name,
                "budget": money_str(budget),
                "actual": money_str(actual),
                "variance": money_str(actual - budget),
            }
        )
    budget_income = license_budget + sum(
        (stored_map.get((FinanceBudgetLine.Kind.INCOME, category.id, None), Decimal("0.00")) for category in income_cats),
        Decimal("0.00"),
    )
    budget_expense = sum(
        (stored_map.get((FinanceBudgetLine.Kind.EXPENSE, None, category.id), Decimal("0.00")) for category in expense_cats),
        Decimal("0.00"),
    )
    actual_income = license_actual + sum(income_actuals.values(), Decimal("0.00"))
    actual_expense = sum(expense_actuals.values(), Decimal("0.00"))
    return {
        "year": year,
        "ledger": ledger,
        "club": club_id,
        "currency": "EUR",
        "lines": lines,
        "totals": {
            "budget_income": money_str(budget_income),
            "actual_income": money_str(actual_income),
            "budget_expense": money_str(budget_expense),
            "actual_expense": money_str(actual_expense),
            "budget_surplus": money_str(budget_income - budget_expense),
            "actual_surplus": money_str(actual_income - actual_expense),
        },
    }


def save_budget(*, ledger: str, club_id: int | None, year: int, lines: list[dict], actor=None) -> dict:
    if year < 2000 or year > 2100:
        raise ValidationError({"year": "Enter a valid year."})
    with transaction.atomic():
        qs = FinanceBudgetLine.objects.filter(ledger=ledger, year=year)
        qs = qs.filter(club_id=club_id) if club_id else qs.filter(club__isnull=True)
        qs.delete()
        created = []
        for row in lines:
            kind = row.get("kind")
            raw_amount = str(row.get("amount") or "0")
            try:
                amount = parse_money(raw_amount)
            except (InvalidOperation, ValueError) as error:
                raise ValidationError({"amount": "Enter a valid amount."}) from error
            if amount < 0:
                raise ValidationError({"amount": "Budget amounts cannot be negative."})
            line = FinanceBudgetLine(
                ledger=ledger,
                club_id=club_id,
                year=year,
                kind=kind,
                amount=amount,
                updated_by=actor if actor and getattr(actor, "is_authenticated", False) else None,
            )
            if kind == FinanceBudgetLine.Kind.INCOME:
                line.income_category_id = row.get("category")
                if not line.income_category_id:
                    raise ValidationError({"category": "Choose an income category."})
            elif kind == FinanceBudgetLine.Kind.EXPENSE:
                line.expense_category_id = row.get("category")
                if not line.expense_category_id:
                    raise ValidationError({"category": "Choose an expense category."})
            elif kind != FinanceBudgetLine.Kind.LICENSE_FEES:
                raise ValidationError({"kind": "Unknown budget line."})
            created.append(line)
        FinanceBudgetLine.objects.bulk_create(created)
    return build_budget(ledger=ledger, club_id=club_id, year=year)


def _club_id(request) -> int | None:
    raw = request.query_params.get("club") or request.query_params.get("club_id") or request.data.get("club")
    try:
        return int(raw) if raw not in (None, "") else None
    except (TypeError, ValueError):
        return None


class ClubBankStatementViewSet(OptionalPaginationListMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsClubAdmin]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return BankStatement.objects.none()
        user = self.request.user
        queryset = BankStatement.objects.filter(ledger=Order.Ledger.CLUB, club__admins=user).prefetch_related(
            "lines__payment__invoice",
            "lines__income",
            "lines__expense",
        )
        club_id = _club_id(self.request)
        if club_id:
            if not can_view_club_books(user, club_id):
                return BankStatement.objects.none()
            queryset = queryset.filter(club_id=club_id)
        elif getattr(self, "action", None) in {None, "list"}:
            return BankStatement.objects.none()
        return queryset.order_by("-period_end", "-id")

    def get_serializer_class(self):
        from .serializers import BankStatementListSerializer, BankStatementSerializer

        if self.action == "list":
            return BankStatementListSerializer
        return BankStatementSerializer

    def retrieve(self, request, *args, **kwargs):
        statement = self.get_object()
        if not can_view_club_books(request.user, statement.club_id):
            raise PermissionDenied(detail="This module is not available.")
        return Response(statement_payload(statement, request))

    @action(detail=False, methods=["post"], url_path="import")
    def import_file(self, request):
        club_id = _club_id(request)
        if not can_mutate_club_books(request.user, club_id):
            return Response(
                {"detail": "Only committee officers with bank access can import statements."},
                status=HTTP_403_FORBIDDEN,
            )
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"file": "Choose a CSV or CAMT.053 file."}, status=HTTP_400_BAD_REQUEST)
        opening = request.data.get("opening_balance")
        closing = request.data.get("closing_balance")
        try:
            opening_balance = parse_money(str(opening)) if opening not in (None, "") else None
            closing_balance = parse_money(str(closing)) if closing not in (None, "") else None
        except (InvalidOperation, ValueError):
            return Response({"detail": "Enter valid opening and closing balances."}, status=HTTP_400_BAD_REQUEST)
        payload = upload.read()
        upload.seek(0)
        statement = import_statement(
            payload=payload,
            filename=upload.name,
            ledger=Order.Ledger.CLUB,
            club_id=club_id,
            actor=request.user,
            opening_balance=opening_balance,
            closing_balance=closing_balance,
            source_file=upload,
        )
        return Response(statement_payload(statement, request), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def match(self, request, pk=None):
        statement = self.get_object()
        if not can_mutate_club_books(request.user, statement.club_id):
            return Response({"detail": "Only committee officers with bank access can match lines."}, status=HTTP_403_FORBIDDEN)
        line = statement.lines.filter(id=request.data.get("line")).first()
        if line is None:
            return Response({"line": "Statement line not found."}, status=HTTP_400_BAD_REQUEST)
        try:
            target_id = int(request.data.get("id") or 0)
        except (TypeError, ValueError):
            return Response({"id": "Choose a book entry to match."}, status=HTTP_400_BAD_REQUEST)
        apply_match(
            line,
            kind=str(request.data.get("kind") or ""),
            target_id=target_id,
            actor=request.user,
        )
        return Response(statement_payload(statement, request))

    @action(detail=True, methods=["post"])
    def unmatch(self, request, pk=None):
        statement = self.get_object()
        if not can_mutate_club_books(request.user, statement.club_id):
            return Response({"detail": "Only committee officers with bank access can unmatch lines."}, status=HTTP_403_FORBIDDEN)
        line = statement.lines.filter(id=request.data.get("line")).first()
        if line is None:
            return Response({"line": "Statement line not found."}, status=HTTP_400_BAD_REQUEST)
        clear_match(line)
        return Response(statement_payload(statement, request))

    @action(detail=True, methods=["post"])
    def ignore(self, request, pk=None):
        statement = self.get_object()
        if not can_mutate_club_books(request.user, statement.club_id):
            return Response({"detail": "Only committee officers with bank access can ignore lines."}, status=HTTP_403_FORBIDDEN)
        line = statement.lines.filter(id=request.data.get("line")).first()
        if line is None:
            return Response({"line": "Statement line not found."}, status=HTTP_400_BAD_REQUEST)
        ignore_line(line)
        return Response(statement_payload(statement, request))

    @action(detail=True, methods=["get"])
    def suggestions(self, request, pk=None):
        statement = self.get_object()
        if not can_view_club_books(request.user, statement.club_id):
            raise PermissionDenied(detail="This module is not available.")
        line = statement.lines.filter(id=request.query_params.get("line")).first()
        if line is None:
            return Response({"line": "Statement line not found."}, status=HTTP_400_BAD_REQUEST)
        return Response({"line": line.id, "candidates": suggest_matches(line)})

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        statement = self.get_object()
        if not can_mutate_club_books(request.user, statement.club_id):
            return Response({"detail": "Only committee officers with bank access can complete statements."}, status=HTTP_403_FORBIDDEN)
        statement.status = BankStatement.Status.COMPLETED
        statement.completed_at = timezone.now()
        statement.save(update_fields=["status", "completed_at", "updated_at"])
        return Response(statement_payload(statement, request))


class FederationBankStatementViewSet(OptionalPaginationListMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsLtfFinance]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return BankStatement.objects.none()
        return (
            BankStatement.objects.filter(ledger=Order.Ledger.FEDERATION, club__isnull=True)
            .prefetch_related("lines__payment__invoice", "lines__income", "lines__expense")
            .order_by("-period_end", "-id")
        )

    def get_serializer_class(self):
        from .serializers import BankStatementListSerializer, BankStatementSerializer

        if self.action == "list":
            return BankStatementListSerializer
        return BankStatementSerializer

    def retrieve(self, request, *args, **kwargs):
        statement = self.get_object()
        return Response(statement_payload(statement, request))

    @action(detail=False, methods=["post"], url_path="import")
    def import_file(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"file": "Choose a CSV or CAMT.053 file."}, status=HTTP_400_BAD_REQUEST)
        opening = request.data.get("opening_balance")
        closing = request.data.get("closing_balance")
        try:
            opening_balance = parse_money(str(opening)) if opening not in (None, "") else None
            closing_balance = parse_money(str(closing)) if closing not in (None, "") else None
        except (InvalidOperation, ValueError):
            return Response({"detail": "Enter valid opening and closing balances."}, status=HTTP_400_BAD_REQUEST)
        payload = upload.read()
        upload.seek(0)
        statement = import_statement(
            payload=payload,
            filename=upload.name,
            ledger=Order.Ledger.FEDERATION,
            club_id=None,
            actor=request.user,
            opening_balance=opening_balance,
            closing_balance=closing_balance,
            source_file=upload,
        )
        return Response(statement_payload(statement, request), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def match(self, request, pk=None):
        statement = self.get_object()
        line = statement.lines.filter(id=request.data.get("line")).first()
        if line is None:
            return Response({"line": "Statement line not found."}, status=HTTP_400_BAD_REQUEST)
        try:
            target_id = int(request.data.get("id") or 0)
        except (TypeError, ValueError):
            return Response({"id": "Choose a book entry to match."}, status=HTTP_400_BAD_REQUEST)
        apply_match(
            line,
            kind=str(request.data.get("kind") or ""),
            target_id=target_id,
            actor=request.user,
        )
        return Response(statement_payload(statement, request))

    @action(detail=True, methods=["post"])
    def unmatch(self, request, pk=None):
        statement = self.get_object()
        line = statement.lines.filter(id=request.data.get("line")).first()
        if line is None:
            return Response({"line": "Statement line not found."}, status=HTTP_400_BAD_REQUEST)
        clear_match(line)
        return Response(statement_payload(statement, request))

    @action(detail=True, methods=["post"])
    def ignore(self, request, pk=None):
        statement = self.get_object()
        line = statement.lines.filter(id=request.data.get("line")).first()
        if line is None:
            return Response({"line": "Statement line not found."}, status=HTTP_400_BAD_REQUEST)
        ignore_line(line)
        return Response(statement_payload(statement, request))

    @action(detail=True, methods=["get"])
    def suggestions(self, request, pk=None):
        statement = self.get_object()
        line = statement.lines.filter(id=request.query_params.get("line")).first()
        if line is None:
            return Response({"line": "Statement line not found."}, status=HTTP_400_BAD_REQUEST)
        return Response({"line": line.id, "candidates": suggest_matches(line)})

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        statement = self.get_object()
        statement.status = BankStatement.Status.COMPLETED
        statement.completed_at = timezone.now()
        statement.save(update_fields=["status", "completed_at", "updated_at"])
        return Response(statement_payload(statement, request))


class ClubFinanceBudgetView(APIView):
    permission_classes = [IsClubAdmin]

    def get(self, request):
        club_id = _club_id(request)
        if not can_view_club_books(request.user, club_id):
            raise PermissionDenied(detail="This module is not available.")
        year_param = request.query_params.get("year")
        try:
            year = int(year_param) if year_param else timezone.localdate().year
        except (TypeError, ValueError):
            return Response({"detail": "Enter a valid year."}, status=HTTP_400_BAD_REQUEST)
        return Response(build_budget(ledger=Order.Ledger.CLUB, club_id=club_id, year=year))

    def put(self, request):
        club_id = _club_id(request)
        if not can_mutate_club_books(request.user, club_id):
            return Response(
                {"detail": "Only committee officers with bank access can save the budget."},
                status=HTTP_403_FORBIDDEN,
            )
        year_param = request.data.get("year") or request.query_params.get("year")
        try:
            year = int(year_param)
        except (TypeError, ValueError):
            return Response({"detail": "Enter a valid year."}, status=HTTP_400_BAD_REQUEST)
        lines = request.data.get("lines") or []
        if not isinstance(lines, list):
            return Response({"lines": "Send a list of budget lines."}, status=HTTP_400_BAD_REQUEST)
        return Response(
            save_budget(
                ledger=Order.Ledger.CLUB,
                club_id=club_id,
                year=year,
                lines=lines,
                actor=request.user,
            )
        )


class FederationFinanceBudgetView(APIView):
    permission_classes = [IsLtfFinance]

    def get(self, request):
        year_param = request.query_params.get("year")
        try:
            year = int(year_param) if year_param else timezone.localdate().year
        except (TypeError, ValueError):
            return Response({"detail": "Enter a valid year."}, status=HTTP_400_BAD_REQUEST)
        return Response(build_budget(ledger=Order.Ledger.FEDERATION, club_id=None, year=year))

    def put(self, request):
        year_param = request.data.get("year") or request.query_params.get("year")
        try:
            year = int(year_param)
        except (TypeError, ValueError):
            return Response({"detail": "Enter a valid year."}, status=HTTP_400_BAD_REQUEST)
        lines = request.data.get("lines") or []
        if not isinstance(lines, list):
            return Response({"lines": "Send a list of budget lines."}, status=HTTP_400_BAD_REQUEST)
        return Response(
            save_budget(
                ledger=Order.Ledger.FEDERATION,
                club_id=None,
                year=year,
                lines=lines,
                actor=request.user,
            )
        )
