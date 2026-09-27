"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDisplayDate } from "@/lib/date-display";
import {
  BankMatchCandidate,
  BankStatement,
  BankStatementLine,
} from "@/lib/ltf-finance-api";

export function BankStatementWorkspace({
  statement,
  canMutate,
  onMatch,
  onUnmatch,
  onIgnore,
  onComplete,
  loadSuggestions,
}: {
  statement: BankStatement;
  canMutate: boolean;
  onMatch: (input: { line: number; kind: string; id: number }) => Promise<void>;
  onUnmatch: (line: number) => Promise<void>;
  onIgnore: (line: number) => Promise<void>;
  onComplete: () => Promise<void>;
  loadSuggestions: (line: number) => Promise<BankMatchCandidate[]>;
}) {
  const t = useTranslations("LtfFinance");
  const [suggestions, setSuggestions] = useState<Record<number, BankMatchCandidate[]>>({});
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [busyLine, setBusyLine] = useState<number | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isOpen = statement.status === "open";
  const lines = statement.lines ?? [];
  const summary = statement.summary;

  useEffect(() => {
    let cancelled = false;
    const unmatched = lines.filter((line) => line.status === "unmatched");
    void Promise.all(
      unmatched.map(async (line) => {
        const candidates = await loadSuggestions(line.id);
        return [line.id, candidates] as const;
      })
    )
      .then((pairs) => {
        if (cancelled) return;
        setSuggestions(Object.fromEntries(pairs));
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : t("bankLoadError"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [lines, loadSuggestions, t]);

  const statusMeta = useMemo(() => {
    return statement.status === "completed"
      ? { label: t("bankStatusCompleted"), tone: "success" as const }
      : { label: t("bankStatusOpen"), tone: "warning" as const };
  }, [statement.status, t]);

  const handleMatch = async (line: BankStatementLine) => {
    const value = selected[line.id];
    if (!value) {
      setErrorMessage(t("bankMatchRequiredError"));
      return;
    }
    const [kind, id] = value.split(":");
    setBusyLine(line.id);
    setErrorMessage(null);
    try {
      await onMatch({ line: line.id, kind, id: Number(id) });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("bankMatchError"));
    } finally {
      setBusyLine(null);
    }
  };

  return (
    <div className="space-y-6">
      <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
      <FormPanel>
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t("bankStatementNumberLabel")}</span>
            <span className="font-medium">{statement.statement_number}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t("statusLabel")}</span>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t("bankPeriodLabel")}</span>
            <span className="font-medium">
              {formatDisplayDate(statement.period_start)} – {formatDisplayDate(statement.period_end)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t("bankUnmatchedLabel")}</span>
            <span className="font-medium">{summary?.unmatched_count ?? statement.unmatched_count ?? 0}</span>
          </div>
        </div>
        {canMutate && isOpen ? (
          <div className="mt-4">
            <Button
              type="button"
              variant="primary"
              disabled={isCompleting}
              onClick={async () => {
                setIsCompleting(true);
                setErrorMessage(null);
                try {
                  await onComplete();
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : t("bankCompleteError"));
                } finally {
                  setIsCompleting(false);
                }
              }}
            >
              {isCompleting ? t("savingAction") : t("completeStatementAction")}
            </Button>
          </div>
        ) : null}
      </FormPanel>

      {lines.length === 0 ? (
        <EmptyState title={t("bankLinesEmptyTitle")} description={t("bankLinesEmptySubtitle")} />
      ) : (
        <EntityTable
          columns={[
            {
              key: "booked_on",
              header: t("bankDateLabel"),
              render: (row: BankStatementLine) => formatDisplayDate(row.booked_on),
            },
            {
              key: "direction",
              header: t("bankDirectionLabel"),
              render: (row: BankStatementLine) =>
                row.direction === "credit" ? t("bankCreditLabel") : t("bankDebitLabel"),
            },
            { key: "amount", header: t("expenseAmountLabel") },
            { key: "description", header: t("incomeDescriptionLabel") },
            { key: "reference", header: t("paymentReferenceLabel") },
            {
              key: "status",
              header: t("statusLabel"),
              render: (row: BankStatementLine) => (
                <StatusBadge
                  label={
                    row.status === "matched"
                      ? t("bankStatusMatched")
                      : row.status === "ignored"
                        ? t("bankStatusIgnored")
                        : t("bankStatusUnmatched")
                  }
                  tone={row.status === "matched" ? "success" : row.status === "ignored" ? "neutral" : "warning"}
                />
              ),
            },
            {
              key: "match",
              header: t("bankMatchLabel"),
              render: (row: BankStatementLine) => {
                if (row.status === "matched") {
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{row.match_label || row.match_kind}</span>
                      {canMutate && isOpen ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busyLine === row.id}
                          onClick={() => void onUnmatch(row.id)}
                        >
                          {t("unmatchAction")}
                        </Button>
                      ) : null}
                    </div>
                  );
                }
                if (!canMutate || !isOpen || row.status === "ignored") {
                  return row.status === "ignored" ? t("bankStatusIgnored") : "—";
                }
                const candidates = suggestions[row.id] ?? [];
                return (
                  <div className="flex min-w-[16rem] flex-col gap-2">
                    {candidates.length > 0 ? (
                      <Select
                        value={selected[row.id]}
                        onValueChange={(value) => setSelected((current) => ({ ...current, [row.id]: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("bankSelectMatchPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {candidates.map((candidate) => (
                            <SelectItem key={`${candidate.kind}-${candidate.id}`} value={`${candidate.kind}:${candidate.id}`}>
                              {candidate.label} · {candidate.amount}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted">{t("bankSelectMatchPlaceholder")}</span>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={busyLine === row.id}
                        onClick={() => void handleMatch(row)}
                      >
                        {t("matchAction")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyLine === row.id}
                        onClick={() => void onIgnore(row.id)}
                      >
                        {t("ignoreLineAction")}
                      </Button>
                    </div>
                  </div>
                );
              },
            },
          ]}
          rows={lines}
        />
      )}
    </div>
  );
}
