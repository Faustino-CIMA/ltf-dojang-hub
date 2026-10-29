"""Daily renewal job for module purchases. Grandfathered rows have no end date and are skipped.

The job does not log anyone in and does not take payment. Signed links only record Continue or Stop.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal
from urllib.parse import quote

from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, dumps, loads
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.html import escape

from accounts.email_utils import send_resend_email
from clubs.communications import _copy_for
from modules.models import ClubModuleAssignment

from .models import (
    ClubFeeType,
    FinanceAuditLog,
    Invoice,
    ModulePurchase,
    ModuleRenewalJournal,
    ModuleSubscriptionSettings,
    Order,
    OrderItem,
)
from .module_fees import BILLABLE_MODULE_IDS
from .module_orders import _money, build_renewal_line, module_label

BATCH_LIMIT = 100
TOKEN_SALT = "module-renewal-choice-v1"
TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 400
logger = logging.getLogger(__name__)

NOTICE = ModuleRenewalJournal.Stage.RENEWAL_NOTICE
REMINDER = ModuleRenewalJournal.Stage.NOTICE_REMINDER
INVOICE_STAGE = ModuleRenewalJournal.Stage.RENEWAL_INVOICE
WARNING = ModuleRenewalJournal.Stage.PAYMENT_WARNING
SWITCHED_OFF = ModuleRenewalJournal.Stage.SWITCHED_OFF
STOPPED = ModuleRenewalJournal.Stage.STOPPED_AT_END
STOP_CONFIRMED = ModuleRenewalJournal.Stage.STOP_CONFIRMED
LATE = ModuleRenewalJournal.Stage.LATE_REACTIVATED


class RenewalLinkError(Exception):
    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


def ensure_legacy_purchases() -> int:
    """One held purchase, with no end date, for each module a club already has on."""
    assigned = ClubModuleAssignment.objects.filter(
        enabled=True,
        module_id__in=BILLABLE_MODULE_IDS,
    ).values_list("club_id", "module_id")
    covered: set[tuple[int, str]] = set()
    for club_id, module_ids in (
        ModulePurchase.objects.exclude(status=ModulePurchase.Status.CANCELLED).values_list("club_id", "module_ids")
    ):
        for module_id in module_ids or []:
            covered.add((club_id, str(module_id)))
    fees = {fee.module_id: fee for fee in ClubFeeType.objects.filter(module_id__in=BILLABLE_MODULE_IDS)}
    created = 0
    for club_id, module_id in assigned:
        if (club_id, module_id) in covered:
            continue
        fee = fees.get(module_id)
        ModulePurchase.objects.create(
            club_id=club_id,
            fee_type=fee,
            bundle=None,
            module_ids=[module_id],
            description=module_label(module_id),
            price_snapshot=Decimal("0.00"),
            currency="EUR",
            status=ModulePurchase.Status.ACTIVE,
            source=ModulePurchase.Source.LEGACY,
            automation_hold="grandfathered",
            activated_at=timezone.now(),
        )
        covered.add((club_id, module_id))
        created += 1
    return created


def _invoice_for_item(order_item):
    if order_item is None:
        return None
    try:
        return order_item.order.invoice
    except Invoice.DoesNotExist:
        return None


def live_renewal_invoice(purchase: ModulePurchase) -> Invoice | None:
    invoice = _invoice_for_item(purchase.renewal_order_item)
    if invoice is None:
        return None
    if invoice.status in {Invoice.Status.VOID, Invoice.Status.PAID}:
        return None
    if invoice.total > 0 and invoice.credited_total() >= invoice.total:
        return None
    return invoice


def _journaled(purchase: ModulePurchase, stage: str, period_end) -> bool:
    return ModuleRenewalJournal.objects.filter(
        purchase=purchase,
        period_end=period_end,
        stage=stage,
    ).exists()


def settle_voided_renewal(purchase: ModulePurchase) -> None:
    invoice = _invoice_for_item(purchase.renewal_order_item)
    if invoice is None:
        return
    voided = invoice.status == Invoice.Status.VOID or (
        invoice.total > 0 and invoice.credited_total() >= invoice.total
    )
    if not voided:
        return
    purchase.renewal_choice = ModulePurchase.RenewalChoice.STOP
    purchase.renewal_order_item = None
    purchase.save(update_fields=["renewal_choice", "renewal_order_item", "updated_at"])


def next_stage(purchase: ModulePurchase, today, settings_row) -> str | None:
    if purchase.automation_hold or purchase.ends_at is None:
        return None
    if purchase.status != ModulePurchase.Status.ACTIVE:
        return None
    end = purchase.ends_at
    invoice = live_renewal_invoice(purchase)
    if invoice is not None:
        issued_on = timezone.localtime(invoice.issued_at).date() if invoice.issued_at else today
        last_day = issued_on + timedelta(days=settings_row.payment_window_days)
        switch_day = last_day + timedelta(days=1)
        warning_day = last_day - timedelta(days=settings_row.payment_warning_days)
        if today >= switch_day and not _journaled(purchase, SWITCHED_OFF, end):
            return SWITCHED_OFF
        if warning_day <= today < switch_day and not _journaled(purchase, WARNING, end):
            return WARNING
        return None
    choice = purchase.renewal_choice
    if choice == ModulePurchase.RenewalChoice.CONTINUE and today >= end - timedelta(days=1):
        if not _journaled(purchase, INVOICE_STAGE, end):
            return INVOICE_STAGE
        return None
    if choice in {ModulePurchase.RenewalChoice.STOP, ModulePurchase.RenewalChoice.UNANSWERED} and today >= end:
        if not _journaled(purchase, STOPPED, end):
            return STOPPED
        return None
    if choice == ModulePurchase.RenewalChoice.UNANSWERED and today < end:
        notice_on = end - timedelta(days=settings_row.renewal_notice_days)
        half = settings_row.renewal_notice_days // 2
        notice_sent = _journaled(purchase, NOTICE, end)
        if half > 0 and today >= end - timedelta(days=half) and notice_sent and not _journaled(purchase, REMINDER, end):
            return REMINDER
        if today >= notice_on and not notice_sent:
            return NOTICE
    return None


def _claim(purchase: ModulePurchase, stage: str, period_end):
    try:
        return ModuleRenewalJournal.objects.create(purchase=purchase, period_end=period_end, stage=stage)
    except IntegrityError:
        return None


def _still_granted(purchase: ModulePurchase, module_id: str, today) -> bool:
    others = (
        ModulePurchase.objects.filter(club_id=purchase.club_id, status=ModulePurchase.Status.ACTIVE)
        .exclude(pk=purchase.pk)
        .exclude(switched_off_at__isnull=False)
    )
    for other in others:
        if module_id not in [str(item) for item in (other.module_ids or [])]:
            continue
        if other.ends_at is None or other.ends_at >= today:
            return True
    return False


def release_modules(purchase: ModulePurchase, today) -> None:
    for module_id in [str(item) for item in (purchase.module_ids or [])]:
        if _still_granted(purchase, module_id, today):
            continue
        ClubModuleAssignment.objects.filter(
            club_id=purchase.club_id,
            module_id=module_id,
            enabled=True,
        ).update(enabled=False)


def choice_url(purchase: ModulePurchase, choice: str) -> str:
    token = dumps(
        {"purchase": purchase.id, "choice": choice, "period_end": purchase.ends_at.isoformat()},
        salt=TOKEN_SALT,
    )
    return f"{settings.FRONTEND_BASE_URL}/en/module-renewal?token={quote(token, safe='')}"


def _send(club, subject: str, text: str) -> bool:
    recipients = club.notification_emails()
    if not recipients:
        return True
    html = "<p>" + "</p><p>".join(escape(line) for line in text.splitlines() if line.strip()) + "</p>"
    for email in recipients:
        success, _error = send_resend_email(email, subject, html, text)
        if not success:
            return False
    return True


def _price_text(purchase: ModulePurchase, today) -> str:
    line = build_renewal_line(purchase, today)
    if line is None:
        return ""
    return f"{_money(line['charged_amount'])} EUR"


COPY = {
    "en": {
        "notice_subject": "Your modules end on {date}",
        "notice_body": "{name} ends on {date}. Continuing costs {price}. Open Continue or Stop. If you do not answer, the modules switch off on {date}.",
        "continue_link": "Continue: {url}",
        "stop_link": "Stop: {url}",
        "reminder_subject": "Reminder: your modules end on {date}",
        "reminder_body": "{name} still ends on {date}. Continuing costs {price}. If you do not answer, the modules switch off on {date}.",
        "stop_subject": "These modules will stop",
        "stop_body": "{name} stays on until {date}, then switches off. We will not ask again.",
        "invoice_subject": "Renewal invoice {number}",
        "invoice_body": "Invoice {number} for {amount} is ready. Pay by {last_day}. The modules stay on until that day.",
        "warning_subject": "Renewal invoice {number} is still unpaid",
        "warning_body": "Pay invoice {number} by {last_day}. The next morning the modules switch off.",
        "off_subject": "Modules switched off",
        "off_body": "{name} is off because invoice {number} was not paid. Paying that invoice turns the modules back on.",
        "page_continue_title": "Continue these modules",
        "page_stop_title": "Stop these modules",
        "page_continue_body": "{name} ends on {date}. Confirm to renew. Nothing is paid from this page.",
        "page_stop_body": "{name} stays on until {date}, then switches off. Confirm to stop.",
        "page_confirm": "Confirm",
        "page_done_continue": "Continue is saved. The renewal invoice arrives the day before {date}.",
        "page_done_stop": "Stop is saved. The modules stay on until {date}.",
        "page_closed": "This choice can no longer be changed.",
        "page_expired": "This link has expired.",
        "page_invalid": "This link is not valid.",
    },
    "fr": {
        "notice_subject": "Vos modules se terminent le {date}",
        "notice_body": "{name} se termine le {date}. Continuer coûte {price}. Ouvrez Continuer ou Arrêter. Sans réponse, les modules s'éteignent le {date}.",
        "continue_link": "Continuer : {url}",
        "stop_link": "Arrêter : {url}",
        "reminder_subject": "Rappel : vos modules se terminent le {date}",
        "reminder_body": "{name} se termine toujours le {date}. Continuer coûte {price}. Sans réponse, les modules s'éteignent le {date}.",
        "stop_subject": "Ces modules vont s'arrêter",
        "stop_body": "{name} reste actif jusqu'au {date}, puis s'éteint. Nous ne redemanderons pas.",
        "invoice_subject": "Facture de renouvellement {number}",
        "invoice_body": "La facture {number} de {amount} est prête. Payez avant le {last_day}. Les modules restent actifs jusqu'à ce jour.",
        "warning_subject": "La facture de renouvellement {number} n'est pas payée",
        "warning_body": "Payez la facture {number} avant le {last_day}. Le lendemain matin, les modules s'éteignent.",
        "off_subject": "Modules éteints",
        "off_body": "{name} est éteint parce que la facture {number} n'est pas payée. La payer rallume les modules.",
        "page_continue_title": "Continuer ces modules",
        "page_stop_title": "Arrêter ces modules",
        "page_continue_body": "{name} se termine le {date}. Confirmez pour renouveler. Cette page ne paie rien.",
        "page_stop_body": "{name} reste actif jusqu'au {date}, puis s'éteint. Confirmez pour arrêter.",
        "page_confirm": "Confirmer",
        "page_done_continue": "Continuer est enregistré. La facture arrive la veille du {date}.",
        "page_done_stop": "Arrêter est enregistré. Les modules restent actifs jusqu'au {date}.",
        "page_closed": "Ce choix ne peut plus être modifié.",
        "page_expired": "Ce lien a expiré.",
        "page_invalid": "Ce lien n'est pas valable.",
    },
    "de": {
        "notice_subject": "Ihre Module enden am {date}",
        "notice_body": "{name} endet am {date}. Weiter kostet {price}. Öffnen Sie Weiter oder Stopp. Ohne Antwort schalten die Module am {date} ab.",
        "continue_link": "Weiter: {url}",
        "stop_link": "Stopp: {url}",
        "reminder_subject": "Erinnerung: Ihre Module enden am {date}",
        "reminder_body": "{name} endet weiterhin am {date}. Weiter kostet {price}. Ohne Antwort schalten die Module am {date} ab.",
        "stop_subject": "Diese Module werden gestoppt",
        "stop_body": "{name} bleibt bis {date} an und schaltet dann ab. Wir fragen nicht noch einmal.",
        "invoice_subject": "Verlängerungsrechnung {number}",
        "invoice_body": "Rechnung {number} über {amount} ist bereit. Zahlen Sie bis {last_day}. Die Module bleiben bis zu diesem Tag an.",
        "warning_subject": "Verlängerungsrechnung {number} ist noch offen",
        "warning_body": "Zahlen Sie Rechnung {number} bis {last_day}. Am nächsten Morgen schalten die Module ab.",
        "off_subject": "Module ausgeschaltet",
        "off_body": "{name} ist aus, weil Rechnung {number} nicht bezahlt wurde. Die Rechnung zu zahlen schaltet die Module wieder ein.",
        "page_continue_title": "Diese Module verlängern",
        "page_stop_title": "Diese Module stoppen",
        "page_continue_body": "{name} endet am {date}. Bestätigen Sie die Verlängerung. Diese Seite zahlt nicht.",
        "page_stop_body": "{name} bleibt bis {date} an und schaltet dann ab. Bestätigen Sie den Stopp.",
        "page_confirm": "Bestätigen",
        "page_done_continue": "Weiter ist gespeichert. Die Rechnung kommt am Tag vor {date}.",
        "page_done_stop": "Stopp ist gespeichert. Die Module bleiben bis {date} an.",
        "page_closed": "Diese Wahl kann nicht mehr geändert werden.",
        "page_expired": "Dieser Link ist abgelaufen.",
        "page_invalid": "Dieser Link ist ungültig.",
    },
    "lb": {
        "notice_subject": "Är Moduler enden den {date}",
        "notice_body": "{name} end den {date}. Weider kascht {price}. Maacht Weider oder Stopp op. Ouni Äntwert ginn d'Moduler den {date} aus.",
        "continue_link": "Weider: {url}",
        "stop_link": "Stopp: {url}",
        "reminder_subject": "Erënnerung: Är Moduler enden den {date}",
        "reminder_body": "{name} end nach ëmmer den {date}. Weider kascht {price}. Ouni Äntwert ginn d'Moduler den {date} aus.",
        "stop_subject": "Dës Moduler ginn gestoppt",
        "stop_body": "{name} bleift bis {date} un an geet dann aus. Mir froen net nach eng Kéier.",
        "invoice_subject": "Verlängerungsrechnung {number}",
        "invoice_body": "D'Rechnung {number} iwwer {amount} ass prett. Bezuelt bis {last_day}. D'Moduler bleiwen bis deen Dag un.",
        "warning_subject": "Verlängerungsrechnung {number} ass nach op",
        "warning_body": "Bezuelt d'Rechnung {number} bis {last_day}. De Moien drop ginn d'Moduler aus.",
        "off_subject": "Moduler ausgeschalt",
        "off_body": "{name} ass aus, well d'Rechnung {number} net bezuelt gouf. Se ze bezuelen schalt d'Moduler nees un.",
        "page_continue_title": "Dës Moduler verlängeren",
        "page_stop_title": "Dës Moduler stoppen",
        "page_continue_body": "{name} end den {date}. Bestätegt d'Verlängerung. Dës Säit bezilt näischt.",
        "page_stop_body": "{name} bleift bis {date} un an geet dann aus. Bestätegt de Stopp.",
        "page_confirm": "Bestätegen",
        "page_done_continue": "Weider ass gespäichert. D'Rechnung kënnt den Dag virun {date}.",
        "page_done_stop": "Stopp ass gespäichert. D'Moduler bleiwen bis {date} un.",
        "page_closed": "Dës Wiel kann net méi geännert ginn.",
        "page_expired": "Dëse Link ass ofgelaf.",
        "page_invalid": "Dëse Link ass net gülteg.",
    },
}


def _copy(club) -> dict[str, str]:
    return _copy_for(COPY, club)


def _notice_text(purchase: ModulePurchase, today, copy: dict[str, str], *, reminder: bool) -> tuple[str, str]:
    price = _price_text(purchase, today) or "—"
    values = {
        "name": purchase.description,
        "date": purchase.ends_at.isoformat(),
        "price": price,
        "url": "",
    }
    subject = copy["reminder_subject" if reminder else "notice_subject"].format(**values)
    body = copy["reminder_body" if reminder else "notice_body"].format(**values)
    continue_line = copy["continue_link"].format(url=choice_url(purchase, "continue"))
    stop_line = copy["stop_link"].format(url=choice_url(purchase, "stop"))
    return subject, "\n".join([body, continue_line, stop_line])


def _run_notice(purchase: ModulePurchase, today, *, reminder: bool) -> None:
    claim = _claim(purchase, REMINDER if reminder else NOTICE, purchase.ends_at)
    if claim is None:
        return
    try:
        subject, text = _notice_text(purchase, today, _copy(purchase.club), reminder=reminder)
        if not _send(purchase.club, subject, text):
            raise RuntimeError("email failed")
    except Exception:
        claim.delete()
        raise


def _run_stop_notice(purchase: ModulePurchase) -> None:
    claim = _claim(purchase, STOP_CONFIRMED, purchase.ends_at)
    if claim is None:
        return
    try:
        copy = _copy(purchase.club)
        values = {"name": purchase.description, "date": purchase.ends_at.isoformat()}
        if not _send(purchase.club, copy["stop_subject"].format(**values), copy["stop_body"].format(**values)):
            raise RuntimeError("email failed")
    except Exception:
        claim.delete()
        raise


def _create_renewal_invoices(purchases: list[ModulePurchase], today) -> None:
    grouped: dict[int, list[ModulePurchase]] = {}
    for purchase in purchases:
        grouped.setdefault(purchase.club_id, []).append(purchase)
    for group in grouped.values():
      try:
        with transaction.atomic():
            claims = []
            lines = []
            ready: list[tuple[ModulePurchase, dict]] = []
            for purchase in group:
                locked = ModulePurchase.objects.select_for_update().get(pk=purchase.pk)
                settle_voided_renewal(locked)
                if locked.renewal_choice != ModulePurchase.RenewalChoice.CONTINUE:
                    continue
                if live_renewal_invoice(locked) is not None or _journaled(locked, INVOICE_STAGE, locked.ends_at):
                    continue
                line = build_renewal_line(locked, today)
                claim = _claim(locked, INVOICE_STAGE, locked.ends_at) if line is not None else None
                if line is None or claim is None:
                    continue
                claims.append(claim)
                lines.append(line)
                ready.append((locked, line))
            if not ready:
                continue
            try:
                subtotal = sum((line["charged_amount"] for _purchase, line in ready), Decimal("0.00"))
                club = ready[0][0].club
                order = Order.objects.create(
                    club=club,
                    member=None,
                    ledger=Order.Ledger.FEDERATION,
                    status=Order.Status.PENDING,
                    currency="EUR",
                    subtotal=subtotal,
                    tax_total=Decimal("0.00"),
                    total=subtotal,
                )
                for purchase, line in ready:
                    item = OrderItem.objects.create(
                        order=order,
                        license=None,
                        fee_type=line["fee_type"],
                        bundle=line["bundle"],
                        description=line["description"],
                        billing_club=club,
                        charge_active=False,
                        price_snapshot=line["price_snapshot"],
                        quantity=line["quantity"],
                        active_member_count=line["active_member_count"],
                        minimum_applied=line["minimum_applied"],
                        charged_amount=line["charged_amount"],
                    )
                    purchase.renewal_order_item = item
                    purchase.save(update_fields=["renewal_order_item", "updated_at"])
                invoice = Invoice.objects.create(
                    order=order,
                    club=club,
                    member=None,
                    status=Invoice.Status.ISSUED,
                    currency="EUR",
                    subtotal=subtotal,
                    tax_total=Decimal("0.00"),
                    total=subtotal,
                    issued_at=timezone.now(),
                )
                FinanceAuditLog.objects.create(
                    action="module_renewal.invoiced",
                    message="Module renewal invoice created.",
                    actor=None,
                    club=club,
                    order=order,
                    invoice=invoice,
                    metadata={"total": _money(subtotal)},
                )
                settings_row = ModuleSubscriptionSettings.load()
                issued_on = timezone.localtime(invoice.issued_at).date()
                last_day = issued_on + timedelta(days=settings_row.payment_window_days)
                copy = _copy(club)
                values = {
                    "number": invoice.invoice_number,
                    "amount": f"{_money(subtotal)} EUR",
                    "last_day": last_day.isoformat(),
                }
                if not _send(club, copy["invoice_subject"].format(**values), copy["invoice_body"].format(**values)):
                    raise RuntimeError("email failed")
            except Exception:
                logger.exception("Module renewal invoice failed")
                raise
      except Exception:
        logger.exception("Module renewal invoice rolled back")


def _run_warning(purchase: ModulePurchase, today, settings_row) -> None:
    invoice = live_renewal_invoice(purchase)
    if invoice is None:
        return
    claim = _claim(purchase, WARNING, purchase.ends_at)
    if claim is None:
        return
    try:
        issued_on = timezone.localtime(invoice.issued_at).date() if invoice.issued_at else today
        last_day = issued_on + timedelta(days=settings_row.payment_window_days)
        copy = _copy(purchase.club)
        values = {"number": invoice.invoice_number, "last_day": last_day.isoformat()}
        if not _send(purchase.club, copy["warning_subject"].format(**values), copy["warning_body"].format(**values)):
            raise RuntimeError("email failed")
    except Exception:
        claim.delete()
        raise


def _run_switched_off(purchase: ModulePurchase, today) -> None:
    invoice = live_renewal_invoice(purchase)
    claim = _claim(purchase, SWITCHED_OFF, purchase.ends_at)
    if claim is None:
        return
    try:
        with transaction.atomic():
            locked = ModulePurchase.objects.select_for_update().get(pk=purchase.pk)
            if locked.switched_off_at is None:
                release_modules(locked, today)
                locked.switched_off_at = timezone.now()
                locked.save(update_fields=["switched_off_at", "updated_at"])
            copy = _copy(locked.club)
            number = invoice.invoice_number if invoice is not None else ""
            values = {"name": locked.description, "number": number}
            if not _send(locked.club, copy["off_subject"].format(**values), copy["off_body"].format(**values)):
                raise RuntimeError("email failed")
    except Exception:
        claim.delete()
        raise


def _run_stopped(purchase: ModulePurchase, today) -> None:
    claim = _claim(purchase, STOPPED, purchase.ends_at)
    if claim is None:
        return
    try:
        with transaction.atomic():
            locked = ModulePurchase.objects.select_for_update().get(pk=purchase.pk)
            release_modules(locked, today)
            locked.status = ModulePurchase.Status.STOPPED
            locked.switched_off_at = locked.switched_off_at or timezone.now()
            locked.save(update_fields=["status", "switched_off_at", "updated_at"])
    except Exception:
        claim.delete()
        raise


def run_module_renewal_job(today=None) -> int:
    today = today or timezone.localdate()
    ensure_legacy_purchases()
    settings_row = ModuleSubscriptionSettings.load()
    window_start = today - timedelta(days=90)
    window_end = today + timedelta(days=90)
    candidates = (
        ModulePurchase.objects.filter(
            status=ModulePurchase.Status.ACTIVE,
            automation_hold="",
            ends_at__isnull=False,
            ends_at__gte=window_start,
            ends_at__lte=window_end,
        )
        .select_related("club", "bundle", "fee_type", "renewal_order_item__order__invoice")
        .order_by("ends_at", "id")
    )
    due: list[tuple[ModulePurchase, str]] = []
    for purchase in candidates:
        settle_voided_renewal(purchase)
        purchase.refresh_from_db()
        stage = next_stage(purchase, today, settings_row)
        if stage is None:
            continue
        due.append((purchase, stage))
        if len(due) >= BATCH_LIMIT:
            break
    invoice_due = [purchase for purchase, stage in due if stage == INVOICE_STAGE]
    if invoice_due:
        _create_renewal_invoices(invoice_due, today)
    for purchase, stage in due:
        if stage == INVOICE_STAGE:
            continue
        try:
            if stage in {NOTICE, REMINDER}:
                _run_notice(purchase, today, reminder=stage == REMINDER)
            elif stage == WARNING:
                _run_warning(purchase, today, settings_row)
            elif stage == SWITCHED_OFF:
                _run_switched_off(purchase, today)
            elif stage == STOPPED:
                _run_stopped(purchase, today)
        except Exception:
            logger.exception("Module renewal stage %s failed for purchase %s", stage, purchase.id)
    return len(due)


def _load_token(token: str) -> tuple[ModulePurchase, str]:
    if not token:
        raise RenewalLinkError("invalid")
    try:
        payload = loads(token, salt=TOKEN_SALT, max_age=TOKEN_MAX_AGE_SECONDS)
    except SignatureExpired as exc:
        raise RenewalLinkError("expired") from exc
    except BadSignature as exc:
        raise RenewalLinkError("invalid") from exc
    choice = payload.get("choice")
    if choice not in {ModulePurchase.RenewalChoice.CONTINUE, ModulePurchase.RenewalChoice.STOP}:
        raise RenewalLinkError("invalid")
    try:
        purchase = ModulePurchase.objects.select_related("club").get(pk=payload.get("purchase"))
    except ModulePurchase.DoesNotExist as exc:
        raise RenewalLinkError("invalid") from exc
    period_end = payload.get("period_end")
    if purchase.ends_at is None or purchase.ends_at.isoformat() != period_end:
        raise RenewalLinkError("expired")
    if timezone.localdate() > purchase.ends_at:
        raise RenewalLinkError("expired")
    return purchase, choice


def _page_payload(purchase: ModulePurchase, choice: str, *, done: bool, closed: bool = False) -> dict:
    copy = _copy(purchase.club)
    values = {"name": purchase.description, "date": purchase.ends_at.isoformat() if purchase.ends_at else ""}
    if closed:
        title = copy["page_closed"]
        body = copy["page_closed"]
    elif done and choice == ModulePurchase.RenewalChoice.CONTINUE:
        title = copy["page_continue_title"]
        body = copy["page_done_continue"].format(**values)
    elif done:
        title = copy["page_stop_title"]
        body = copy["page_done_stop"].format(**values)
    elif choice == ModulePurchase.RenewalChoice.CONTINUE:
        title = copy["page_continue_title"]
        body = copy["page_continue_body"].format(**values)
    else:
        title = copy["page_stop_title"]
        body = copy["page_stop_body"].format(**values)
    return {
        "ok": True,
        "choice": choice,
        "title": title,
        "body": body,
        "confirm": copy["page_confirm"],
        "done": done,
        "closed": closed,
    }


def preview_renewal_link(token: str) -> dict:
    try:
        purchase, choice = _load_token(token)
    except RenewalLinkError as exc:
        copy = COPY["en"]
        key = "page_expired" if exc.detail == "expired" else "page_invalid"
        return {"ok": False, "title": copy[key], "body": copy[key], "confirm": "", "done": False, "closed": True}
    closed = live_renewal_invoice(purchase) is not None or purchase.status != ModulePurchase.Status.ACTIVE
    return _page_payload(purchase, choice, done=False, closed=closed)


def apply_renewal_link(token: str) -> dict:
    purchase, choice = _load_token(token)
    changed = record_renewal_choice(purchase, choice)
    return _page_payload(purchase, choice, done=True, closed=not changed and live_renewal_invoice(purchase) is not None)


def record_renewal_choice(purchase: ModulePurchase, choice: str) -> bool:
    """Save Continue or Stop. Returns False when a renewal invoice already exists."""
    if choice not in {ModulePurchase.RenewalChoice.CONTINUE, ModulePurchase.RenewalChoice.STOP}:
        raise RenewalLinkError("invalid")
    if purchase.ends_at is None or purchase.automation_hold or purchase.status != ModulePurchase.Status.ACTIVE:
        return False
    if timezone.localdate() > purchase.ends_at:
        return False
    if live_renewal_invoice(purchase) is not None:
        return False
    purchase.renewal_choice = choice
    purchase.save(update_fields=["renewal_choice", "updated_at"])
    if choice == ModulePurchase.RenewalChoice.STOP:
        _run_stop_notice(purchase)
    return True


def renewal_rows_for_club(club, today=None) -> list[dict]:
    today = today or timezone.localdate()
    settings_row = ModuleSubscriptionSettings.load()
    purchases = (
        ModulePurchase.objects.filter(
            club=club,
            status=ModulePurchase.Status.ACTIVE,
            automation_hold="",
            ends_at__isnull=False,
        )
        .select_related("renewal_order_item__order__invoice")
        .order_by("ends_at", "id")
    )
    rows = []
    for purchase in purchases:
        end = purchase.ends_at
        invoice = live_renewal_invoice(purchase)
        in_notice = today >= end - timedelta(days=settings_row.renewal_notice_days) and today <= end
        pay_until = None
        in_window = False
        if invoice is not None and invoice.issued_at:
            issued_on = timezone.localtime(invoice.issued_at).date()
            pay_until = issued_on + timedelta(days=settings_row.payment_window_days)
            in_window = today <= pay_until
        if not in_notice and not in_window:
            continue
        rows.append(
            {
                "purchase_id": purchase.id,
                "name": purchase.description,
                "ends_at": end.isoformat(),
                "choice": purchase.renewal_choice,
                "can_choose": in_notice and invoice is None and today <= end,
                "invoice_id": invoice.id if invoice else None,
                "invoice_number": invoice.invoice_number if invoice else None,
                "pay_until": pay_until.isoformat() if pay_until else None,
            }
        )
    return rows


class ModuleRenewalLinkView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(preview_renewal_link(request.query_params.get("token", "")))

    def post(self, request):
        try:
            return Response(apply_renewal_link(str(request.data.get("token") or "")))
        except RenewalLinkError as exc:
            copy = COPY["en"]
            key = "page_expired" if exc.detail == "expired" else "page_invalid"
            return Response(
                {"ok": False, "title": copy[key], "body": copy[key], "confirm": "", "done": False, "closed": True},
                status=400,
            )
