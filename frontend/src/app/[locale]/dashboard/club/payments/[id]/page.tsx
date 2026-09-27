"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { ClubFinanceTabs } from "@/components/club-admin/club-finance-tabs";
import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { useClubFinanceAccess } from "@/components/club-admin/use-club-finance-access";
import { Button } from "@/components/ui/button";
import { FormPanel, ActionNotices } from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDisplayDateTime } from "@/lib/date-display";
import {
  FinanceInvoice,
  FinanceOrder,
  getClubInvoice,
  getClubOrder,
  getClubPayments,
} from "@/lib/club-finance-api";
import { isClubLedger, Payment } from "@/lib/ltf-finance-api";

type PaymentRow = {
  id: number;
  methodLabel: string;
  providerLabel: string;
  reference: string;
  cardLabel: string;
  amount: string;
  statusLabel: string;
  statusTone: "neutral" | "success" | "warning" | "danger";
  paidAt: string;
  recordedBy: string;
  notes: string;
};

export default function ClubPaymentDetailPage() {
  const t = useTranslations("ClubAdmin");
  const tf = useTranslations("LtfFinance");
  const common = useTranslations("Common");
  const locale = useLocale();
  const params = useParams();
  const [invoice, setInvoice] = useState<FinanceInvoice | null>(null);
  const [order, setOrder] = useState<FinanceOrder | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { canRecordPayments } = useClubFinanceAccess(invoice?.club ?? null);

  const invoiceId = useMemo(() => {
    const rawId = params?.id;
    if (Array.isArray(rawId)) {
      return Number(rawId[0]);
    }
    return Number(rawId);
  }, [params]);

  useEffect(() => {
    if (!invoiceId || Number.isNaN(invoiceId)) {
      setErrorMessage(t("paymentsLoadError"));
      setIsLoading(false);
      return;
    }
    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const invoiceResponse = await getClubInvoice(invoiceId);
        if (!isMounted) {
          return;
        }
        setInvoice(invoiceResponse);
        const [paymentsResponse, orderResponse] = await Promise.all([
          getClubPayments({ invoiceId }),
          invoiceResponse.order ? getClubOrder(invoiceResponse.order) : Promise.resolve(null),
        ]);
        if (!isMounted) {
          return;
        }
        setPayments(paymentsResponse);
        setOrder(orderResponse);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : t("paymentsLoadError"));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    void load();
    return () => {
      isMounted = false;
    };
  }, [invoiceId, t]);

  const statusMeta = useMemo(() => {
    const status = invoice?.status ?? "";
    switch (status) {
      case "draft":
        return { label: common("statusDraft"), tone: "neutral" as const };
      case "issued":
        return { label: common("statusIssued"), tone: "warning" as const };
      case "paid":
        return { label: common("statusPaid"), tone: "success" as const };
      case "void":
        return { label: common("statusVoid"), tone: "danger" as const };
      default:
        return { label: status || "-", tone: "neutral" as const };
    }
  }, [invoice?.status, common]);

  const paymentRows = useMemo<PaymentRow[]>(() => {
    const methodLabels: Record<string, string> = {
      card: tf("paymentMethodCard"),
      bank_transfer: tf("paymentMethodBankTransfer"),
      cash: tf("paymentMethodCash"),
      offline: tf("paymentMethodOffline"),
      other: tf("paymentMethodOther"),
    };
    const providerLabels: Record<string, string> = {
      stripe: tf("paymentProviderStripe"),
      payconiq: tf("paymentProviderPayconiq"),
      paypal: tf("paymentProviderPaypal"),
      manual: tf("paymentProviderManual"),
      other: tf("paymentProviderOther"),
    };
    return payments.map((payment) => {
      const paymentStatus =
        payment.status === "pending"
          ? { label: common("statusPending"), tone: "warning" as const }
          : payment.status === "paid"
            ? { label: common("statusPaid"), tone: "success" as const }
            : payment.status === "failed"
              ? { label: common("statusFailed"), tone: "danger" as const }
              : payment.status === "cancelled"
                ? { label: common("statusCancelled"), tone: "neutral" as const }
                : { label: payment.status, tone: "neutral" as const };
      return {
        id: payment.id,
        methodLabel: methodLabels[payment.method] ?? payment.method,
        providerLabel: providerLabels[payment.provider] ?? payment.provider,
        reference: payment.reference || "-",
        cardLabel:
          payment.card_brand && payment.card_last4
            ? `${payment.card_brand.toUpperCase()} •••• ${payment.card_last4}`
            : "-",
        amount: `${payment.amount} ${payment.currency}`,
        statusLabel: paymentStatus.label,
        statusTone: paymentStatus.tone,
        paidAt:
          payment.status === "paid" && payment.paid_at
            ? formatDisplayDateTime(payment.paid_at)
            : "—",
        recordedBy: payment.created_by ? String(payment.created_by) : "-",
        notes: payment.notes || "-",
      };
    });
  }, [common, payments, tf]);

  const columns = [
    { key: "methodLabel", header: tf("paymentMethodLabel") },
    { key: "providerLabel", header: tf("paymentProviderLabel") },
    { key: "reference", header: tf("paymentReferenceLabel") },
    { key: "cardLabel", header: tf("paymentCardLabel") },
    { key: "amount", header: tf("paymentAmountLabel") },
    {
      key: "statusLabel",
      header: tf("statusLabel"),
      render: (row: PaymentRow) => <StatusBadge label={row.statusLabel} tone={row.statusTone} />,
    },
    { key: "paidAt", header: tf("paidAtLabel") },
    { key: "recordedBy", header: tf("paymentRecordedByLabel") },
    { key: "notes", header: tf("paymentNotesLabel") },
  ];

  if (isLoading) {
    return (
      <ClubAdminLayout title={t("paymentDetailTitle")} subtitle={t("paymentDetailSubtitle")}>
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      </ClubAdminLayout>
    );
  }

  if (errorMessage || !invoice) {
    return (
      <ClubAdminLayout title={t("paymentDetailTitle")} subtitle={t("paymentDetailSubtitle")}>
        <EmptyState title={t("paymentsLoadError")} description={errorMessage ?? ""} />
      </ClubAdminLayout>
    );
  }

  const canRecordInvoice =
    isClubLedger(invoice) && invoice.status !== "paid" && invoice.status !== "void";

  return (
    <ClubAdminLayout title={t("paymentDetailTitle")} subtitle={t("paymentDetailSubtitle")}>
      <div className="space-y-6">
        <ClubFinanceTabs />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="w-fit">
            <Link href={`/${locale}/dashboard/club/payments`}>{t("backToPayments")}</Link>
          </Button>
          {canRecordPayments && canRecordInvoice ? (
            <Button asChild variant="primary">
              <Link href={`/${locale}/dashboard/club/payments/${invoice.id}/record`}>
                {t("recordPaymentButton")}
              </Link>
            </Button>
          ) : null}
        </div>

        <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />

        <FormPanel>
          <div className="grid gap-4 text-sm text-foreground md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{tf("invoiceNumberLabel")}</span>
              <span className="font-medium">{invoice.invoice_number}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{tf("invoiceStatusLabel")}</span>
              <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{tf("orderNumberLabel")}</span>
              <span className="font-medium">{order?.order_number ?? "-"}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{tf("totalLabel")}</span>
              <span className="font-medium">
                {invoice.total} {invoice.currency}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{tf("paidAtLabel")}</span>
              <span className="font-medium">{formatDisplayDateTime(invoice.paid_at)}</span>
            </div>
          </div>
        </FormPanel>

        <section className="space-y-3">
          <h2 className="text-section text-foreground">{tf("paymentHistoryTitle")}</h2>
          {paymentRows.length === 0 ? (
            <EmptyState
              title={tf("paymentHistoryEmptyTitle")}
              description={tf("paymentHistoryEmptySubtitle")}
            />
          ) : (
            <EntityTable columns={columns} rows={paymentRows} />
          )}
        </section>
      </div>
    </ClubAdminLayout>
  );
}
