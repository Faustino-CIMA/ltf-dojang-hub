"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { ClubFinanceTabs } from "@/components/club-admin/club-finance-tabs";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ActionNotices, FormPanel, PageNotice } from "@/components/ui/list-page-chrome";
import { FilterPills } from "@/components/ui/filter-pills";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BillingFeeOption,
  BillingHousehold,
  BillingPreview,
  assignBillingFee,
  confirmClubBilling,
  downloadBillingPrintPack,
  getClubBilling,
  issueClubBilling,
} from "@/lib/clubmgmt-api";

function applyFeeToPreview(preview: BillingPreview, memberId: number, fee: BillingFeeOption): BillingPreview {
  const households = preview.households.map((household) => {
    if (!household.lines.some((line) => line.member_id === memberId)) {
      return household;
    }
    const lines = household.lines.map((line) => {
      if (line.member_id !== memberId) {
        return line;
      }
      const percent = Number(line.percent_off || 0);
      const unit = Number(fee.amount);
      const fixed = line.amount_off ? Number(line.amount_off) : null;
      const amount = fixed != null ? Math.max(0, unit - fixed).toFixed(2) : ((unit * (100 - percent)) / 100).toFixed(2);
      return { ...line, fee_id: fee.id, fee_name: fee.name, unit_amount: fee.amount, amount };
    });
    const total = lines.reduce((sum, line) => sum + Number(line.amount), 0).toFixed(2);
    const feeIds = new Set(lines.map((line) => line.fee_id));
    let status = household.status;
    if (!["blocked", "invoiced", "paid"].includes(household.status)) {
      status = Number(total) <= 0 ? (household.confirmed ? "confirmed" : "complimentary") : "ready";
    }
    return {
      ...household,
      lines,
      total,
      status,
      fee_id: feeIds.size === 1 ? (lines[0]?.fee_id ?? null) : null,
      fee_name: feeIds.size === 1 ? (lines[0]?.fee_name ?? "") : "",
    };
  });
  return { ...preview, households };
}

type StatusFilter = "all" | "ready" | "complimentary" | "confirmed" | "invoiced" | "paid";

function yearOptions(current: number) {
  return [current + 1, current, current - 1, current - 2];
}

