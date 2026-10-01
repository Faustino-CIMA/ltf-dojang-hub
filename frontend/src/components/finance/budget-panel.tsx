"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormPanel } from "@/components/ui/list-page-chrome";
import { formatMoneyInput } from "@/lib/money-input";
import { FinanceBudgetLine, FinanceBudgetResponse } from "@/lib/ltf-finance-api";

function moneyLabel(amount: string, currency: string) {
  return `${amount} ${currency}`;
}

export function BudgetPanel({
  budget,
  currency,
  canEdit,
  isSaving,
  onSave,
}: {
  budget: FinanceBudgetResponse;
  currency: string;
  canEdit: boolean;
  isSaving: boolean;
  onSave: (lines: Array<{ kind: string; category?: number | null; amount: string }>) => Promise<void>;
}) {
  const t = useTranslations("LtfFinance");
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(budget.lines.map((line) => [lineKey(line), line.budget]))
  );

  const rows = useMemo(() => budget.lines, [budget.lines]);

  useEffect(() => {
    setAmounts(Object.fromEntries(budget.lines.map((line) => [lineKey(line), line.budget])));
  }, [budget]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave(
      rows.map((line) => ({
        kind: line.kind,
        category: line.category,
        amount: formatMoneyInput(amounts[lineKey(line)] ?? line.budget),
      }))
    );
  };

  return (
    <FormPanel>
      <h2 className="text-section text-foreground">{t("budgetTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("budgetSubtitle")}</p>
      <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-secondary/70 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">{t("incomeCategoryLabel")}</th>
                <th className="px-3 py-2">{t("budgetAmountLabel")}</th>
                <th className="px-3 py-2">{t("budgetActualLabel")}</th>
                <th className="px-3 py-2">{t("budgetVarianceLabel")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((line) => (
                <tr key={lineKey(line)} className="border-t border-border">
                  <td className="px-3 py-2">
                    <span className="font-medium">{line.category_name}</span>
                    <span className="ml-2 text-xs text-muted">{kindLabel(line.kind, t)}</span>
                  </td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <Input
                        value={amounts[lineKey(line)] ?? line.budget}
                        onChange={(event) =>
                          setAmounts((current) => ({ ...current, [lineKey(line)]: event.target.value }))
                        }
                        onBlur={() =>
                          setAmounts((current) => ({
                            ...current,
                            [lineKey(line)]: formatMoneyInput(current[lineKey(line)] ?? ""),
                          }))
                        }
                        inputMode="decimal"
                        className="w-28"
                      />
                    ) : (
                      moneyLabel(line.budget, currency)
                    )}
                  </td>
                  <td className="px-3 py-2">{moneyLabel(line.actual, currency)}</td>
                  <td className="px-3 py-2">{moneyLabel(line.variance, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="grid gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-muted">{t("budgetSurplusLabel")}</dt>
            <dd className="font-medium">{moneyLabel(budget.totals.budget_surplus, currency)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t("actualSurplusLabel")}</dt>
            <dd className="font-medium">{moneyLabel(budget.totals.actual_surplus, currency)}</dd>
          </div>
        </dl>
        {canEdit ? (
          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? t("savingAction") : t("saveBudgetAction")}
          </Button>
        ) : null}
      </form>
    </FormPanel>
  );
}

function lineKey(line: FinanceBudgetLine) {
  return `${line.kind}-${line.category ?? "fees"}`;
}

function kindLabel(kind: FinanceBudgetLine["kind"], t: ReturnType<typeof useTranslations>) {
  if (kind === "expense") return t("navExpenses");
  if (kind === "income") return t("navIncome");
  return t("licenseFeeIncomeLabel");
}
