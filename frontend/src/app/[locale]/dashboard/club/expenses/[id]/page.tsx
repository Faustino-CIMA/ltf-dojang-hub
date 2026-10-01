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
import {
  getClubExpense,
  getClubExpenseCategories,
  markClubExpensePaid,
  updateClubExpense,
  voidClubExpense,
} from "@/lib/club-finance-api";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-display";
import { formatMoneyInput } from "@/lib/money-input";
import { ExpenseCategory, FinanceExpense } from "@/lib/ltf-finance-api";

export default function ClubExpenseDetailPage() {
  const t = useTranslations("LtfFinance");
  const common = useTranslations("Common");
  const locale = useLocale();
  const params = useParams();
  const [expense, setExpense] = useState<FinanceExpense | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { canRecordPayments } = useClubFinanceAccess(expense?.club ?? null);

  const expenseId = useMemo(() => {
    const rawId = params?.id;
    return Number(Array.isArray(rawId) ? rawId[0] : rawId);
  }, [params]);

  const applyExpense = (next: FinanceExpense) => {
    setExpense(next);
    setCategoryId(String(next.category));
    setDescription(next.description);
    setPayee(next.payee);
    setAmount(next.amount);
    setExpenseDate(next.expense_date);
    setPaymentMethod(next.payment_method || "bank_transfer");
    setReference(next.reference);
    setNotes(next.notes);
  };

  const loadData = useCallback(async () => {
    if (!expenseId || Number.isNaN(expenseId)) {
      setErrorMessage(t("expenseNotFoundSubtitle"));
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const expenseResponse = await getClubExpense(expenseId);
      applyExpense(expenseResponse);
      setCategories(await getClubExpenseCategories(expenseResponse.club));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("expensesLoadError"));
    } finally {
      setIsLoading(false);
    }
  }, [expenseId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const statusMeta = useMemo(() => {
    switch (expense?.status) {
      case "paid":
        return { label: common("statusPaid"), tone: "success" as const };
      case "void":
        return { label: common("statusVoid"), tone: "danger" as const };
      case "recorded":
        return { label: t("expenseStatusRecorded"), tone: "warning" as const };
      default:
        return { label: expense?.status ?? "-", tone: "neutral" as const };
    }
  }, [common, expense?.status, t]);

  const methodLabel = useMemo(() => {
    const labels: Record<string, string> = {
      card: t("paymentMethodCard"),
      bank_transfer: t("paymentMethodBankTransfer"),
      cash: t("paymentMethodCash"),
      offline: t("paymentMethodOffline"),
      other: t("paymentMethodOther"),
    };
    return labels[expense?.payment_method ?? ""] ?? (expense?.payment_method || "-");
  }, [expense?.payment_method, t]);

  const isLocked = expense?.status === "void" || expense?.status === "paid";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!expense || isLocked) {
      return;
    }
    const formattedAmount = formatMoneyInput(amount.trim());
    setAmount(formattedAmount);
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      applyExpense(
        await updateClubExpense(expense.id, {
          category: Number(categoryId),
          description: description.trim(),
          payee: payee.trim(),
          amount: formattedAmount,
          expense_date: expenseDate,
          payment_method: paymentMethod,
          reference: reference.trim(),
          notes: notes.trim(),
        }, receipt)
      );
      setReceipt(null);
      setSuccessMessage(t("expenseSavedMessage"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("expenseSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleVoid = async () => {
    if (!expense) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      applyExpense(await voidClubExpense(expense.id));
      setSuccessMessage(t("expenseVoidedMessage"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("expenseSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!expense) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      applyExpense(await markClubExpensePaid(expense.id, { payment_method: paymentMethod }));
      setSuccessMessage(t("expenseMarkedPaidMessage"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("expenseSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <ClubAdminLayout title={t("expenseDetailTitle")} subtitle={t("expenseDetailSubtitle")}>
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      </ClubAdminLayout>
    );
  }

  if (errorMessage || !expense) {
    return (
      <ClubAdminLayout title={t("expenseDetailTitle")} subtitle={t("expenseDetailSubtitle")}>
        <EmptyState title={t("expenseNotFoundTitle")} description={errorMessage ?? t("expenseNotFoundSubtitle")} />
      </ClubAdminLayout>
    );
  }

  return (
    <ClubAdminLayout title={t("expenseDetailTitle")} subtitle={t("expenseDetailSubtitle")}>
      <div className="space-y-6">
        <ClubFinanceTabs />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="w-fit">
            <Link href={`/${locale}/dashboard/club/expenses`}>{t("backToExpenses")}</Link>
          </Button>
          {canRecordPayments && expense.status === "recorded" ? (
            <Button type="button" variant="primary" onClick={() => void handleMarkPaid()} disabled={isSaving}>
              {t("markExpensePaidAction")}
            </Button>
          ) : null}
          {canRecordPayments && expense.status !== "void" ? (
            <Button type="button" variant="outline" onClick={() => void handleVoid()} disabled={isSaving}>
              {t("voidExpenseAction")}
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
              <span className="text-xs text-muted">{t("expenseNumberLabel")}</span>
              <span className="font-medium">{expense.expense_number}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("statusLabel")}</span>
              <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("expenseDateLabel")}</span>
              <span className="font-medium">{formatDisplayDate(expense.expense_date)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("expenseAmountLabel")}</span>
              <span className="font-medium">
                {expense.amount} {expense.currency}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("expenseCategoryLabel")}</span>
              <span className="font-medium">{expense.category_name || "-"}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("expensePayeeLabel")}</span>
              <span className="font-medium">{expense.payee || "-"}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("paymentMethodLabel")}</span>
              <span className="font-medium">{methodLabel}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("expenseReferenceLabel")}</span>
              <span className="font-medium">{expense.reference || "-"}</span>
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs text-muted">{t("expenseDescriptionLabel")}</span>
              <span className="font-medium">{expense.description || "-"}</span>
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs text-muted">{t("paymentNotesLabel")}</span>
              <span className="font-medium">{expense.notes || "-"}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("receiptLabel")}</span>
              {expense.receipt_url ? (
                <a
                  href={expense.receipt_url}
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
              <span className="font-medium">{formatDisplayDateTime(expense.paid_at)}</span>
            </div>
          </div>
        </FormPanel>

        {canRecordPayments && !isLocked ? (
          <FormPanel>
            <h2 className="mb-4 text-section text-foreground">{t("expenseFormSubtitle")}</h2>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="expense-date">
                    {t("expenseDateLabel")}
                  </label>
                  <Input
                    id="expense-date"
                    type="date"
                    value={expenseDate}
                    onChange={(event) => setExpenseDate(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{t("expenseCategoryLabel")}</label>
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
                  <label className="text-sm font-medium text-foreground" htmlFor="expense-payee">
                    {t("expensePayeeLabel")}
                  </label>
                  <Input id="expense-payee" value={payee} onChange={(event) => setPayee(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="expense-amount">
                    {t("expenseAmountLabel")}
                  </label>
                  <Input
                    id="expense-amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    onBlur={() => setAmount((current) => formatMoneyInput(current))}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="expense-description">
                    {t("expenseDescriptionLabel")}
                  </label>
                  <Input
                    id="expense-description"
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
                  <label className="text-sm font-medium text-foreground" htmlFor="expense-reference">
                    {t("expenseReferenceLabel")}
                  </label>
                  <Input
                    id="expense-reference"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground">{t("paymentNotesLabel")}</label>
                  <AppTextarea value={notes} onChange={(event) => setNotes(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="expense-receipt">
                    {t("receiptLabel")}
                  </label>
                  <Input
                    id="expense-receipt"
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
