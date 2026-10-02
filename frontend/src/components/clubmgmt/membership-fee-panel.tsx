"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteConfirmModal } from "@/components/ui/delete-confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormPanel } from "@/components/ui/list-page-chrome";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDisplayDate } from "@/lib/date-display";
import {
  addBilling,
  addLicenseFeePrice,
  addMembershipFeePrice,
  createFee,
  createRebateRule,
  deleteBilling,
  deleteFee,
  deleteRebateRule,
  getLicenseFee,
  listBillings,
  listFees,
  listRebateRules,
  saveLicenseFee,
  setLicenseFeeBilling,
  updateBillingLabel,
  updateFee,
  updateRebateRule,
  type LicenseFee,
  type MembershipBillingRow,
  type RebateRule,
} from "@/lib/clubmgmt-api";

type PriceRow = { id: number; amount: string; effective_from: string; created_at: string };
type FeeRow = { id: number; name: string; amount: string; year: number | null; prices: PriceRow[] };
type FeeDraft = { id: number; name: string; amount: string };
type RebateKind = "percent" | "amount";

type RebateDraft = {
  id: number;
  rank: string;
  kind: RebateKind;
  value: string;
  appliesToLater: boolean;
};

type Props = {
  clubId: number;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

function feeYearOptions(current: number) {
  return [current + 1, current, current - 1, current - 2];
}

function rebatePayload(clubId: number, rank: string, kind: RebateKind, value: string, appliesToLater: boolean) {
  return {
    club: clubId,
    member_rank: Number(rank),
    percent_off: kind === "percent" ? value : "0",
    amount_off: kind === "amount" ? value : null,
    applies_to_later: appliesToLater,
  };
}

function RebateFields({
  idPrefix,
  rank,
  kind,
  value,
  appliesToLater,
  onRank,
  onKind,
  onValue,
  onAppliesToLater,
  autoFocus,
}: {
  idPrefix: string;
  rank: string;
  kind: RebateKind;
  value: string;
  appliesToLater: boolean;
  onRank: (value: string) => void;
  onKind: (value: RebateKind) => void;
  onValue: (value: string) => void;
  onAppliesToLater: (value: boolean) => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations("ClubMgmt");
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-rank`}>{t("rebateRank")}</Label>
          <Input
            id={`${idPrefix}-rank`}
            value={rank}
            onChange={(event) => onRank(event.target.value)}
            placeholder="2"
            autoFocus={autoFocus}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("rebateKind")}</Label>
          <Select value={kind} onValueChange={(next) => onKind(next as RebateKind)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">{t("rebateKindPercent")}</SelectItem>
              <SelectItem value="amount">{t("rebateKindAmount")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-value`}>{kind === "amount" ? t("rebateAmount") : t("rebatePercent")}</Label>
          <Input
            id={`${idPrefix}-value`}
            value={value}
            onChange={(event) => onValue(event.target.value)}
            placeholder={kind === "amount" ? "25.00" : "10"}
            inputMode="decimal"
          />
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          className="mt-0.5"
          checked={appliesToLater}
          onCheckedChange={(checked) => onAppliesToLater(Boolean(checked))}
        />
        <span>
          <span className="font-medium text-foreground">{t("rebateAppliesToLater")}</span>
          <span className="mt-0.5 block text-muted">{t("rebateAppliesToLaterHint")}</span>
        </span>
      </label>
    </div>
  );
}

