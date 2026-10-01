"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { ClubFinanceTabs } from "@/components/club-admin/club-finance-tabs";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppTextarea, FormPanel, ActionNotices } from "@/components/ui/list-page-chrome";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClubIncome, getClubIncomeCategories } from "@/lib/club-finance-api";
import { formatMoneyInput } from "@/lib/money-input";
import { IncomeCategory } from "@/lib/ltf-finance-api";

function todayDateInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function ClubIncomeCreatePage() {
  const t = useTranslations("LtfFinance");
  const locale = useLocale();
  const router = useRouter();
  const { selectedClubId } = useClubSelection();
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [payer, setPayer] = useState("");
  const [amount, setAmount] = useState("");
  const [incomeDate, setIncomeDate] = useState(todayDateInputValue);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedClubId) return;
    getClubIncomeCategories(selectedClubId)
      .then((rows) => {
        setCategories(rows);
        if (rows[0]) setCategoryId(String(rows[0].id));
      })
      .catch((error) => setErrorMessage(error instanceof Error ? error.message : t("incomeLoadError")));
  }, [selectedClubId, t]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClubId || !categoryId) {
      setErrorMessage(t("incomeCategoryRequiredError"));
      return;
    }
    const formattedAmount = formatMoneyInput(amount.trim());
    setAmount(formattedAmount);
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const income = await createClubIncome({
        club: selectedClubId,
        category: Number(categoryId),
        description: description.trim(),
        payer: payer.trim() || undefined,
        amount: formattedAmount,
        income_date: incomeDate,
        payment_method: paymentMethod,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      }, receipt);
      router.push(`/${locale}/dashboard/club/income/${income.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("incomeSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ClubAdminLayout title={t("recordIncomeAction")} subtitle={t("incomeFormSubtitle")}>
      <div className="space-y-6">
        <ClubFinanceTabs />
        <Button asChild variant="outline" className="w-fit">
          <Link href={`/${locale}/dashboard/club/income`}>{t("backToIncome")}</Link>
        </Button>
        <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
        <FormPanel>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="income-date">{t("incomeDateLabel")}</label>
                <Input id="income-date" type="date" value={incomeDate} onChange={(e) => setIncomeDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("incomeCategoryLabel")}</label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="income-payer">{t("incomePayerLabel")}</label>
                <Input id="income-payer" value={payer} onChange={(e) => setPayer(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="income-amount">{t("incomeAmountLabel")}</label>
                <Input
                  id="income-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => setAmount((current) => formatMoneyInput(current))}
                  placeholder="0.00"
                  inputMode="decimal"
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="income-description">{t("incomeDescriptionLabel")}</label>
                <Input id="income-description" value={description} onChange={(e) => setDescription(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("paymentMethodLabel")}</label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">{t("paymentMethodBankTransfer")}</SelectItem>
                    <SelectItem value="cash">{t("paymentMethodCash")}</SelectItem>
                    <SelectItem value="card">{t("paymentMethodCard")}</SelectItem>
                    <SelectItem value="other">{t("paymentMethodOther")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="income-reference">{t("paymentReferenceLabel")}</label>
                <Input id="income-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">{t("paymentNotesLabel")}</label>
                <AppTextarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="income-receipt">{t("receiptLabel")}</label>
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
              {isSaving ? t("savingAction") : t("recordIncomeAction")}
            </Button>
          </form>
        </FormPanel>
      </div>
    </ClubAdminLayout>
  );
}
