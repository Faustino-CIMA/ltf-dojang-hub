"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { ClubFinanceTabs } from "@/components/club-admin/club-finance-tabs";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useClubFinanceAccess } from "@/components/club-admin/use-club-finance-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AppTextarea,
  FormPanel,
  PageNotice,
  ActionNotices,
} from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirmClubOrderPayment, FinanceInvoice, getClubInvoice } from "@/lib/club-finance-api";
import { isClubLedger } from "@/lib/ltf-finance-api";

function todayDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateToIso(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) {
    return new Date().toISOString();
  }
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

function defaultProviderForMethod(method: string) {
  if (method === "card") {
    return "stripe";
  }
  if (method === "other") {
    return "other";
  }
  return "manual";
}

export default function ClubRecordPaymentPage() {
  const t = useTranslations("ClubAdmin");
  const tf = useTranslations("LtfFinance");
  const common = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const [invoice, setInvoice] = useState<FinanceInvoice | null>(null);
  const { canRecordPayments, isLoaded: accessLoaded } = useClubFinanceAccess(invoice?.club ?? null);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentProvider, setPaymentProvider] = useState("manual");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayDateInputValue);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const invoiceId = useMemo(() => {
    const rawId = params?.id;
    if (Array.isArray(rawId)) {
      return Number(rawId[0]);
    }
    return Number(rawId);
  }, [params]);

  const paymentsHref = `/${locale}/dashboard/club/payments`;
  const invoicePaymentsHref = `/${locale}/dashboard/club/payments/${invoiceId}`;

  useEffect(() => {
    if (!invoiceId || Number.isNaN(invoiceId)) {
      setErrorMessage(t("paymentsLoadError"));
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const invoiceResponse = await getClubInvoice(invoiceId);
        if (cancelled) {
          return;
        }
        setInvoice(invoiceResponse);
        setPaymentReference(invoiceResponse.invoice_number);
        setPaymentDate(todayDateInputValue());
        setPaymentMethod("bank_transfer");
        setPaymentProvider("manual");
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : t("paymentsLoadError"));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
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
  }, [common, invoice?.status]);

  const outstanding = invoice ? Number(invoice.outstanding ?? invoice.total) : 0;
  const invoiceRecordable = invoice
    ? isClubLedger(invoice) && invoice.status !== "paid" && invoice.status !== "void" && outstanding > 0
    : false;

  const paymentMethodOptions = [
    { value: "bank_transfer", label: tf("paymentMethodBankTransfer") },
    { value: "cash", label: tf("paymentMethodCash") },
    { value: "card", label: tf("paymentMethodCard") },
    { value: "offline", label: tf("paymentMethodOffline") },
    { value: "other", label: tf("paymentMethodOther") },
  ];
  const paymentProviderOptions = [
    { value: "manual", label: tf("paymentProviderManual") },
    { value: "stripe", label: tf("paymentProviderStripe") },
    { value: "payconiq", label: tf("paymentProviderPayconiq") },
    { value: "paypal", label: tf("paymentProviderPaypal") },
    { value: "other", label: tf("paymentProviderOther") },
  ];

  const handleMethodChange = (value: string) => {
    setPaymentMethod(value);
    setPaymentProvider(defaultProviderForMethod(value));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invoice) {
      return;
    }
    if (!canRecordPayments) {
      setErrorMessage(t("paymentsRecordDenied"));
      return;
    }
    if (!invoice.order) {
      setErrorMessage(common("paymentMissingOrder"));
      return;
    }
    if (!paymentDate) {
      setErrorMessage(tf("paymentDateRequiredError"));
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await confirmClubOrderPayment(invoice.order, {
        payment_method: paymentMethod,
        payment_provider: paymentProvider,
        payment_reference: paymentReference.trim() || invoice.invoice_number,
        payment_notes: paymentNotes.trim() || undefined,
        paid_at: localDateToIso(paymentDate),
      });
      router.push(invoicePaymentsHref);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : common("paymentFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !accessLoaded) {
    return (
      <ClubAdminLayout title={t("recordPaymentTitle")} subtitle={t("recordPaymentPageSubtitle")}>
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      </ClubAdminLayout>
    );
  }

  if (!invoice) {
    return (
      <ClubAdminLayout title={t("recordPaymentTitle")} subtitle={t("recordPaymentPageSubtitle")}>
        <div className="space-y-6">
          <ClubFinanceTabs />
          <Button asChild variant="outline" className="w-fit">
            <Link href={paymentsHref}>{t("backToPayments")}</Link>
          </Button>
          <EmptyState title={t("paymentsLoadError")} description={errorMessage ?? ""} />
        </div>
      </ClubAdminLayout>
    );
  }

  return (
    <ClubAdminLayout title={t("recordPaymentTitle")} subtitle={t("recordPaymentPageSubtitle")}>
      <div className="space-y-6">
        <ClubFinanceTabs />
        <Button asChild variant="outline" className="w-fit">
          <Link href={paymentsHref}>{t("backToPayments")}</Link>
        </Button>
        <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />

        <FormPanel>
          <div className="grid gap-4 text-sm text-foreground md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{tf("invoiceNumberLabel")}</span>
              <span className="font-medium">{invoice.invoice_number}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{tf("statusLabel")}</span>
              <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{tf("paymentAmountLabel")}</span>
              <span className="font-medium">
                {invoice.outstanding ?? invoice.total} {invoice.currency}
              </span>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted">{tf("paymentAmountHint")}</p>
        </FormPanel>

        {!canRecordPayments ? (
          <PageNotice tone="info">{t("paymentsRecordDenied")}</PageNotice>
        ) : !invoiceRecordable ? (
          <PageNotice tone="info">
            {invoice.status === "paid" || outstanding <= 0
              ? tf("recordPaymentAlreadyPaid")
              : tf("recordPaymentNotAllowed")}
          </PageNotice>
        ) : (
          <FormPanel>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="payment-date">
                    {tf("paymentDateLabel")}
                  </label>
                  <Input
                    id="payment-date"
                    type="date"
                    value={paymentDate}
                    onChange={(event) => setPaymentDate(event.target.value)}
                    required
                  />
                  <p className="text-xs text-muted">{tf("paymentDateHint")}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="payment-communication">
                    {tf("paymentReferenceLabel")}
                  </label>
                  <Input
                    id="payment-communication"
                    value={paymentReference}
                    onChange={(event) => setPaymentReference(event.target.value)}
                    placeholder={invoice.invoice_number}
                  />
                  <p className="text-xs text-muted">{tf("paymentReferenceHint")}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{tf("paymentMethodLabel")}</label>
                  <Select value={paymentMethod} onValueChange={handleMethodChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethodOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{tf("paymentProviderLabel")}</label>
                  <Select value={paymentProvider} onValueChange={setPaymentProvider}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentProviderOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="payment-notes">
                    {tf("paymentNotesLabel")}
                  </label>
                  <AppTextarea
                    id="payment-notes"
                    value={paymentNotes}
                    onChange={(event) => setPaymentNotes(event.target.value)}
                    placeholder={tf("paymentNotesPlaceholder")}
                  />
                </div>
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                <Button type="submit" variant="primary" disabled={isSaving}>
                  {isSaving ? common("paymentProcessing") : t("recordPaymentButton")}
                </Button>
                <Button asChild type="button" variant="outline">
                  <Link href={invoicePaymentsHref}>{tf("paymentCancelButton")}</Link>
                </Button>
              </div>
            </form>
          </FormPanel>
        )}
      </div>
    </ClubAdminLayout>
  );
}
