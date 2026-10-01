"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { ClubFinanceTabs } from "@/components/club-admin/club-finance-tabs";
import { useClubFinanceAccess } from "@/components/club-admin/use-club-finance-access";
import { EmptyState } from "@/components/club-admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppTextarea, FormPanel, ActionNotices } from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getClubIncome, getClubIncomeCategories, updateClubIncome, voidClubIncome } from "@/lib/club-finance-api";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-display";
import { formatMoneyInput } from "@/lib/money-input";
import { FinanceIncome, IncomeCategory } from "@/lib/ltf-finance-api";

export default function ClubIncomeDetailPage() {
  const t = useTranslations("LtfFinance");
  const common = useTranslations("Common");
  const locale = useLocale();
  const params = useParams();
  const [income, setIncome] = useState<FinanceIncome | null>(null);
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [payer, setPayer] = useState("");
  const [amount, setAmount] = useState("");
  const [incomeDate, setIncomeDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { canRecordPayments } = useClubFinanceAccess(income?.club ?? null);

  const incomeId = useMemo(() => {
    const rawId = params?.id;
    return Number(Array.isArray(rawId) ? rawId[0] : rawId);
  }, [params]);

  const applyIncome = (next: FinanceIncome) => {
    setIncome(next);
    setCategoryId(String(next.category));
    setDescription(next.description);
    setPayer(next.payer);
    setAmount(next.amount);
    setIncomeDate(next.income_date);
    setPaymentMethod(next.payment_method || "bank_transfer");
    setReference(next.reference);
    setNotes(next.notes);
  };

  const loadData = useCallback(async () => {
    if (!incomeId || Number.isNaN(incomeId)) {
      setErrorMessage(t("incomeNotFoundSubtitle"));
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const incomeResponse = await getClubIncome(incomeId);
      applyIncome(incomeResponse);
      const categoryResponse = await getClubIncomeCategories(incomeResponse.club);
      setCategories(categoryResponse);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("incomeLoadError"));
    } finally {
      setIsLoading(false);
    }
  }, [incomeId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const statusMeta = useMemo(() => {
    switch (income?.status) {
      case "received":
        return { label: t("incomeStatusReceived"), tone: "success" as const };
      case "void":
        return { label: common("statusVoid"), tone: "danger" as const };
      default:
        return { label: income?.status ?? "-", tone: "neutral" as const };
    }
  }, [common, income?.status, t]);

  const methodLabel = useMemo(() => {
    const labels: Record<string, string> = {
      card: t("paymentMethodCard"),
      bank_transfer: t("paymentMethodBankTransfer"),
      cash: t("paymentMethodCash"),
      offline: t("paymentMethodOffline"),
      other: t("paymentMethodOther"),
    };
    return labels[income?.payment_method ?? ""] ?? (income?.payment_method || "-");
  }, [income?.payment_method, t]);

  const isLocked = income?.status === "void";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!income || isLocked) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const updated = await updateClubIncome(income.id, {
        category: Number(categoryId),
        description: description.trim(),
        payer: payer.trim(),
        amount: amount.trim(),
        income_date: incomeDate,
        payment_method: paymentMethod,
        reference: reference.trim(),
        notes: notes.trim(),
      }, receipt);
      applyIncome(updated);
      setReceipt(null);
      setSuccessMessage(t("incomeSavedMessage"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("incomeSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleVoid = async () => {
    if (!income) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      applyIncome(await voidClubIncome(income.id));
      setSuccessMessage(t("incomeVoidedMessage"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("incomeSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <ClubAdminLayout title={t("incomeDetailTitle")} subtitle={t("incomeDetailSubtitle")}>
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      </ClubAdminLayout>
    );
  }

  if (errorMessage || !income) {
    return (
      <ClubAdminLayout title={t("incomeDetailTitle")} subtitle={t("incomeDetailSubtitle")}>
        <EmptyState title={t("incomeNotFoundTitle")} description={errorMessage ?? t("incomeNotFoundSubtitle")} />
      </ClubAdminLayout>
    );
  }

  return (
    <ClubAdminLayout title={t("incomeDetailTitle")} subtitle={t("incomeDetailSubtitle")}>
      <div className="space-y-6">
        <ClubFinanceTabs />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="w-fit">
            <Link href={`/${locale}/dashboard/club/income`}>{t("backToIncome")}</Link>
          </Button>
          {canRecordPayments && !isLocked ? (
            <Button type="button" variant="outline" onClick={() => void handleVoid()} disabled={isSaving}>
              {t("voidIncomeAction")}
            </Button>
          ) : null}
        </div>

        <ActionNotices
          error={errorMessage}
          success={successMessage}
          onDismiss={() => {
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
        />

        <FormPanel>
          <div className="grid gap-4 text-sm text-foreground md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("incomeNumberLabel")}</span>
              <span className="font-medium">{income.income_number}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("statusLabel")}</span>
              <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("incomeDateLabel")}</span>
              <span className="font-medium">{formatDisplayDate(income.income_date)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("incomeAmountLabel")}</span>
              <span className="font-medium">
                {income.amount} {income.currency}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("incomeCategoryLabel")}</span>
              <span className="font-medium">{income.category_name || "-"}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("incomePayerLabel")}</span>
              <span className="font-medium">{income.payer || "-"}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("paymentMethodLabel")}</span>
              <span className="font-medium">{methodLabel}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("paymentReferenceLabel")}</span>
              <span className="font-medium">{income.reference || "-"}</span>
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs text-muted">{t("incomeDescriptionLabel")}</span>
              <span className="font-medium">{income.description || "-"}</span>
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs text-muted">{t("paymentNotesLabel")}</span>
              <span className="font-medium">{income.notes || "-"}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("receiptLabel")}</span>
              {income.receipt_url ? (
                <a
                  href={income.receipt_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t("viewReceiptAction")}
                </a>
              ) : (
                <span className="font-medium">{t("noReceiptLabel")}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("paidAtLabel")}</span>
              <span className="font-medium">{formatDisplayDateTime(income.received_at)}</span>
            </div>
          </div>
        </FormPanel>

        {canRecordPayments && !isLocked ? (
          <FormPanel>
            <h2 className="mb-4 text-section text-foreground">{t("incomeFormSubtitle")}</h2>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="income-date">
                    {t("incomeDateLabel")}
                  </label>
                  <Input
                    id="income-date"
                    type="date"
                    value={incomeDate}
                    onChange={(event) => setIncomeDate(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{t("incomeCategoryLabel")}</label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={String(category.id)}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="income-payer">
                    {t("incomePayerLabel")}
                  </label>
                  <Input id="income-payer" value={payer} onChange={(event) => setPayer(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="income-amount">
                    {t("incomeAmountLabel")}
                  </label>
                  <Input
                    id="income-amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    onBlur={() => setAmount((current) => formatMoneyInput(current))}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="income-description">
                    {t("incomeDescriptionLabel")}
                  </label>
                  <Input
                    id="income-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{t("paymentMethodLabel")}</label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">{t("paymentMethodBankTransfer")}</SelectItem>
                      <SelectItem value="cash">{t("paymentMethodCash")}</SelectItem>
                      <SelectItem value="card">{t("paymentMethodCard")}</SelectItem>
                      <SelectItem value="offline">{t("paymentMethodOffline")}</SelectItem>
                      <SelectItem value="other">{t("paymentMethodOther")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="income-reference">
                    {t("paymentReferenceLabel")}
                  </label>
                  <Input
                    id="income-reference"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground">{t("paymentNotesLabel")}</label>
                  <AppTextarea value={notes} onChange={(event) => setNotes(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="income-receipt">
                    {t("receiptLabel")}
                  </label>
                  <Input
                    id="income-receipt"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(event) => setReceipt(event.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted">{t("receiptHint")}</p>
                </div>
              </div>
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? t("savingAction") : t("saveChanges")}
              </Button>
            </form>
          </FormPanel>
        ) : null}
      </div>
    </ClubAdminLayout>
  );
}
