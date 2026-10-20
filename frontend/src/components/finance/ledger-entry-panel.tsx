"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppTextarea } from "@/components/ui/list-page-chrome";
import { PopoverSelect } from "@/components/ui/popover-select";
import { SidePanel } from "@/components/ui/side-panel";
import {
  createClubExpense,
  createClubIncome,
  getClubExpense,
  getClubExpenseCategories,
  getClubIncome,
  getClubIncomeCategories,
  updateClubExpense,
  updateClubIncome,
  voidClubExpense,
  voidClubIncome,
} from "@/lib/club-finance-api";
import { formatMoneyInput } from "@/lib/money-input";
import {
  Club,
  ExpenseCategory,
  FinanceExpense,
  FinanceIncome,
  IncomeCategory,
  createFinanceExpense,
  createFinanceIncome,
  getFinanceClubs,
  getFinanceExpense,
  getFinanceIncome,
  getExpenseCategories,
  getIncomeCategories,
  updateFinanceExpense,
  updateFinanceIncome,
  voidFinanceExpense,
  voidFinanceIncome,
} from "@/lib/ltf-finance-api";

const FORM_ID = "ledger-entry-form";

const PAYMENT_METHODS = ["bank_transfer", "cash", "card", "offline", "other"] as const;

type LedgerKind = "income" | "expense";
type LedgerDesk = "club" | "ltf";

function todayDateInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function methodLabelKey(method: string) {
  switch (method) {
    case "cash":
      return "paymentMethodCash";
    case "card":
      return "paymentMethodCard";
    case "offline":
      return "paymentMethodOffline";
    case "other":
      return "paymentMethodOther";
    default:
      return "paymentMethodBankTransfer";
  }
}

