"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  issueClubBilling,
  previewHousehold,
  setMemberLicenseFee,
  type FamilyInvoicePreview,
} from "@/lib/clubmgmt-api";

function todayYear() {
  return String(new Date().getFullYear());
}

function rebateLabel(line: FamilyInvoicePreview["lines"][number]) {
  const amount = Number(line.amount_off || 0);
  if (amount > 0) return `${line.amount_off} EUR`;
  const percent = Number(line.percent_off || 0);
  if (percent > 0) return `${line.percent_off}%`;
  return "";
}

export function HouseholdInvoiceView({ householdId }: { householdId: string }) {
  const t = useTranslations("ClubMgmt");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { selectedClubId } = useClubSelection();
  const fromBilling = searchParams.get("from") === "billing";
  const isFamily = householdId.startsWith("family-");
  const [missing, setMissing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [invoiceYear, setInvoiceYear] = useState(() => {
    const raw = searchParams.get("year");
    return raw && /^\d{4}$/.test(raw) ? raw : todayYear();
  });
  const [installment, setInstallment] = useState(() => searchParams.get("installment") || "1");
  const [preview, setPreview] = useState<FamilyInvoicePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<{ id: number; number: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [licenseRevision, setLicenseRevision] = useState(0);

  useEffect(() => {
    if (selectedClubId == null || !/^\d{4}$/.test(invoiceYear)) {
      setPreview(null);
      if (selectedClubId == null) {
        return;
      }
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setMissing(false);
    setPreviewError(null);
    void previewHousehold(selectedClubId, householdId, Number(invoiceYear), Number(installment) || 1)
      .then((next) => {
        if (!cancelled) setPreview(next);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPreview(null);
        const message = error instanceof Error ? error.message : t("saveError");
        if (message === "Household not found.") {
          setMissing(true);
        } else {
          setPreviewError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId, installment, invoiceYear, licenseRevision, selectedClubId, t]);

  const backHref = fromBilling
    ? `/${locale}/dashboard/club/billing?year=${encodeURIComponent(invoiceYear)}&installment=${encodeURIComponent(installment)}`
    : isFamily
      ? `/${locale}/dashboard/club/families`
      : `/${locale}/dashboard/club/billing`;
  const backLabel = fromBilling || !isFamily ? t("billingBack") : t("familyInvoiceBack");
  const addressed =
    preview?.kind === "member"
      ? t("householdOneInvoice", { name: preview.payer_name })
      : t("familyOneInvoice", { name: preview?.payer_name || "" });

  return (
    <ClubAdminLayout title={preview?.name || t("familyInvoicePreview")} subtitle={t("familyInvoiceHint")}>
      <div className="space-y-6">
        <Button variant="outline" asChild>
          <Link href={backHref}>{backLabel}</Link>
        </Button>
        <ActionNotices
          error={errorMessage}
          success={successMessage}
          onDismiss={() => {
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
        />
        {selectedClubId == null || (isLoading && !preview) ? (
          <EmptyState title={t("familyInvoiceLoadingTitle")} description={t("householdInvoiceLoadingSubtitle")} loading />
        ) : missing ? (
          <EmptyState title={t("householdInvoiceMissing")} />
        ) : (
          <FormPanel>
            <div className="flex max-w-xs flex-col gap-2">
              <Label htmlFor="invoice-year">{t("familyInvoiceYear")}</Label>
              <Input
                id="invoice-year"
                value={invoiceYear}
                onChange={(event) => {
                  setInvoiceYear(event.target.value.replace(/\D/g, "").slice(0, 4));
                  setInstallment("1");
                  setCreatedInvoice(null);
                }}
                inputMode="numeric"
              />
            </div>
            {(preview?.billings?.length ?? 0) > 1 ? (
              <div className="mt-4 flex max-w-sm flex-col gap-2">
                <Label>{t("billingInstallment")}</Label>
                <Select
                  value={installment}
                  onValueChange={(value) => {
                    setInstallment(value);
                    setCreatedInvoice(null);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {preview?.billings?.map((row) => (
                      <SelectItem key={row.id} value={String(row.sequence)}>
                        {row.label || t("billingInstallmentNumber", { sequence: row.sequence })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {previewError ? <p className="mt-4 text-sm text-muted">{previewError}</p> : null}
            {!preview && !previewError ? (
              <div className="mt-4">
                <EmptyState title={t("familyInvoiceLoadingTitle")} description={t("householdInvoiceLoadingSubtitle")} loading />
              </div>
            ) : null}

            {preview ? (
              <div className="mt-4 space-y-4">
                <p className="text-sm">
                  {preview.needs_recipient ? t("chooseBillRecipient") : addressed}
                </p>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <p>
                    <span className="block text-muted">{t("familyInvoiceFee")}</span>
                    {preview.fee_name}
                    {preview.unit_amount ? ` · ${preview.unit_amount} EUR` : ""}
                  </p>
                  <p>
                    <span className="block text-muted">{t("familyInvoicePayer")}</span>
                    {preview.payer_name || t("chooseBillRecipient")}
                  </p>
                </div>
                {preview.already_confirmed ? (
                  <p className="rounded-[var(--radius-form)] border border-border bg-secondary/50 px-3 py-2 text-sm">
                    {t("billingAlreadyConfirmed", { year: preview.year })}
                  </p>
                ) : null}
                {preview.already_invoiced ? (
                  <p className="rounded-[var(--radius-form)] border border-border bg-secondary/50 px-3 py-2 text-sm">
                    {(preview.billings?.length ?? 0) > 1
                      ? t("householdInvoiceAlreadyBilling", {
                          year: preview.year,
                          billing:
                            preview.billings?.find((row) => row.sequence === preview.installment)?.label ||
                            t("billingInstallmentNumber", { sequence: preview.installment ?? 1 }),
                        })
                      : t("householdInvoiceAlready", { year: preview.year })}
                  </p>
                ) : null}
                {!preview.already_invoiced && !preview.already_confirmed && Number(preview.total) <= 0 ? (
                  <p className="rounded-[var(--radius-form)] border border-border bg-secondary/50 px-3 py-2 text-sm">
                    {t("billingZeroTotalNote")}
                  </p>
                ) : null}
                <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-secondary/70 text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-3 py-2">{t("familyInvoiceRank")}</th>
                        <th className="px-3 py-2">{t("addMember")}</th>
                        <th className="px-3 py-2">{t("familyInvoiceRebate")}</th>
                        <th className="px-3 py-2">{t("familyInvoiceAmount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.lines.map((line, index) => (
                        <tr key={`${line.member_id}-${index}`} className="border-t border-border">
                          <td className="px-3 py-2">{line.supplementary ? "—" : line.rank}</td>
                          <td className="px-3 py-2">
                            {line.member_name}
                            {line.supplementary ? ` · ${line.fee_name || t("licenseFeeTitle")}` : ""}
                            {!line.supplementary &&
                            line.pays_license_fee !== undefined &&
                            Number(preview.license_fee?.amount || 0) > 0 ? (
                              <label className="mt-1 flex items-center gap-2 text-xs text-muted">
                                <Checkbox
                                  checked={line.pays_license_fee !== false}
                                  disabled={preview.already_invoiced || Boolean(preview.already_confirmed) || selectedClubId == null}
                                  onCheckedChange={(value) => {
                                    if (selectedClubId == null) return;
                                    void setMemberLicenseFee(selectedClubId, line.member_id, value === true)
                                      .then(() => setLicenseRevision((current) => current + 1))
                                      .catch((error: unknown) => {
                                        setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                                      });
                                  }}
                                />
                                {t("paysLicenseFee")}
                              </label>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            {rebateLabel(line)}
                            {line.rebate_carried ? (
                              <span className="mt-0.5 block text-xs text-muted">{t("rebateCarried")}</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">{line.amount} EUR</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm font-semibold sm:text-right">
                  {t("familyInvoiceTotal")}: {preview.total} EUR
                </p>
                {createdInvoice ? (
                  <Link
                    className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                    href={`/${locale}/dashboard/club/invoices/${createdInvoice.id}`}
                  >
                    {t("familyInvoiceOpen", { number: createdInvoice.number })}
                  </Link>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    className="w-full sm:w-auto"
                    disabled={
                      isSaving ||
                      preview.already_invoiced ||
                      Boolean(preview.already_confirmed) ||
                      preview.needs_recipient ||
                      selectedClubId == null
                    }
                    onClick={async () => {
                      if (selectedClubId == null) return;
                      setIsSaving(true);
                      setErrorMessage(null);
                      try {
                        const result = await issueClubBilling(
                          selectedClubId,
                          preview.year,
                          [householdId],
                          preview.installment ?? (Number(installment) || 1),
                        );
                        const created = result.created[0];
                        if (created) {
                          setCreatedInvoice({ id: created.invoice_id, number: created.invoice_number });
                          setSuccessMessage(
                            Number(created.total) <= 0
                              ? t("billingZeroPaid", { number: created.invoice_number })
                              : t("invoiceCreated", { number: created.invoice_number, total: created.total }),
                          );
                          setPreview({ ...preview, already_invoiced: true });
                        } else {
                          setErrorMessage(result.skipped[0]?.reason || t("saveError"));
                        }
                      } catch (error) {
                        setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                  >
                    {t("familyInvoiceConfirm")}
                  </Button>
                )}
              </div>
            ) : null}
          </FormPanel>
        )}
      </div>
    </ClubAdminLayout>
  );
}
