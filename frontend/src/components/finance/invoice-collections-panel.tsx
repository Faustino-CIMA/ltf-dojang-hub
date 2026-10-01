"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormPanel, ActionNotices } from "@/components/ui/list-page-chrome";
import { formatDisplayDateTime } from "@/lib/date-display";
import { formatMoneyInput } from "@/lib/money-input";
import { FinanceInvoice } from "@/lib/ltf-finance-api";

export function InvoiceCollectionsPanel({
  invoice,
  canMutate,
  onUpdated,
  onCredit,
  onRemind,
}: {
  invoice: FinanceInvoice;
  canMutate: boolean;
  onUpdated: (invoice: FinanceInvoice) => void;
  onCredit: (input: { amount: string; reason: string }) => Promise<FinanceInvoice>;
  onRemind: () => Promise<FinanceInvoice>;
}) {
  const t = useTranslations("LtfFinance");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isReminding, setIsReminding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const notes = invoice.credit_notes ?? [];
  const outstanding = Number(invoice.outstanding ?? invoice.total);
  const canCredit = canMutate && invoice.status !== "paid" && invoice.status !== "void" && outstanding > 0;

  const handleCredit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formatted = formatMoneyInput(amount.trim());
    if (!formatted || !reason.trim()) {
      setErrorMessage(t("creditNoteRequiredError"));
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const updated = await onCredit({ amount: formatted, reason: reason.trim() });
      onUpdated(updated);
      setAmount("");
      setReason("");
      setSuccessMessage(t("creditNoteSavedMessage"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("creditNoteSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemind = async () => {
    setIsReminding(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      onUpdated(await onRemind());
      setSuccessMessage(t("reminderSentMessage"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("reminderSaveError"));
    } finally {
      setIsReminding(false);
    }
  };

  return (
    <section className="space-y-4">
      <ActionNotices
        error={errorMessage}
        success={successMessage}
        onDismiss={() => {
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-section text-foreground">{t("creditNotesTitle")}</h2>
        {canMutate && invoice.status === "issued" && outstanding > 0 ? (
          <Button type="button" variant="outline" onClick={() => void handleRemind()} disabled={isReminding}>
            {isReminding ? t("savingAction") : t("sendReminderAction")}
          </Button>
        ) : null}
      </div>
      {invoice.last_reminded_at ? (
        <p className="text-xs text-muted">
          {t("lastRemindedAtLabel")}: {formatDisplayDateTime(invoice.last_reminded_at)}
        </p>
      ) : null}
      {notes.length === 0 ? (
        <EmptyState title={t("creditNotesEmptyTitle")} description={t("creditNotesEmptySubtitle")} />
      ) : (
        <EntityTable
          columns={[
            { key: "credit_number", header: t("creditNoteNumberLabel") },
            { key: "amount", header: t("expenseAmountLabel") },
            { key: "reason", header: t("creditNoteReasonLabel") },
            {
              key: "created_at",
              header: t("issuedAtLabel"),
              render: (row: { created_at: string }) => formatDisplayDateTime(row.created_at),
            },
          ]}
          rows={notes}
        />
      )}
      {canCredit ? (
        <FormPanel>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCredit}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="credit-amount">
                {t("creditNoteAmountLabel")}
              </label>
              <Input
                id="credit-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                onBlur={() => setAmount((current) => formatMoneyInput(current))}
                placeholder="0.00"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="credit-reason">
                {t("creditNoteReasonLabel")}
              </label>
              <Input id="credit-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? t("savingAction") : t("addCreditNoteAction")}
              </Button>
            </div>
          </form>
        </FormPanel>
      ) : null}
    </section>
  );
}