export function LedgerEntryPanel({
  open,
  kind,
  desk,
  mode,
  entryId,
  clubId,
  onClose,
  onSaved,
}: {
  open: boolean;
  kind: LedgerKind;
  desk: LedgerDesk;
  mode: "create" | "edit";
  entryId?: number | null;
  clubId?: number | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations("LtfFinance");
  const common = useTranslations("Common");
  const [categories, setCategories] = useState<Array<IncomeCategory | ExpenseCategory>>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [status, setStatus] = useState<string>("");
  const [categoryId, setCategoryId] = useState("");
  const [linkedClubId, setLinkedClubId] = useState("none");
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(todayDateInputValue);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [markPaid, setMarkPaid] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isIncome = kind === "income";
  const locked = status === "void" || (desk === "club" && kind === "expense" && status === "paid");
  const amountLocked = locked || status === "paid";

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setErrorMessage(null);
    setReceipt(null);
    setMarkPaid(false);
    setStatus("");
    const load = async () => {
      try {
        if (mode === "create") {
          const categoryRows =
            desk === "club"
              ? isIncome
                ? await getClubIncomeCategories(clubId ?? null)
                : await getClubExpenseCategories(clubId ?? null)
              : isIncome
                ? await getIncomeCategories({ activeOnly: true })
                : await getExpenseCategories({ activeOnly: true });
          const clubRows = desk === "ltf" ? await getFinanceClubs() : [];
          if (cancelled) {
            return;
          }
          setCategories(categoryRows);
          setClubs(clubRows);
          setCategoryId(categoryRows[0] ? String(categoryRows[0].id) : "");
          setLinkedClubId("none");
          setDescription("");
          setCounterparty("");
          setAmount("");
          setEntryDate(todayDateInputValue());
          setPaymentMethod("bank_transfer");
          setReference("");
          setNotes("");
          return;
        }
        if (!entryId) {
          return;
        }
        if (isIncome) {
          const income = desk === "club" ? await getClubIncome(entryId) : await getFinanceIncome(entryId);
          const categoryRows =
            desk === "club"
              ? await getClubIncomeCategories(income.club)
              : await getIncomeCategories({ activeOnly: true });
          const clubRows = desk === "ltf" ? await getFinanceClubs() : [];
          if (cancelled) {
            return;
          }
          applyIncome(income, categoryRows, clubRows);
          return;
        }
        const expense = desk === "club" ? await getClubExpense(entryId) : await getFinanceExpense(entryId);
        const categoryRows =
          desk === "club"
            ? await getClubExpenseCategories(expense.club)
            : await getExpenseCategories({ activeOnly: true });
        const clubRows = desk === "ltf" ? await getFinanceClubs() : [];
        if (cancelled) {
          return;
        }
        applyExpense(expense, categoryRows, clubRows);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : t(isIncome ? "incomeLoadError" : "expensesLoadError"));
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, mode, entryId, desk, kind, clubId, isIncome, t]);

  const applyIncome = (income: FinanceIncome, categoryRows: IncomeCategory[], clubRows: Club[]) => {
    setCategories(categoryRows);
    setClubs(clubRows);
    setStatus(income.status);
    setCategoryId(String(income.category));
    setLinkedClubId(income.club ? String(income.club) : "none");
    setDescription(income.description);
    setCounterparty(income.payer);
    setAmount(income.amount);
    setEntryDate(income.income_date);
    setPaymentMethod(income.payment_method || "bank_transfer");
    setReference(income.reference);
    setNotes(income.notes);
  };

  const applyExpense = (expense: FinanceExpense, categoryRows: ExpenseCategory[], clubRows: Club[]) => {
    setCategories(categoryRows);
    setClubs(clubRows);
    setStatus(expense.status);
    setCategoryId(String(expense.category));
    setLinkedClubId(expense.club ? String(expense.club) : "none");
    setDescription(expense.description);
    setCounterparty(expense.payee);
    setAmount(expense.amount);
    setEntryDate(expense.expense_date);
    setPaymentMethod(expense.payment_method || "bank_transfer");
    setReference(expense.reference);
    setNotes(expense.notes);
  };

  const methodOptions = useMemo(
    () => PAYMENT_METHODS.map((method) => ({ value: method, label: t(methodLabelKey(method)) })),
    [t],
  );

  const title =
    mode === "edit"
      ? isIncome
        ? t("incomeDetailTitle")
        : t("expenseDetailTitle")
      : isIncome
        ? t("recordIncomeAction")
        : t("recordExpenseAction");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked) {
      return;
    }
    if (!categoryId) {
      setErrorMessage(t(isIncome ? "incomeCategoryRequiredError" : "expenseCategoryRequiredError"));
      return;
    }
    if (!description.trim()) {
      setErrorMessage(t(isIncome ? "incomeDescriptionRequiredError" : "expenseDescriptionRequiredError"));
      return;
    }
    if (!amount.trim()) {
      setErrorMessage(t(isIncome ? "incomeAmountRequiredError" : "expenseAmountRequiredError"));
      return;
    }
    if (desk === "club" && mode === "create" && !clubId) {
      setErrorMessage(t(isIncome ? "incomeSaveError" : "expenseSaveError"));
      return;
    }
    const formattedAmount = formatMoneyInput(amount.trim());
    setAmount(formattedAmount);
    setIsSaving(true);
    setErrorMessage(null);
    try {
      if (isIncome) {
        const payload = {
          category: Number(categoryId),
          description: description.trim(),
          payer: counterparty.trim(),
          amount: formattedAmount,
          income_date: entryDate,
          payment_method: paymentMethod,
          reference: reference.trim(),
          notes: notes.trim(),
        };
        if (mode === "edit" && entryId) {
          if (desk === "club") {
            await updateClubIncome(entryId, payload, receipt);
          } else {
            await updateFinanceIncome(entryId, {
              ...payload,
              payer: counterparty.trim(),
              club: linkedClubId === "none" ? null : Number(linkedClubId),
            });
          }
        } else if (desk === "club" && clubId) {
          await createClubIncome(
            {
              ...payload,
              club: clubId,
              payer: counterparty.trim() || undefined,
              reference: reference.trim() || undefined,
              notes: notes.trim() || undefined,
            },
            receipt,
          );
        } else {
          await createFinanceIncome({
            ...payload,
            club: linkedClubId === "none" ? null : Number(linkedClubId),
            payer: counterparty.trim() || undefined,
            reference: reference.trim() || undefined,
            notes: notes.trim() || undefined,
          });
        }
      } else {
        const payload = {
          category: Number(categoryId),
          description: description.trim(),
          payee: counterparty.trim(),
          amount: formattedAmount,
          expense_date: entryDate,
          payment_method: mode === "create" ? (markPaid ? paymentMethod : undefined) : paymentMethod,
          reference: reference.trim(),
          notes: notes.trim(),
        };
        if (mode === "edit" && entryId) {
          if (desk === "club") {
            await updateClubExpense(entryId, payload, receipt);
          } else {
            await updateFinanceExpense(entryId, {
              ...payload,
              payment_method: paymentMethod,
              club: linkedClubId === "none" ? null : Number(linkedClubId),
            });
          }
        } else if (desk === "club" && clubId) {
          await createClubExpense(
            {
              ...payload,
              club: clubId,
              payee: counterparty.trim() || undefined,
              reference: reference.trim() || undefined,
              notes: notes.trim() || undefined,
              mark_paid: markPaid,
            },
            receipt,
          );
        } else {
          await createFinanceExpense({
            category: Number(categoryId),
            club: linkedClubId === "none" ? null : Number(linkedClubId),
            description: description.trim(),
            payee: counterparty.trim() || undefined,
            amount: formattedAmount,
            expense_date: entryDate,
            payment_method: markPaid ? paymentMethod : undefined,
            reference: reference.trim() || undefined,
            notes: notes.trim() || undefined,
            mark_paid: markPaid,
          });
        }
      }
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t(isIncome ? "incomeSaveError" : "expenseSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleVoid = async () => {
    if (!entryId || status === "void") {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      if (isIncome) {
        if (desk === "club") {
          await voidClubIncome(entryId);
        } else {
          await voidFinanceIncome(entryId);
        }
      } else if (desk === "club") {
        await voidClubExpense(entryId);
      } else {
        await voidFinanceExpense(entryId);
      }
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t(isIncome ? "incomeSaveError" : "expenseSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SidePanel
      open={open}
      wide
      title={title}
      description={isIncome ? t("incomeFormSubtitle") : desk === "club" ? t("clubExpenseFormSubtitle") : t("expenseFormSubtitle")}
      closeLabel={common("modalClose")}
      onClose={onClose}
      footer={
        <>
          {mode === "edit" && status !== "void" ? (
            <Button type="button" variant="outline" onClick={() => void handleVoid()} disabled={isSaving}>
              {isIncome ? t("voidIncomeAction") : t("voidExpenseAction")}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            {common("deleteCancelButton")}
          </Button>
          <Button type="submit" form={FORM_ID} disabled={isSaving || locked}>
            {isSaving ? t("savingAction") : mode === "edit" ? t("saveChanges") : title}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        {errorMessage ? <p className="text-sm text-destructive md:col-span-2">{errorMessage}</p> : null}
        <div className="space-y-2">
          <Label htmlFor="ledger-date" required>
            {isIncome ? t("incomeDateLabel") : t("expenseDateLabel")}
          </Label>
          <Input
            id="ledger-date"
            type="date"
            value={entryDate}
            disabled={locked}
            onChange={(event) => setEntryDate(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ledger-category" required>
            {isIncome ? t("incomeCategoryLabel") : t("expenseCategoryLabel")}
          </Label>
          <PopoverSelect
            className="w-full"
            value={categoryId}
            onValueChange={setCategoryId}
            ariaLabel={isIncome ? t("incomeCategoryLabel") : t("expenseCategoryLabel")}
            placeholder={isIncome ? t("incomeCategoryLabel") : t("expenseCategoryLabel")}
            disabled={locked}
            options={categories.map((category) => ({ value: String(category.id), label: category.name }))}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="ledger-description" required>
            {isIncome ? t("incomeDescriptionLabel") : t("expenseDescriptionLabel")}
          </Label>
          <Input
            id="ledger-description"
            value={description}
            disabled={locked}
            placeholder={isIncome ? t("incomeDescriptionPlaceholder") : t("expenseDescriptionPlaceholder")}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ledger-party">{isIncome ? t("incomePayerLabel") : t("expensePayeeLabel")}</Label>
          <Input
            id="ledger-party"
            value={counterparty}
            disabled={locked}
            placeholder={isIncome ? t("incomePayerPlaceholder") : t("expensePayeePlaceholder")}
            onChange={(event) => setCounterparty(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ledger-amount" required>
            {isIncome ? t("incomeAmountLabel") : t("expenseAmountLabel")}
          </Label>
          <Input
            id="ledger-amount"
            value={amount}
            disabled={amountLocked}
            placeholder="0.00"
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            onBlur={() => setAmount((current) => formatMoneyInput(current))}
            required
          />
        </div>
        {desk === "ltf" ? (
          <div className="space-y-2">
            <Label htmlFor="ledger-club">{t("clubLabel")}</Label>
            <PopoverSelect
              className="w-full"
              value={linkedClubId}
              onValueChange={setLinkedClubId}
              ariaLabel={t("clubLabel")}
              disabled={locked}
              searchable
              options={[
                { value: "none", label: t("incomeNoClubOption") },
                ...clubs.map((club) => ({ value: String(club.id), label: club.name })),
              ]}
            />
          </div>
        ) : null}
        {isIncome || mode === "edit" || markPaid ? (
          <div className="space-y-2">
            <Label htmlFor="ledger-method">{t("paymentMethodLabel")}</Label>
            <PopoverSelect
              className="w-full"
              value={paymentMethod}
              onValueChange={setPaymentMethod}
              ariaLabel={t("paymentMethodLabel")}
              disabled={locked}
              options={methodOptions}
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="ledger-reference">{isIncome ? t("incomeReferenceLabel") : t("expenseReferenceLabel")}</Label>
          <Input
            id="ledger-reference"
            value={reference}
            disabled={locked}
            onChange={(event) => setReference(event.target.value)}
          />
        </div>
        {!isIncome && mode === "create" ? (
          <label className="flex items-center gap-2 text-sm text-foreground md:col-span-2">
            <Checkbox checked={markPaid} onCheckedChange={(checked) => setMarkPaid(checked === true)} />
            {t("expenseAlreadyPaidLabel")}
          </label>
        ) : null}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="ledger-notes">{t("paymentNotesLabel")}</Label>
          <AppTextarea id="ledger-notes" value={notes} disabled={locked} onChange={(event) => setNotes(event.target.value)} />
        </div>
        {desk === "club" ? (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ledger-receipt">{t("receiptLabel")}</Label>
            <Input
              id="ledger-receipt"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              disabled={locked}
              onChange={(event) => setReceipt(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted">{t("receiptHint")}</p>
          </div>
        ) : null}
      </form>
    </SidePanel>
  );
}
