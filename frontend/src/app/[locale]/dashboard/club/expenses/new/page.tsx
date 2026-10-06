"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { ClubFinanceTabs } from "@/components/club-admin/club-finance-tabs";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AppTextarea, FormPanel, ActionNotices } from "@/components/ui/list-page-chrome";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClubExpense, getClubExpenseCategories } from "@/lib/club-finance-api";
import { formatMoneyInput } from "@/lib/money-input";
import { ExpenseCategory } from "@/lib/ltf-finance-api";

function todayDateInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function ClubExpenseCreatePage() {
  const t = useTranslations("LtfFinance");
  const common = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const { selectedClubId } = useClubSelection();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayDateInputValue);
  const [markPaid, setMarkPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedClubId) {
      return;
    }
    getClubExpenseCategories(selectedClubId)
      .then((rows) => {
        setCategories(rows);
        if (rows[0]) {
          setCategoryId(String(rows[0].id));
        }
      })
      .catch((error) => setErrorMessage(error instanceof Error ? error.message : t("expensesLoadError")));
  }, [selectedClubId, t]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClubId || !categoryId) {
      setErrorMessage(t("expenseCategoryRequiredError"));
      return;
    }
    if (!description.trim()) {
      setErrorMessage(t("expenseDescriptionRequiredError"));
      return;
    }
    if (!amount.trim()) {
      setErrorMessage(t("expenseAmountRequiredError"));
      return;
    }
    const formattedAmount = formatMoneyInput(amount.trim());
    setAmount(formattedAmount);
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const expense = await createClubExpense({
        club: selectedClubId,
        category: Number(categoryId),
        description: description.trim(),
        payee: payee.trim() || undefined,
        amount: formattedAmount,
        expense_date: expenseDate,
        payment_method: markPaid ? paymentMethod : undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        mark_paid: markPaid,
      }, receipt);
      router.push(`/${locale}/dashboard/club/expenses/${expense.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("expenseSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ClubAdminLayout title={t("recordExpenseAction")} subtitle={t("clubExpenseFormSubtitle")}>
      <div className="space-y-6">
        <ClubFinanceTabs />
        <Button asChild variant="outline" className="w-fit">
          <Link href={`/${locale}/dashboard/club/expenses`}>{t("backToExpenses")}</Link>
        </Button>
        <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
        <FormPanel>
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
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{t("expenseCategoryLabel")}</label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("expenseCategoryLabel")} />
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
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground" htmlFor="expense-description">
                  {t("expenseDescriptionLabel")}
                </label>
                <Input
                  id="expense-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("expenseDescriptionPlaceholder")}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="expense-payee">
                  {t("expensePayeeLabel")}
                </label>
                <Input
                  id="expense-payee"
                  value={payee}
                  onChange={(event) => setPayee(event.target.value)}
                  placeholder={t("expensePayeePlaceholder")}
                />
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
                  required
                />
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
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={markPaid} onCheckedChange={(checked) => setMarkPaid(checked === true)} />
              {t("expenseAlreadyPaidLabel")}
            </label>

            {markPaid ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{t("paymentMethodLabel")}</label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">{t("paymentMethodBankTransfer")}</SelectItem>
                    <SelectItem value="card">{t("paymentMethodCard")}</SelectItem>
                    <SelectItem value="cash">{t("paymentMethodCash")}</SelectItem>
                    <SelectItem value="offline">{t("paymentMethodOffline")}</SelectItem>
                    <SelectItem value="other">{t("paymentMethodOther")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="expense-notes">
                {t("paymentNotesLabel")}
              </label>
              <AppTextarea id="expense-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
            <div className="space-y-2">
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

            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? t("savingAction") : t("recordExpenseAction")}
              </Button>
              <Button asChild type="button" variant="outline">
                <Link href={`/${locale}/dashboard/club/expenses`}>{common("deleteCancelButton")}</Link>
              </Button>
            </div>
          </form>
        </FormPanel>
      </div>
    </ClubAdminLayout>
  );
}
