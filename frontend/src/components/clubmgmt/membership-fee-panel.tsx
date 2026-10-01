"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { Button } from "@/components/ui/button";
import { DeleteConfirmModal } from "@/components/ui/delete-confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormPanel } from "@/components/ui/list-page-chrome";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDisplayDate } from "@/lib/date-display";
import {
  addMembershipFeePrice,
  createFee,
  createRebateRule,
  deleteFee,
  listFees,
  listRebateRules,
  updateFee,
  updateRebateRule,
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
};

type Props = {
  clubId: number;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

function rebatePayload(clubId: number, rank: string, kind: RebateKind, value: string) {
  return {
    club: clubId,
    member_rank: Number(rank),
    percent_off: kind === "percent" ? value : "0",
    amount_off: kind === "amount" ? value : null,
  };
}

function RebateFields({
  idPrefix,
  rank,
  kind,
  value,
  onRank,
  onKind,
  onValue,
  autoFocus,
}: {
  idPrefix: string;
  rank: string;
  kind: RebateKind;
  value: string;
  onRank: (value: string) => void;
  onKind: (value: RebateKind) => void;
  onValue: (value: string) => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations("ClubMgmt");
  return (
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
  );
}

export function MembershipFeePanel({ clubId, onSuccess, onError }: Props) {
  const t = useTranslations("ClubMgmt");
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [rules, setRules] = useState<RebateRule[]>([]);
  const [feeName, setFeeName] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [isSavingFee, setIsSavingFee] = useState(false);
  const [rank, setRank] = useState("2");
  const [rebateKind, setRebateKind] = useState<RebateKind>("percent");
  const [rebateValue, setRebateValue] = useState("10");
  const [editDraft, setEditDraft] = useState<RebateDraft | null>(null);
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [feeDraft, setFeeDraft] = useState<FeeDraft | null>(null);
  const [feeToDelete, setFeeToDelete] = useState<FeeRow | null>(null);
  const [isDeletingFee, setIsDeletingFee] = useState(false);
  const [priceDrafts, setPriceDrafts] = useState<Record<number, { amount: string; effectiveFrom: string }>>({});

  const load = async () => {
    try {
      const [nextFees, nextRules] = await Promise.all([listFees(clubId), listRebateRules(clubId)]);
      setFees(nextFees);
      setRules(nextRules);
    } catch (error) {
      onError(error instanceof Error ? error.message : t("loadError"));
    }
  };

  useEffect(() => {
    void load();
  }, [clubId]);

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
                        aria-expanded={feeDraft?.id === fee.id}
                        onClick={() => {
                          if (feeDraft?.id === fee.id) {
                            setFeeDraft(null);
                            return;
                          }
                          setFeeDraft({ id: fee.id, name: fee.name, amount: fee.amount });
                        }}
                      >
                        {t("editItem")}
                      </Button>
                      <Button type="button" variant="destructive" size="sm" onClick={() => setFeeToDelete(fee)}>
                        {t("deleteFee")}
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
                  <div className="grid gap-3 md:grid-cols-3">
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
                    <div className="flex items-end">
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
                </div>
              </article>
            );
          })}
        </div>
      )}

      <FormPanel>
        <h2 className="text-section text-foreground">{t("rebateRules")}</h2>
        <p className="mt-1 text-sm text-muted">{t("rebateRulesSubtitle")}</p>
        <div className="mt-4">
          <RebateFields
            idPrefix="rebate"
            rank={rank}
            kind={rebateKind}
            value={rebateValue}
            onRank={setRank}
            onKind={setRebateKind}
            onValue={setRebateValue}
          />
        </div>
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            disabled={isSavingRule}
            onClick={async () => {
              setIsSavingRule(true);
              try {
                await createRebateRule(rebatePayload(clubId, rank, rebateKind, rebateValue));
                setRank("2");
                setRebateKind("percent");
                setRebateValue("10");
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
              key: "actions",
              header: "",
              render: (row: RebateRule) => {
                const open = editDraft?.id === row.id;
                return (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
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
                      });
                    }}
                  >
                    {t("editItem")}
                  </Button>
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
                  autoFocus
                  onRank={(value) => setEditDraft((current) => (current ? { ...current, rank: value } : current))}
                  onKind={(kind) => setEditDraft((current) => (current ? { ...current, kind } : current))}
                  onValue={(value) => setEditDraft((current) => (current ? { ...current, value } : current))}
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSavingRule}
                    onClick={async () => {
                      setIsSavingRule(true);
                      try {
                        await updateRebateRule(
                          row.id,
                          rebatePayload(clubId, editDraft.rank, editDraft.kind, editDraft.value),
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
    </div>
  );
}
