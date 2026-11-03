"use client";

import { Checkbox } from "@/components/ui/checkbox";

export const ONE_INVOICE_ADDRESS_MARK = "Only one address can be used for invoices.";

export type InvoiceFlagRow = { use_for_invoice: boolean };

export function markSingleInvoiceAddress<T extends InvoiceFlagRow>(
  rows: T[],
  index: number,
  checked: boolean,
): T[] {
  if (!checked) {
    return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, use_for_invoice: false } : row));
  }
  return rows.map((row, rowIndex) => ({ ...row, use_for_invoice: rowIndex === index }));
}

export function invoiceAddressSaveMessage(error: unknown, translated: string, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes(ONE_INVOICE_ADDRESS_MARK)) {
    return translated;
  }
  return message || fallback;
}

export function InvoiceAddressMark({
  checked,
  label,
  ariaLabel,
  hint,
  hintId,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  ariaLabel?: string;
  hint?: string;
  hintId?: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-foreground">
      <Checkbox
        className="mt-0.5"
        checked={checked}
        aria-label={ariaLabel || label}
        aria-describedby={hint && hintId ? hintId : undefined}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? (
          <span id={hintId} className="mt-0.5 block text-xs text-muted">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function InvoiceAddressChoices<T extends InvoiceFlagRow>({
  rows,
  hint,
  hintId = "invoice-address-hint",
  labelFor,
  onChange,
}: {
  rows: T[];
  hint: string;
  hintId?: string;
  labelFor: (row: T, index: number) => string;
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="space-y-2">
      <p id={hintId} className="text-sm text-muted">
        {hint}
      </p>
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={index}>
            <InvoiceAddressMark
              checked={row.use_for_invoice}
              label={labelFor(row, index)}
              ariaLabel={labelFor(row, index)}
              onCheckedChange={(checked) => onChange(markSingleInvoiceAddress(rows, index, checked))}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
