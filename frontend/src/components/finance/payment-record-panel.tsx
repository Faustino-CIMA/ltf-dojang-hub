"use client";

import { FormEvent, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppTextarea } from "@/components/ui/list-page-chrome";
import { PopoverSelect } from "@/components/ui/popover-select";
import { SidePanel } from "@/components/ui/side-panel";
import { confirmClubOrderPayment } from "@/lib/club-finance-api";
import { confirmOrderPayment } from "@/lib/ltf-finance-api";

const FORM_ID = "payment-record-form";

type RecordableInvoice = {
  id: number;
  order: number | null;
  invoice_number: string;
};

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

export function PaymentRecordPanel({
  open,
  desk,
  invoice,
  canRecord = true,
  onClose,
  onSaved,
}: {
  open: boolean;
  desk: "club" | "ltf";
  invoice: RecordableInvoice | null;
  canRecord?: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations("LtfFinance");
  const common = useTranslations("Common");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentProvider, setPaymentProvider] = useState("manual");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayDateInputValue);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !invoice) {
      return;
    }
    setErrorMessage(null);
    setPaymentReference(invoice.invoice_number);
    setPaymentDate(todayDateInputValue());
    setPaymentMethod("bank_transfer");
    setPaymentProvider("manual");
    setPaymentNotes("");
  }, [open, invoice]);

  const methodOptions = [
    { value: "bank_transfer", label: t("paymentMethodBankTransfer") },
    { value: "cash", label: t("paymentMethodCash") },
    { value: "card", label: t("paymentMethodCard") },
    { value: "offline", label: t("paymentMethodOffline") },
    { value: "other", label: t("paymentMethodOther") },
  ];
  const providerOptions = [
    { value: "manual", label: t("paymentProviderManual") },
    { value: "stripe", label: t("paymentProviderStripe") },
    { value: "payconiq", label: t("paymentProviderPayconiq") },
    { value: "paypal", label: t("paymentProviderPaypal") },
    { value: "other", label: t("paymentProviderOther") },
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
    if (!canRecord) {
      setErrorMessage(common("paymentFailed"));
      return;
    }
    if (!invoice.order) {
      setErrorMessage(common("paymentMissingOrder"));
      return;
    }
    if (!paymentDate) {
      setErrorMessage(t("paymentDateRequiredError"));
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const payload = {
        payment_method: paymentMethod,
        payment_provider: paymentProvider,
        payment_reference: paymentReference.trim() || invoice.invoice_number,
        payment_notes: paymentNotes.trim() || undefined,
        paid_at: localDateToIso(paymentDate),
      };
      if (desk === "club") {
        await confirmClubOrderPayment(invoice.order, payload);
      } else {
        await confirmOrderPayment(invoice.order, payload);
      }
      await onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setErrorMessage(message.includes("own_invoice_payment") ? t("ownInvoicePayment") : message || common("paymentFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SidePanel
      open={open && Boolean(invoice)}
      wide
      title={t("recordPaymentTitle")}
      closeLabel={common("modalClose")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            {common("deleteCancelButton")}
          </Button>
          <Button type="submit" form={FORM_ID} disabled={isSaving}>
            {isSaving ? t("savingAction") : t("recordPaymentButton")}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        {errorMessage ? <p className="text-sm text-destructive md:col-span-2">{errorMessage}</p> : null}
        <div className="space-y-2">
          <Label htmlFor="payment-date" required>
            {t("paymentDateLabel")}
          </Label>
          <Input
            id="payment-date"
            type="date"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="payment-reference">{t("paymentReferenceLabel")}</Label>
          <Input
            id="payment-reference"
            value={paymentReference}
            onChange={(event) => setPaymentReference(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="payment-method">{t("paymentMethodLabel")}</Label>
          <PopoverSelect
            className="w-full"
            value={paymentMethod}
            onValueChange={handleMethodChange}
            ariaLabel={t("paymentMethodLabel")}
            options={methodOptions}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="payment-provider">{t("paymentProviderLabel")}</Label>
          <PopoverSelect
            className="w-full"
            value={paymentProvider}
            onValueChange={setPaymentProvider}
            ariaLabel={t("paymentProviderLabel")}
            options={providerOptions}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="payment-notes">{t("paymentNotesLabel")}</Label>
          <AppTextarea id="payment-notes" value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} />
        </div>
      </form>
    </SidePanel>
  );
}
