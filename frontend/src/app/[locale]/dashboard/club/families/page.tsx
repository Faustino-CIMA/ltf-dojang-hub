"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Receipt, Trash2 } from "lucide-react";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { getMembers } from "@/lib/club-admin-api";
import { downloadClubStatement } from "@/lib/club-finance-api";
import {
  FamilyInvoicePreview,
  addFamilyMember,
  createFamily,
  createFamilyInvoice,
  listFamilies,
  previewFamilyInvoice,
  removeFamilyMember,
} from "@/lib/clubmgmt-api";

type FamilyRow = {
  id: number;
  name: string;
  invoice_member: number | null;
  memberships: Array<{ member: number; member_name: string; sort_order: number }>;
};

type ClubMember = { id: number; first_name: string; last_name: string };

function todayYear() {
  return String(new Date().getFullYear());
}

export default function ClubFamiliesPage() {
  const t = useTranslations("ClubMgmt");
  const locale = useLocale();
  const { selectedClubId } = useClubSelection();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [families, setFamilies] = useState<FamilyRow[]>([]);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [invoiceFamily, setInvoiceFamily] = useState<FamilyRow | null>(null);
  const [invoiceYear, setInvoiceYear] = useState(todayYear);
  const [preview, setPreview] = useState<FamilyInvoicePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<{ id: number; number: string } | null>(null);

  const load = useCallback(async () => {
    if (selectedClubId == null) {
      return;
    }
    setErrorMessage(null);
    try {
      const [nextFamilies, list] = await Promise.all([listFamilies(selectedClubId), getMembers()]);
      setFamilies(nextFamilies);
      setMembers(list.map((row) => ({ id: row.id, first_name: row.first_name, last_name: row.last_name })));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    }
  }, [selectedClubId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadPreview = useCallback(
    async (familyId: number, year: string) => {
      if (!/^\d{4}$/.test(year)) {
        setPreview(null);
        return;
      }
      setPreviewError(null);
      try {
        const next = await previewFamilyInvoice(familyId, Number(year));
        setPreview(next);
      } catch (error) {
        setPreview(null);
        const message = error instanceof Error ? error.message : t("saveError");
        setPreviewError(message);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!invoiceFamily) {
      return;
    }
    void loadPreview(invoiceFamily.id, invoiceYear);
  }, [invoiceFamily, invoiceYear, loadPreview]);

  const membersInFamilies = useMemo(() => {
    const used = new Set<number>();
    for (const family of families) {
      for (const row of family.memberships) {
        used.add(row.member);
      }
    }
    return used;
  }, [families]);

  const openInvoice = (family: FamilyRow) => {
    if (family.memberships.length === 0) {
      setErrorMessage(t("familyInvoiceNoMembers"));
      return;
    }
    setCreatedInvoice(null);
    setPreview(null);
    setPreviewError(null);
    setInvoiceYear(todayYear());
    setInvoiceFamily(family);
  };

  return (
    <ClubAdminLayout title={t("familiesTitle")} subtitle={t("familiesBillingHint")}>
      <div className="space-y-6">
      <ActionNotices
        error={errorMessage}
        success={successMessage}
        onDismiss={() => {
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
      />

      <FormPanel>
        <h2 className="text-section text-foreground">{t("createFamily")}</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1 space-y-2">
            <Label htmlFor="family-name">{t("familyName")}</Label>
            <Input
              id="family-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("familyName")}
            />
          </div>
          <Button
            type="button"
            variant="primary"
            disabled={isSaving}
            onClick={async () => {
              if (selectedClubId == null) {
                return;
              }
              if (!name.trim()) {
                setErrorMessage(t("familyNeedName"));
                return;
              }
              setIsSaving(true);
              try {
                await createFamily({ club: selectedClubId, name: name.trim() });
                setName("");
                setSuccessMessage(t("saved"));
                await load();
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : t("saveError"));
              } finally {
                setIsSaving(false);
              }
            }}
          >
            {t("createFamily")}
          </Button>
        </div>
      </FormPanel>

      {families.length === 0 ? (
        <EmptyState title={t("familiesEmptyTitle")} description={t("familiesEmptySubtitle")} />
      ) : (
        <div className="space-y-4">
          {families.map((family) => {
            const availableMembers = members.filter((member) => !membersInFamilies.has(member.id));
            return (
              <FormPanel key={family.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-section text-foreground">{family.name}</h2>
                    <p className="mt-1 text-sm text-muted">{t("familyInvoiceHint")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving || selectedClubId == null}
                      onClick={async () => {
                        if (selectedClubId == null) {
                          return;
                        }
                        setErrorMessage(null);
                        try {
                          await downloadClubStatement({
                            clubId: selectedClubId,
                            year: Number(todayYear()),
                            familyId: family.id,
                          });
                        } catch (error) {
                          setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                        }
                      }}
                    >
                      {t("downloadStatementAction")}
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={isSaving || family.memberships.length === 0}
                      onClick={() => openInvoice(family)}
                    >
                      <Receipt className="h-4 w-4" />
                      {t("createInvoice")}
                    </Button>
                  </div>
                </div>

                {family.memberships.length === 0 ? (
                  <p className="mt-4 text-sm text-muted">{t("noMembers")}</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {family.memberships.map((row, index) => (
                      <li
                        key={row.member}
                        className="flex items-center justify-between gap-3 rounded-[var(--radius-form)] border border-border bg-secondary/40 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <StatusBadge label={String(index + 1)} tone={index === 0 ? "info" : "neutral"} />
                          <span className="truncate font-medium text-foreground">{row.member_name}</span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={isSaving}
                          aria-label={t("familyRemoveMember", { name: row.member_name })}
                          onClick={async () => {
                            setIsSaving(true);
                            try {
                              await removeFamilyMember(family.id, row.member);
                              setSuccessMessage(t("familyMemberRemoved", { name: row.member_name }));
                              await load();
                            } catch (error) {
                              setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                            } finally {
                              setIsSaving(false);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-4">
                  <Label htmlFor={`add-member-${family.id}`}>{t("addMember")}</Label>
                  <select
                    id={`add-member-${family.id}`}
                    className="mt-2 h-[var(--control-height)] w-full max-w-sm rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 text-sm"
                    value=""
                    disabled={isSaving || availableMembers.length === 0}
                    onChange={async (event) => {
                      const id = Number(event.target.value);
                      if (!id) {
                        return;
                      }
                      setIsSaving(true);
                      try {
                        await addFamilyMember(family.id, id);
                        await load();
                      } catch (error) {
                        setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                  >
                    <option value="">{t("addMember")}</option>
                    {availableMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.first_name} {member.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              </FormPanel>
            );
          })}
        </div>
      )}
      </div>

      <Modal
        isOpen={invoiceFamily !== null}
        onClose={() => {
          setInvoiceFamily(null);
          setCreatedInvoice(null);
          setPreview(null);
        }}
        title={t("familyInvoicePreview")}
        description={invoiceFamily ? invoiceFamily.name : undefined}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invoice-year">{t("familyInvoiceYear")}</Label>
            <Input
              id="invoice-year"
              value={invoiceYear}
              onChange={(event) => setInvoiceYear(event.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
            />
          </div>

          {previewError ? <p className="text-sm text-muted">{previewError}</p> : null}

          {preview ? (
            <div className="space-y-3">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted">{t("familyInvoiceFee")}: </span>
                  {preview.fee_name} · {preview.unit_amount} EUR
                </p>
                <p>
                  <span className="text-muted">{t("familyInvoicePayer")}: </span>
                  {preview.payer_name}
                </p>
              </div>
              {preview.already_invoiced ? (
                <p className="rounded-[var(--radius-form)] border border-border bg-secondary/50 px-3 py-2 text-sm">
                  {t("familyInvoiceAlready", { year: preview.year })}
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
                    {preview.lines.map((line) => (
                      <tr key={line.member_id} className="border-t border-border">
                        <td className="px-3 py-2">{line.rank}</td>
                        <td className="px-3 py-2">{line.member_name}</td>
                        <td className="px-3 py-2">{line.amount_off ? `${line.amount_off} EUR` : `${line.percent_off}%`}</td>
                        <td className="px-3 py-2">{line.amount} EUR</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-right text-sm font-semibold">
                {t("familyInvoiceTotal")}: {preview.total} EUR
              </p>
            </div>
          ) : null}

          {createdInvoice ? (
            <Link
              className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
              href={`/${locale}/dashboard/club/invoices/${createdInvoice.id}`}
            >
              {t("familyInvoiceOpen", { number: createdInvoice.number })}
            </Link>
          ) : (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="primary"
                disabled={isSaving || !preview || preview.already_invoiced}
                onClick={async () => {
                  if (!invoiceFamily || !preview) {
                    return;
                  }
                  setIsSaving(true);
                  try {
                    const invoice = await createFamilyInvoice(invoiceFamily.id, preview.year);
                    setCreatedInvoice({ id: invoice.invoice_id, number: invoice.invoice_number });
                    setSuccessMessage(
                      t("invoiceCreated", { number: invoice.invoice_number, total: invoice.total }),
                    );
                    setPreview({ ...preview, already_invoiced: true });
                  } catch (error) {
                    setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                  } finally {
                    setIsSaving(false);
                  }
                }}
              >
                {t("familyInvoiceConfirm")}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </ClubAdminLayout>
  );
}