export function MembershipFeePanel({ clubId, onSuccess, onError }: Props) {
  const t = useTranslations("ClubMgmt");
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [rules, setRules] = useState<RebateRule[]>([]);
  const [feeName, setFeeName] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [isSavingFee, setIsSavingFee] = useState(false);
  const [rank, setRank] = useState("");
  const [rebateKind, setRebateKind] = useState<RebateKind>("percent");
  const [rebateValue, setRebateValue] = useState("");
  const [appliesToLater, setAppliesToLater] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<RebateRule | null>(null);
  const [isDeletingRule, setIsDeletingRule] = useState(false);
  const [editDraft, setEditDraft] = useState<RebateDraft | null>(null);
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [feeDraft, setFeeDraft] = useState<FeeDraft | null>(null);
  const [feeToDelete, setFeeToDelete] = useState<FeeRow | null>(null);
  const [isDeletingFee, setIsDeletingFee] = useState(false);
  const [priceDrafts, setPriceDrafts] = useState<Record<number, { amount: string; effectiveFrom: string }>>({});
  const [licenseFee, setLicenseFee] = useState<LicenseFee | null>(null);
  const [licenseName, setLicenseName] = useState("");
  const [licenseAmount, setLicenseAmount] = useState("");
  const [licenseDraft, setLicenseDraft] = useState<{ name: string; amount: string } | null>(null);
  const [licensePrice, setLicensePrice] = useState({ amount: "", effectiveFrom: "" });
  const [billingYear, setBillingYear] = useState(String(new Date().getFullYear()));
  const [billings, setBillings] = useState<MembershipBillingRow[]>([]);
  const [billingLabel, setBillingLabel] = useState("");
  const [editingBillingId, setEditingBillingId] = useState<number | null>(null);
  const [billingLabelDraft, setBillingLabelDraft] = useState("");
  const [billingToDelete, setBillingToDelete] = useState<MembershipBillingRow | null>(null);
  const [licenseFeeBillingSaving, setLicenseFeeBillingSaving] = useState(false);
  const [isDeletingBilling, setIsDeletingBilling] = useState(false);

  const load = async () => {
    try {
      const [nextFees, nextRules, nextLicense] = await Promise.all([
        listFees(clubId),
        listRebateRules(clubId),
        getLicenseFee(clubId),
      ]);
      setFees(nextFees);
      setRules(nextRules);
      setLicenseFee(nextLicense);
    } catch (error) {
      onError(error instanceof Error ? error.message : t("loadError"));
    }
  };

  const loadBillings = async (year: string) => {
    try {
      const next = await listBillings(clubId, Number(year));
      setBillings(next.billings);
    } catch (error) {
      onError(error instanceof Error ? error.message : t("loadError"));
    }
  };

  useEffect(() => {
    void load();
  }, [clubId]);

  useEffect(() => {
    void loadBillings(billingYear);
  }, [clubId, billingYear]);

  return (
    <div className="space-y-6">
      <FormPanel>
        <h2 className="text-section text-foreground">{t("membershipFee")}</h2>
        <p className="mt-1 text-sm text-muted">{t("membershipFeeSubtitle")}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="club-membership-name">{t("feeName")}</Label>
            <Input
              id="club-membership-name"
              value={feeName}
              onChange={(event) => setFeeName(event.target.value)}
              placeholder={t("feeName")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="club-membership-amount">{t("feeAmount")}</Label>
            <Input
              id="club-membership-amount"
              value={feeAmount}
              onChange={(event) => setFeeAmount(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
            />
          </div>
        </div>
        <div className="mt-4">
          <Button
            type="button"
            disabled={isSavingFee}
            onClick={async () => {
              if (!feeName.trim() || !feeAmount.trim()) {
                onError(t("feeRequiredError"));
                return;
              }
              setIsSavingFee(true);
              try {
                await createFee({
                  club: clubId,
                  name: feeName.trim(),
                  amount: feeAmount,
                });
                setFeeName("");
                setFeeAmount("");
                await load();
                onSuccess(t("saved"));
              } catch (error) {
                onError(error instanceof Error ? error.message : t("saveError"));
              } finally {
                setIsSavingFee(false);
              }
            }}
          >
            {t("saveFee")}
          </Button>
        </div>
      </FormPanel>

      {fees.length === 0 ? (
        <EmptyState title={t("feeEmptyTitle")} description={t("feeEmptySubtitle")} />
      ) : (
        <div className="space-y-5">
          {fees.map((fee) => {
            const draft = priceDrafts[fee.id] ?? { amount: "", effectiveFrom: "" };
            return (
              <article
                key={fee.id}
                className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface"
              >
                <div className="border-b border-border bg-secondary px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{fee.name}</h3>
                      <p className="text-xs text-muted">
                        {fee.amount} EUR · {t("currentPrice")}
                      </p>
                    </div>
                    <div className="ml-auto flex shrink-0 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t("editItem")}
                        aria-expanded={feeDraft?.id === fee.id}
                        onClick={() => {
                          if (feeDraft?.id === fee.id) {
                            setFeeDraft(null);
                            return;
                          }
                          setFeeDraft({ id: fee.id, name: fee.name, amount: fee.amount });
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t("deleteFee")}
                        onClick={() => setFeeToDelete(fee)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {feeDraft?.id === fee.id ? (
                    <div className="mt-4" data-fee-editor={fee.id}>
                      <p className="mb-3 text-xs text-muted">{t("editFeeHint")}</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`fee-name-${fee.id}`}>{t("feeName")}</Label>
                          <Input
                            id={`fee-name-${fee.id}`}
                            value={feeDraft.name}
                            autoFocus
                            onChange={(event) =>
                              setFeeDraft((current) => (current ? { ...current, name: event.target.value } : current))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`fee-amount-${fee.id}`}>{t("feeAmount")}</Label>
                          <Input
                            id={`fee-amount-${fee.id}`}
                            value={feeDraft.amount}
                            inputMode="decimal"
                            onChange={(event) =>
                              setFeeDraft((current) => (current ? { ...current, amount: event.target.value } : current))
                            }
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isSavingFee}
                          onClick={async () => {
                            if (!feeDraft.name.trim() || !feeDraft.amount.trim()) {
                              onError(t("feeRequiredError"));
                              return;
                            }
                            setIsSavingFee(true);
                            try {
                              await updateFee(fee.id, { name: feeDraft.name.trim(), amount: feeDraft.amount });
                              setFeeDraft(null);
                              await load();
                              onSuccess(t("saved"));
                            } catch (error) {
                              onError(error instanceof Error ? error.message : t("saveError"));
                            } finally {
                              setIsSavingFee(false);
                            }
                          }}
                        >
                          {t("saveFeeChanges")}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setFeeDraft(null)}>
                          {t("cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
                {(fee.prices ?? []).length > 0 ? (
                  <EntityTable
                    columns={[
                      {
                        key: "amount",
                        header: t("feeAmount"),
                        render: (row: PriceRow) => `${row.amount} EUR`,
                      },
                      {
                        key: "effective_from",
                        header: t("priceFrom"),
                        render: (row: PriceRow) => formatDisplayDate(row.effective_from),
                      },
                    ]}
                    rows={fee.prices}
                  />
                ) : null}
                <div className="border-t border-border bg-secondary px-4 py-4">
                  <p className="mb-3 text-xs text-muted">{t("newPriceHint")}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("feeAmount")}</Label>
                      <Input
                        value={draft.amount}
                        onChange={(event) =>
                          setPriceDrafts((current) => ({
                            ...current,
                            [fee.id]: { ...draft, amount: event.target.value },
                          }))
                        }
                        placeholder="0.00"
                        inputMode="decimal"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("priceFrom")}</Label>
                      <Input
                        type="date"
                        value={draft.effectiveFrom}
                        onChange={(event) =>
                          setPriceDrafts((current) => ({
                            ...current,
                            [fee.id]: { ...draft, effectiveFrom: event.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <Button
                      type="button"
                      onClick={async () => {
                        if (!draft.amount.trim()) {
                          onError(t("feeRequiredError"));
                          return;
                        }
                        try {
                          await addMembershipFeePrice(fee.id, {
                            amount: draft.amount,
                            effective_from: draft.effectiveFrom || undefined,
                          });
                          setPriceDrafts((current) => ({ ...current, [fee.id]: { amount: "", effectiveFrom: "" } }));
                          await load();
                          onSuccess(t("saved"));
                        } catch (error) {
                          onError(error instanceof Error ? error.message : t("saveError"));
                        }
                      }}
                    >
                      {t("saveNewPrice")}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <FormPanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-section text-foreground">{t("licenseFeeTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("licenseFeeSubtitle")}</p>
            {licenseFee?.id != null ? (
              <p className="mt-3 text-sm">
                <span className="text-muted">{t("licenseFeeCurrent")}: </span>
                {licenseFee.name} · {licenseFee.amount} EUR
              </p>
            ) : null}
          </div>
          {licenseFee?.id != null ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={t("editItem")}
              aria-expanded={licenseDraft != null}
              onClick={() => {
                if (licenseDraft) {
                  setLicenseDraft(null);
                  return;
                }
                setLicenseDraft({ name: licenseFee.name, amount: licenseFee.amount });
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        {licenseFee?.id == null ? (
          <>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="license-fee-name">{t("feeName")}</Label>
                <Input
                  id="license-fee-name"
                  value={licenseName}
                  onChange={(event) => setLicenseName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="license-fee-amount">{t("feeAmount")}</Label>
                <Input
                  id="license-fee-amount"
                  value={licenseAmount}
                  onChange={(event) => setLicenseAmount(event.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </div>
            </div>
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                disabled={isSavingFee}
                onClick={async () => {
                  if (!licenseName.trim() || !licenseAmount.trim()) {
                    onError(t("feeRequiredError"));
                    return;
                  }
                  setIsSavingFee(true);
                  try {
                    const saved = await saveLicenseFee(clubId, { name: licenseName.trim(), amount: licenseAmount });
                    setLicenseFee(saved);
                    setLicenseName("");
                    setLicenseAmount("");
                    onSuccess(t("saved"));
                  } catch (error) {
                    onError(error instanceof Error ? error.message : t("saveError"));
                  } finally {
                    setIsSavingFee(false);
                  }
                }}
              >
                {t("saveLicenseFee")}
              </Button>
            </div>
          </>
        ) : null}
        {licenseDraft ? (
          <div className="mt-4">
            <p className="mb-3 text-xs text-muted">{t("editFeeHint")}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="license-fee-edit-name">{t("feeName")}</Label>
                <Input
                  id="license-fee-edit-name"
                  value={licenseDraft.name}
                  autoFocus
                  onChange={(event) => setLicenseDraft((current) => (current ? { ...current, name: event.target.value } : current))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="license-fee-edit-amount">{t("feeAmount")}</Label>
                <Input
                  id="license-fee-edit-amount"
                  value={licenseDraft.amount}
                  inputMode="decimal"
                  onChange={(event) =>
                    setLicenseDraft((current) => (current ? { ...current, amount: event.target.value } : current))
                  }
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSavingFee}
                onClick={async () => {
                  if (!licenseDraft.name.trim() || !licenseDraft.amount.trim()) {
                    onError(t("feeRequiredError"));
                    return;
                  }
                  setIsSavingFee(true);
                  try {
                    const saved = await saveLicenseFee(clubId, {
                      name: licenseDraft.name.trim(),
                      amount: licenseDraft.amount,
                    });
                    setLicenseFee(saved);
                    setLicenseDraft(null);
                    onSuccess(t("saved"));
                  } catch (error) {
                    onError(error instanceof Error ? error.message : t("saveError"));
                  } finally {
                    setIsSavingFee(false);
                  }
                }}
              >
                {t("saveFeeChanges")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setLicenseDraft(null)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : null}
        {(licenseFee?.prices.length ?? 0) > 0 ? (
          <div className="mt-4 overflow-hidden rounded-[var(--radius-card)] border border-border">
            <EntityTable
              columns={[
                { key: "amount", header: t("feeAmount"), render: (row) => `${row.amount} EUR` },
                { key: "effective_from", header: t("priceFrom"), render: (row) => formatDisplayDate(row.effective_from) },
              ]}
              rows={licenseFee?.prices ?? []}
            />
          </div>
        ) : null}
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-3 text-xs text-muted">{t("newPriceHint")}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="license-fee-new-amount">{t("feeAmount")}</Label>
              <Input
                id="license-fee-new-amount"
                value={licensePrice.amount}
                onChange={(event) => setLicensePrice((current) => ({ ...current, amount: event.target.value }))}
                placeholder="0.00"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="license-fee-new-from">{t("priceFrom")}</Label>
              <Input
                id="license-fee-new-from"
                type="date"
                value={licensePrice.effectiveFrom}
                onChange={(event) => setLicensePrice((current) => ({ ...current, effectiveFrom: event.target.value }))}
              />
            </div>
          </div>
          <div className="mt-3">
            <Button
              type="button"
              onClick={async () => {
                if (!licensePrice.amount.trim()) {
                  onError(t("feeRequiredError"));
                  return;
                }
                try {
                  const saved = await addLicenseFeePrice(clubId, {
                    amount: licensePrice.amount,
                    effective_from: licensePrice.effectiveFrom || undefined,
                  });
                  setLicenseFee(saved);
                  setLicensePrice({ amount: "", effectiveFrom: "" });
                  onSuccess(t("saved"));
                } catch (error) {
                  onError(error instanceof Error ? error.message : t("saveError"));
                }
              }}
            >
              {t("saveNewPrice")}
            </Button>
          </div>
        </div>
      </FormPanel>

      <FormPanel>
        <h2 className="text-section text-foreground">{t("billingsTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("billingsSubtitle")}</p>
        <div className="mt-4 w-full max-w-xs space-y-2">
          <Label>{t("billingYear")}</Label>
          <Select
            value={billingYear}
            onValueChange={(value) => {
              setBillingYear(value);
              setEditingBillingId(null);
              setBillingLabelDraft("");
            }}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {feeYearOptions(new Date().getFullYear()).map((option) => (
                <SelectItem key={option} value={String(option)}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {billings.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t("billingsImplicit")}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex max-w-sm flex-col gap-2">
              <Label>{t("licenseFeeBilling")}</Label>
              <Select
                value={String(billings.find((row) => row.charges_license_fee)?.id ?? billings[0].id)}
                disabled={licenseFeeBillingSaving}
                onValueChange={(value) => {
                  const billingId = Number(value);
                  setLicenseFeeBillingSaving(true);
                  setBillings((current) => current.map((row) => ({ ...row, charges_license_fee: row.id === billingId })));
                  void setLicenseFeeBilling(clubId, billingId)
                    .then(async () => {
                      await loadBillings(billingYear);
                      onSuccess(t("saved"));
                    })
                    .catch(async (error: unknown) => {
                      onError(error instanceof Error ? error.message : t("saveError"));
                      await loadBillings(billingYear);
                    })
                    .finally(() => setLicenseFeeBillingSaving(false));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {billings.map((row) => (
                    <SelectItem key={row.id} value={String(row.id)}>
                      {row.label
                        ? `${t("billingInstallmentNumber", { sequence: row.sequence })} — ${row.label}`
                        : t("billingInstallmentNumber", { sequence: row.sequence })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="max-w-3xl text-sm text-muted">{t("licenseFeeBillingHint")}</p>
          </div>
        )}
        {billings.length === 0 ? null : (
          <div className="mt-4 space-y-3">
            {billings.map((row) => (
              <div key={row.id} className="rounded-[var(--radius-form)] border border-border px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t("billingInstallmentNumber", { sequence: row.sequence })}</p>
                    <p className="text-sm text-muted">{row.label || "—"}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={t("editItem")}
                      aria-expanded={editingBillingId === row.id}
                      onClick={() => {
                        if (editingBillingId === row.id) {
                          setEditingBillingId(null);
                          setBillingLabelDraft("");
                          return;
                        }
                        setEditingBillingId(row.id);
                        setBillingLabelDraft(row.label);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={t("deleteBilling")}
                      onClick={() => setBillingToDelete(row)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {editingBillingId === row.id ? (
                  <div className="mt-3 max-w-md space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor={`billing-label-${row.id}`}>{t("billingLabel")}</Label>
                      <Input
                        id={`billing-label-${row.id}`}
                        value={billingLabelDraft}
                        placeholder={t("billingLabelPlaceholder")}
                        autoFocus
                        onChange={(event) => setBillingLabelDraft(event.target.value)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await updateBillingLabel(clubId, row.id, billingLabelDraft);
                            setEditingBillingId(null);
                            setBillingLabelDraft("");
                            await loadBillings(billingYear);
                            onSuccess(t("saved"));
                          } catch (error) {
                            onError(error instanceof Error ? error.message : t("saveError"));
                          }
                        }}
                      >
                        {t("saveBillingLabel")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditingBillingId(null);
                          setBillingLabelDraft("");
                        }}
                      >
                        {t("cancel")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 max-w-md space-y-3">
          <div className="space-y-2">
            <Label htmlFor="billing-new-label">{t("billingLabel")}</Label>
            <Input
              id="billing-new-label"
              value={billingLabel}
              placeholder={t("billingLabelPlaceholder")}
              onChange={(event) => setBillingLabel(event.target.value)}
            />
          </div>
          <Button
            type="button"
            onClick={async () => {
              try {
                await addBilling(clubId, Number(billingYear), billingLabel.trim());
                setBillingLabel("");
                await loadBillings(billingYear);
                onSuccess(t("billingAdded"));
              } catch (error) {
                onError(error instanceof Error ? error.message : t("saveError"));
              }
            }}
          >
            {t("addBilling")}
          </Button>
        </div>
      </FormPanel>

      <FormPanel>
        <h2 className="text-section text-foreground">{t("rebateRules")}</h2>
        <p className="mt-1 text-sm text-muted">{t("rebateRulesSubtitle")}</p>
        <div className="mt-4">
          <RebateFields
            idPrefix="rebate"
            rank={rank}
            kind={rebateKind}
            value={rebateValue}
            appliesToLater={appliesToLater}
            onRank={setRank}
            onKind={setRebateKind}
            onValue={setRebateValue}
            onAppliesToLater={setAppliesToLater}
          />
        </div>
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            disabled={isSavingRule}
            onClick={async () => {
              if (!rank.trim() || !rebateValue.trim()) {
                onError(t("rebateRequiredError"));
                return;
              }
              setIsSavingRule(true);
              try {
                await createRebateRule(rebatePayload(clubId, rank, rebateKind, rebateValue, appliesToLater));
                setRank("");
                setRebateKind("percent");
                setRebateValue("");
                setAppliesToLater(false);
                await load();
                onSuccess(t("saved"));
              } catch (error) {
                onError(error instanceof Error ? error.message : t("saveError"));
              } finally {
                setIsSavingRule(false);
              }
            }}
          >
            {t("addRebate")}
          </Button>
        </div>
      </FormPanel>

      {rules.length > 0 ? (
        <EntityTable
          columns={[
            {
              key: "member_rank",
              header: t("rebateRank"),
              render: (row: RebateRule) => String(row.member_rank),
            },
            {
              key: "percent_off",
              header: t("rebateValue"),
              render: (row: RebateRule) => (row.amount_off ? `${row.amount_off} EUR` : `${row.percent_off}%`),
            },
            {
              key: "applies_to_later",
              header: t("rebateFollowing"),
              render: (row: RebateRule) => (row.applies_to_later ? t("rebateFollowingYes") : t("rebateFollowingNo")),
            },
            {
              key: "actions",
              header: "",
              render: (row: RebateRule) => {
                const open = editDraft?.id === row.id;
                return (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={t("editItem")}
                      aria-expanded={open}
                      onClick={() => {
                        if (open) {
                          setEditDraft(null);
                          return;
                        }
                        setEditDraft({
                          id: row.id,
                          rank: String(row.member_rank),
                          kind: row.amount_off ? "amount" : "percent",
                          value: row.amount_off || row.percent_off,
                          appliesToLater: Boolean(row.applies_to_later),
                        });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={t("deleteRebateConfirm")}
                      onClick={() => setRuleToDelete(row)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              },
            },
          ]}
          rows={rules}
          renderDetail={(row) =>
            editDraft?.id === row.id ? (
              <div data-rebate-editor={row.id}>
                <RebateFields
                  idPrefix={`rebate-edit-${row.id}`}
                  rank={editDraft.rank}
                  kind={editDraft.kind}
                  value={editDraft.value}
                  appliesToLater={editDraft.appliesToLater}
                  autoFocus
                  onRank={(value) => setEditDraft((current) => (current ? { ...current, rank: value } : current))}
                  onKind={(kind) => setEditDraft((current) => (current ? { ...current, kind } : current))}
                  onValue={(value) => setEditDraft((current) => (current ? { ...current, value } : current))}
                  onAppliesToLater={(applies) =>
                    setEditDraft((current) => (current ? { ...current, appliesToLater: applies } : current))
                  }
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSavingRule}
                    onClick={async () => {
                      if (!editDraft.rank.trim() || !editDraft.value.trim()) {
                        onError(t("rebateRequiredError"));
                        return;
                      }
                      setIsSavingRule(true);
                      try {
                        await updateRebateRule(
                          row.id,
                          rebatePayload(
                            clubId,
                            editDraft.rank,
                            editDraft.kind,
                            editDraft.value,
                            editDraft.appliesToLater,
                          ),
                        );
                        setEditDraft(null);
                        await load();
                        onSuccess(t("saved"));
                      } catch (error) {
                        onError(error instanceof Error ? error.message : t("saveError"));
                      } finally {
                        setIsSavingRule(false);
                      }
                    }}
                  >
                    {t("saveRebate")}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditDraft(null)}>
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : null
          }
        />
      ) : null}
      <DeleteConfirmModal
        isOpen={feeToDelete !== null}
        title={t("deleteFeeTitle")}
        description={feeToDelete ? t("deleteFeeDescription", { name: feeToDelete.name }) : ""}
        confirmLabel={t("deleteFeeConfirm")}
        cancelLabel={t("cancel")}
        onCancel={() => {
          if (!isDeletingFee) setFeeToDelete(null);
        }}
        onConfirm={async () => {
          if (!feeToDelete) return;
          setIsDeletingFee(true);
          try {
            await deleteFee(feeToDelete.id);
            if (feeDraft?.id === feeToDelete.id) setFeeDraft(null);
            setFeeToDelete(null);
            await load();
            onSuccess(t("feeDeleted"));
          } catch (error) {
            onError(error instanceof Error ? error.message : t("saveError"));
          } finally {
            setIsDeletingFee(false);
          }
        }}
      />
      <DeleteConfirmModal
        isOpen={billingToDelete !== null}
        title={t("deleteBillingTitle")}
        description={
          billingToDelete
            ? t("deleteBillingDescription", { sequence: billingToDelete.sequence, year: billingYear })
            : ""
        }
        confirmLabel={t("deleteBillingConfirm")}
        cancelLabel={t("cancel")}
        onCancel={() => {
          if (!isDeletingBilling) setBillingToDelete(null);
        }}
        onConfirm={async () => {
          if (!billingToDelete) return;
          setIsDeletingBilling(true);
          try {
            await deleteBilling(clubId, billingToDelete.id);
            if (editingBillingId === billingToDelete.id) {
              setEditingBillingId(null);
              setBillingLabelDraft("");
            }
            setBillingToDelete(null);
            await loadBillings(billingYear);
            onSuccess(t("billingRemoved"));
          } catch (error) {
            onError(error instanceof Error ? error.message : t("saveError"));
          } finally {
            setIsDeletingBilling(false);
          }
        }}
      />
      <DeleteConfirmModal
        isOpen={ruleToDelete !== null}
        title={t("deleteRebateTitle")}
        description={ruleToDelete ? t("deleteRebateDescription", { rank: ruleToDelete.member_rank }) : ""}
        confirmLabel={t("deleteRebateConfirm")}
        cancelLabel={t("cancel")}
        onCancel={() => {
          if (!isDeletingRule) setRuleToDelete(null);
        }}
        onConfirm={async () => {
          if (!ruleToDelete) return;
          setIsDeletingRule(true);
          try {
            await deleteRebateRule(ruleToDelete.id);
            if (editDraft?.id === ruleToDelete.id) setEditDraft(null);
            setRuleToDelete(null);
            await load();
            onSuccess(t("rebateDeleted"));
          } catch (error) {
            onError(error instanceof Error ? error.message : t("saveError"));
          } finally {
            setIsDeletingRule(false);
          }
        }}
      />
    </div>
  );
}
