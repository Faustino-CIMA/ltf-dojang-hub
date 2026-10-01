"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { EntityTable } from "@/components/club-admin/entity-table";
import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/ui/filter-pills";
import { Input } from "@/components/ui/input";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import { getBeltTest, recordBeltResult, type PromotionCandidate } from "@/lib/training-api";

type Readiness = "all" | "ready" | "short";

export default function BeltTestPage() {
  const t = useTranslations("ClubAdmin");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { selectedClubId } = useClubSelection();
  const [name, setName] = useState("");
  const [heldOn, setHeldOn] = useState("");
  const [candidates, setCandidates] = useState<PromotionCandidate[] | null>(null);
  const [query, setQuery] = useState("");
  const [readiness, setReadiness] = useState<Readiness>("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    const data = await getBeltTest(selectedClubId, Number(params.id));
    setName(data.name);
    setHeldOn(data.held_on);
    setCandidates(data.candidates);
  }, [params.id, selectedClubId]);

  useEffect(() => {
    void load().catch((error: Error) => {
      setErrorMessage(error.message);
      setCandidates([]);
    });
  }, [load]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (candidates ?? []).filter((row) => {
      if (readiness === "ready" && !row.ready) return false;
      if (readiness === "short" && (row.ready || !row.required_hours)) return false;
      if (!needle) return true;
      return row.name.toLowerCase().includes(needle) || row.from_grade.toLowerCase().includes(needle);
    });
  }, [candidates, query, readiness]);

  const decide = async (memberId: number, result: "passed" | "failed") => {
    if (!selectedClubId) return;
    setBusyId(memberId);
    setSuccessMessage(null);
    try {
      await recordBeltResult(selectedClubId, Number(params.id), memberId, result);
      setErrorMessage(null);
      setSuccessMessage(result === "passed" ? t("trainingGradeSaved") : t("trainingResultSaved"));
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ClubAdminLayout title={name || t("navPromotion")} subtitle={heldOn}>
      {!selectedClubId ? (
        <EmptyState title={t("selectClubPlaceholder")} description={t("trainingChooseClub")} />
      ) : candidates === null ? (
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      ) : (
        <div className="space-y-4">
          <ActionNotices
            error={errorMessage}
            success={successMessage}
            onDismiss={() => {
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/${locale}/dashboard/club/promotion`)}>
              {t("navPromotion")}
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <Input
              className="w-full max-w-xs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("trainingSearchStudents")}
              aria-label={t("trainingSearchStudents")}
            />
            <FilterPills
              layout="wrap"
              ariaLabel={t("trainingPromotionFilter")}
              value={readiness}
              onChange={setReadiness}
              options={[
                { value: "all", title: t("filterAllTitle"), count: candidates.length },
                { value: "ready", title: t("trainingReady"), count: candidates.filter((row) => row.ready).length },
                { value: "short", title: t("trainingShort"), count: candidates.filter((row) => row.required_hours && !row.ready).length },
              ]}
            />
          </div>
          {shown.length === 0 ? (
            <EmptyState title={t("trainingNoCandidates")} description={t("trainingPromotionHint")} />
          ) : (
            <EntityTable
              rows={shown.map((row) => ({ id: row.member_id, ...row }))}
              columns={[
                { key: "name", header: t("trainingStudent") },
                { key: "age", header: t("trainingAgeColumn"), render: (row) => (row.age === null ? "—" : row.age) },
                { key: "from_grade", header: t("trainingCurrentGrade"), render: (row) => row.from_grade || "—" },
                { key: "to_grade", header: t("trainingNextGrade") },
                {
                  key: "hours",
                  header: t("trainingHoursSoFar"),
                  render: (row) => `${row.hours} h${row.required_hours ? ` / ${row.required_hours} h` : ""}`,
                },
                {
                  key: "since",
                  header: t("trainingSince"),
                  render: (row) => row.since || "—",
                },
                {
                  key: "ready",
                  header: t("trainingReady"),
                  render: (row) => (
                    <StatusBadge
                      label={row.result === "passed" ? t("trainingPassed") : row.result === "failed" ? t("trainingFailed") : row.required_hours ? (row.ready ? t("trainingReady") : t("trainingShort")) : t("trainingNoRule")}
                      tone={row.result === "passed" || row.ready ? "success" : row.result === "failed" ? "danger" : "warning"}
                    />
                  ),
                },
                {
                  key: "actions",
                  header: "",
                  render: (row) => (
                    row.result === "passed" ? null : (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="primary" disabled={busyId === row.member_id} onClick={() => void decide(row.member_id, "passed")}>
                          {t("trainingPass")}
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={busyId === row.member_id} onClick={() => void decide(row.member_id, "failed")}>
                          {t("trainingFail")}
                        </Button>
                      </div>
                    )
                  ),
                },
              ]}
            />
          )}
        </div>
      )}
    </ClubAdminLayout>
  );
}