export default function ClubBillingPage() {
  const t = useTranslations("ClubMgmt");
  const locale = useLocale();
  const currentYear = new Date().getFullYear();
  const { selectedClubId } = useClubSelection();
  const [year, setYear] = useState(String(currentYear));
  const [preview, setPreview] = useState<BillingPreview | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmComplimentaryOpen, setConfirmComplimentaryOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<BillingHousehold | null>(null);
  const hasLoadedRef = useRef(false);

  const applyPreview = useCallback((response: BillingPreview, preserveSelection: boolean) => {
    setPreview(response);
    setDetail((current) =>
      current ? response.households.find((row) => row.id === current.id) ?? current : null
    );
    const selectableIds = response.households
      .filter((row) => row.status === "ready" || row.status === "complimentary")
      .map((row) => row.id);
    setSelected((current) => {
      if (preserveSelection) {
        return new Set([...current].filter((id) => selectableIds.includes(id)));
      }
      return new Set(response.households.filter((row) => row.status === "ready").map((row) => row.id));
    });
  }, []);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!selectedClubId) return;
    const silent = Boolean(options?.silent && hasLoadedRef.current);
    if (!silent) {
      setIsLoading(true);
      setErrorMessage(null);
    }
    try {
      const response = await getClubBilling(selectedClubId, Number(year));
      hasLoadedRef.current = true;
      applyPreview(response, silent);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [applyPreview, selectedClubId, t, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const households = preview?.households ?? [];
    const query = search.trim().toLowerCase();
    return households.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!query) return true;
      return `${row.name} ${row.payer.name} ${row.payer.contact_label}`.toLowerCase().includes(query);
    });
  }, [preview, search, statusFilter]);

  const selectedRows = rows.filter((row) => selected.has(row.id) && row.status === "ready");
  const selectedComplimentary = rows.filter((row) => selected.has(row.id) && row.status === "complimentary");
  const selectedTotal = selectedRows.reduce((sum, row) => sum + Number(row.total), 0);
  const canPickFee = (status: BillingHousehold["status"]) =>
    status === "ready" || status === "complimentary" || status === "confirmed";

  const toggle = (id: string, selectable: boolean) => {
    if (!selectable) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFeeChange = async (memberId: number, feeId: number) => {
    if (!selectedClubId || !preview) {
      return;
    }
    const fee = preview.fees.find((row) => row.id === feeId);
    if (!fee) {
      return;
    }
    const scrollY = window.scrollY;
    const nextPreview = applyFeeToPreview(preview, memberId, fee);
    setPreview(nextPreview);
    setDetail((current) =>
      current ? nextPreview.households.find((row) => row.id === current.id) ?? current : null
    );
    setErrorMessage(null);
    try {
      await assignBillingFee(selectedClubId, memberId, feeId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
      await load({ silent: true });
    } finally {
      window.setTimeout(() => {
        window.scrollTo({ top: scrollY, behavior: "instant" });
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }, 0);
    }
  };

  const handleIssue = async () => {
    if (!selectedClubId) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const result = await issueClubBilling(
        selectedClubId,
        Number(year),
        selectedRows.map((row) => row.id),
      );
      setConfirmOpen(false);
      setSuccessMessage(
        t("billingIssued", {
          count: result.created_count,
          email: result.email_count,
          post: result.post_count,
          hand: result.hand_count,
        }),
      );
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmComplimentary = async () => {
    if (!selectedClubId) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const result = await confirmClubBilling(
        selectedClubId,
        Number(year),
        selectedComplimentary.map((row) => row.id),
      );
      setConfirmComplimentaryOpen(false);
      setSuccessMessage(t("billingConfirmed", { count: result.confirmed_count, year }));
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const deliveryBadge = (delivery: BillingHousehold["delivery"]) => {
    if (delivery === "post") return { label: t("deliveryPost"), tone: "warning" as const };
    if (delivery === "hand") return { label: t("deliveryHand"), tone: "neutral" as const };
    return { label: t("deliveryEmail"), tone: "info" as const };
  };

  const statusBadge = (status: BillingHousehold["status"]) => {
    if (status === "paid") return { label: t("billingPaid"), tone: "success" as const };
    if (status === "invoiced") return { label: t("billingInvoiced"), tone: "warning" as const };
    if (status === "blocked") return { label: t("billingBlocked"), tone: "danger" as const };
    if (status === "confirmed") return { label: t("billingConfirmedStatus"), tone: "success" as const };
    if (status === "complimentary") return { label: t("billingComplimentary"), tone: "neutral" as const };
    return { label: t("billingReady"), tone: "info" as const };
  };

  return (
    <ClubAdminLayout title={t("billingTitle")} subtitle={t("billingSubtitle")}>
      <div className="space-y-6">
        <ClubFinanceTabs />
        <ActionNotices
          error={errorMessage}
          success={successMessage}
          onDismiss={() => {
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
        />
        <div className="flex flex-wrap items-end justify-between gap-4 rounded-[var(--radius-card)] border border-border bg-[var(--surface)] p-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("billingYear")}</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions(currentYear).map((option) => (
                  <SelectItem key={option} value={String(option)}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!preview || (preview.summary.print_pack_count ?? 0) === 0}
              onClick={async () => {
                if (!selectedClubId) return;
                if ((preview?.summary.print_pack_count ?? 0) === 0) {
                  setErrorMessage(t("printPackEmpty"));
                  return;
                }
                try {
                  await downloadBillingPrintPack(selectedClubId, Number(year), "paper");
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : t("printPackEmpty"));
                }
              }}
            >
              {t("printPackAction")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={selectedComplimentary.length === 0}
              onClick={() => setConfirmComplimentaryOpen(true)}
            >
              {t("confirmComplimentaryAction")}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={selectedRows.length === 0}
              onClick={() => setConfirmOpen(true)}
            >
              {t("reviewIssueAction")}
            </Button>
          </div>
        </div>
        {preview && !preview.fee_set ? (
          <PageNotice tone="warning">
            {t("billingNoFee")}{" "}
            <Link className="underline underline-offset-4" href={`/${locale}/dashboard/club/fees`}>
              {t("openFees")}
            </Link>
          </PageNotice>
        ) : null}
        {preview && ((preview.summary.complimentary_count ?? 0) > 0 || (preview.summary.confirmed_count ?? 0) > 0) ? (
          <PageNotice tone="info">{t("billingComplimentaryHint")}</PageNotice>
        ) : null}
        {isLoading ? (
          <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
        ) : !preview || preview.households.length === 0 ? (
          <EmptyState title={t("billingEmptyTitle")} description={t("billingEmptySubtitle")} />
        ) : (
          <>
            <FormPanel>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <p>
                  {t("billingSelectionSummary", {
                    count: selectedRows.length,
                    total: selectedTotal.toFixed(2),
                    email: selectedRows.filter((row) => row.delivery === "email").length,
                    post: selectedRows.filter((row) => row.delivery === "post").length,
                    hand: selectedRows.filter((row) => row.delivery === "hand").length,
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSelected(new Set(preview.households.filter((row) => row.status === "ready").map((row) => row.id)))
                    }
                  >
                    {t("selectReady")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSelected(
                        new Set(preview.households.filter((row) => row.status === "complimentary").map((row) => row.id)),
                      )
                    }
                  >
                    {t("selectComplimentary")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                    {t("clearSelection")}
                  </Button>
                </div>
              </div>
            </FormPanel>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <Input
                className="max-w-xs"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("billingSearch")}
              />
              <FilterPills
                ariaLabel={t("billingFilterAria")}
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "all", title: t("billingFilterAll"), count: preview.households.length },
                  { value: "ready", title: t("billingReady"), count: preview.summary.ready_count },
                  { value: "complimentary", title: t("billingComplimentary"), count: preview.summary.complimentary_count ?? 0 },
                  { value: "confirmed", title: t("billingConfirmedStatus"), count: preview.summary.confirmed_count ?? 0 },
                  { value: "invoiced", title: t("billingInvoiced"), count: preview.households.filter((row) => row.status === "invoiced").length },
                  { value: "paid", title: t("billingPaid"), count: preview.households.filter((row) => row.status === "paid").length },
                ]}
              />
            </div>
            <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-secondary/70 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 w-10" />
                    <th className="px-3 py-2">{t("billingHousehold")}</th>
                    <th className="px-3 py-2">{t("familyInvoicePayer")}</th>
                    <th className="px-3 py-2">{t("deliveryLabel")}</th>
                    {(preview.fees?.length ?? 0) > 1 ? <th className="px-3 py-2">{t("memberFeeLabel")}</th> : null}
                    <th className="px-3 py-2">{t("familyInvoiceTotal")}</th>
                    <th className="px-3 py-2">{t("billingStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const delivery = deliveryBadge(row.delivery);
                    const status = statusBadge(row.status);
                    return (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-t border-border hover:bg-secondary/40"
                        onClick={() => setDetail(row)}
                      >
                        <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(row.id)}
                            disabled={row.status !== "ready" && row.status !== "complimentary"}
                            onCheckedChange={() =>
                              toggle(row.id, row.status === "ready" || row.status === "complimentary")
                            }
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium">{row.name}</div>
                          <div className="text-xs text-muted">
                            {row.kind === "family"
                              ? t("billingFamilyMembers", { count: row.member_count })
                              : t("billingSingleMember")}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div>{row.payer.name}</div>
                          <div className="text-xs text-muted">{row.payer.contact_label}</div>
                        </td>
                        <td className="px-3 py-3"><StatusBadge label={delivery.label} tone={delivery.tone} /></td>
                        {(preview.fees?.length ?? 0) > 1 ? (
                          <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                            {canPickFee(row.status) && row.kind === "member" ? (
                              <Select
                                value={row.fee_id ? String(row.fee_id) : ""}
                                onValueChange={(value) => {
                                  void handleFeeChange(row.payer.id, Number(value));
                                }}
                                modal={false}
                              >
                                <SelectTrigger className="w-[11rem]"><SelectValue placeholder={t("memberFeeLabel")} /></SelectTrigger>
                                <SelectContent position="popper" onCloseAutoFocus={(event) => event.preventDefault()}>
                                  {preview.fees.map((fee) => (
                                    <SelectItem key={fee.id} value={String(fee.id)}>
                                      {fee.name} · {fee.amount} EUR
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-sm">{row.fee_name || t("billingMixedFees")}</span>
                            )}
                          </td>
                        ) : null}
                        <td className="px-3 py-3 font-medium">{row.total} EUR</td>
                        <td className="px-3 py-3">
                          <StatusBadge label={status.label} tone={status.tone} />
                          {row.invoice_number ? (
                            <div className="mt-1 text-xs text-muted">{row.invoice_number}</div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <Modal
        title={t("reviewIssueAction")}
        description={t("billingConfirmHint")}
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
      >
        <div className="space-y-3 text-sm">
          <p>{t("billingConfirmCount", { count: selectedRows.length, total: selectedTotal.toFixed(2), year })}</p>
          <p>
            {t("billingConfirmDelivery", {
              email: selectedRows.filter((row) => row.delivery === "email").length,
              post: selectedRows.filter((row) => row.delivery === "post").length,
              hand: selectedRows.filter((row) => row.delivery === "hand").length,
            })}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>{t("cancel")}</Button>
            <Button type="button" variant="primary" disabled={isSaving} onClick={() => void handleIssue()}>
              {isSaving ? t("saving") : t("issueInvoicesAction")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        title={t("confirmComplimentaryAction")}
        description={t("billingConfirmComplimentaryHint")}
        isOpen={confirmComplimentaryOpen}
        onClose={() => setConfirmComplimentaryOpen(false)}
      >
        <div className="space-y-3 text-sm">
          <p>{t("billingConfirmComplimentaryCount", { count: selectedComplimentary.length, year })}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmComplimentaryOpen(false)}>{t("cancel")}</Button>
            <Button type="button" variant="primary" disabled={isSaving} onClick={() => void handleConfirmComplimentary()}>
              {isSaving ? t("saving") : t("confirmComplimentaryAction")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        title={detail?.name ?? ""}
        isOpen={Boolean(detail)}
        onClose={() => setDetail(null)}
      >
        {detail ? (
          <div className="space-y-3 text-sm">
            <p>{detail.payer.name} · {deliveryBadge(detail.delivery).label}</p>
            <p className="text-muted">{detail.payer.contact_label}</p>
            <ul className="space-y-2">
              {detail.lines.map((line) => (
                <li key={line.member_id} className="flex flex-wrap items-center justify-between gap-3">
                  <span>{line.member_name}</span>
                  {(preview?.fees?.length ?? 0) > 1 && canPickFee(detail.status) ? (
                    <Select
                      value={line.fee_id ? String(line.fee_id) : ""}
                      onValueChange={(value) => {
                        void handleFeeChange(line.member_id, Number(value));
                      }}
                      modal={false}
                    >
                      <SelectTrigger className="w-[11rem]"><SelectValue /></SelectTrigger>
                      <SelectContent position="popper" onCloseAutoFocus={(event) => event.preventDefault()}>
                        {(preview?.fees ?? []).map((fee) => (
                          <SelectItem key={fee.id} value={String(fee.id)}>
                            {fee.name} · {fee.amount} EUR
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span>{line.fee_name ? `${line.fee_name} · ` : ""}{line.amount} EUR</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="font-medium">{t("familyInvoiceTotal")}: {detail.total} EUR</p>
            {detail.status === "ready" ? null : (
              <Link className="text-primary underline-offset-4 hover:underline" href={`/${locale}/dashboard/club/members/${detail.payer.id}?tab=club-record`}>
                {t("openClubRecord")}
              </Link>
            )}
          </div>
        ) : null}
      </Modal>
    </ClubAdminLayout>
  );
}
