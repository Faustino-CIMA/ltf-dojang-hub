"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { EntityTable } from "@/components/club-admin/entity-table";
import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useCanManageTraining } from "@/components/club-admin/use-training-access";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createBeltTest,
  deletePromotionRule,
  getBeltTests,
  getPromotionRules,
  savePromotionRule,
  type BeltTestSummary,
  type PromotionRule,
  type TrainingAudience,
} from "@/lib/training-api";

const AUDIENCES: TrainingAudience[] = ["kids", "adults", "belt_test", "competition", "other"];

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function PromotionPage() {
  const t = useTranslations("ClubAdmin");
  const locale = useLocale();
  const router = useRouter();
  const canManage = useCanManageTraining();
  const { selectedClubId } = useClubSelection();
  const [grades, setGrades] = useState<string[]>([]);
  const [rules, setRules] = useState<PromotionRule[] | null>(null);
  const [tests, setTests] = useState<BeltTestSummary[] | null>(null);
  const [toGrade, setToGrade] = useState("9th Kup");
  const [hours, setHours] = useState("10");
  const [audience, setAudience] = useState("all");
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const ruleFormRef = useRef<HTMLFormElement>(null);
  const [testName, setTestName] = useState("");
  const [heldOn, setHeldOn] = useState(todayIso);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    try {
      const [rulePayload, testRows] = await Promise.all([
        getPromotionRules(selectedClubId),
        getBeltTests(selectedClubId),
      ]);
      setGrades(rulePayload.grades);
      setRules(rulePayload.rules);
      setTests(testRows);
      setToGrade((current) => (rulePayload.grades.includes(current) ? current : rulePayload.grades[0] || current));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
      setRules([]);
      setTests([]);
    }
  }, [selectedClubId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const audienceLabel = (value: string) => (value ? t(`trainingAudience_${value as TrainingAudience}`) : t("trainingHoursAll"));

  const saveRule = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedClubId) return;
    try {
      await savePromotionRule(
        selectedClubId,
        {
          to_grade: toGrade,
          required_hours: hours,
          audience: audience === "all" ? "" : audience,
        },
        editingRuleId ?? undefined,
      );
      setEditingRuleId(null);
      setSuccessMessage(t("trainingRuleSaved"));
      await load();
    } catch (error) {
      setSuccessMessage(null);
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    }
  };

  const beginEdit = (row: PromotionRule) => {
    setEditingRuleId(row.id);
    setToGrade(row.to_grade);
    setHours(row.required_hours);
    setAudience(row.audience || "all");
    setSuccessMessage(null);
    ruleFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const addTest = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedClubId) return;
    try {
      const created = await createBeltTest(selectedClubId, { name: testName, held_on: heldOn });
      setTestName("");
      setSuccessMessage(t("trainingBeltTestSaved"));
      router.push(`/${locale}/dashboard/club/promotion/${created.id}`);
    } catch (error) {
      setSuccessMessage(null);
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    }
  };

  if (!selectedClubId) {
    return (
      <ClubAdminLayout title={t("navPromotion")} subtitle={t("trainingPromotionHint")}>
        <EmptyState title={t("selectClubPlaceholder")} description={t("trainingChooseClub")} />
      </ClubAdminLayout>
    );
  }

  return (
    <ClubAdminLayout title={t("navPromotion")} subtitle={t("trainingPromotionHint")}>
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
          <h2 className="text-section text-foreground">{t("trainingRequiredHours")}</h2>
          <p className="mt-1 text-sm text-muted">{t("trainingPromotionHint")}</p>
          {canManage ? (
            <form ref={ruleFormRef} className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={(event) => void saveRule(event)}>
              <div>
                <Label>{t("trainingNextGrade")}</Label>
                <Select value={toGrade} onValueChange={setToGrade}>
                  <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {grades.map((grade) => (
                      <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("trainingRequiredHours")}</Label>
                <Input className="mt-1" inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} required />
              </div>
              <div>
                <Label>{t("trainingHoursCount")}</Label>
                <Select value={audience} onValueChange={setAudience}>
                  <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("trainingHoursAll")}</SelectItem>
                    {AUDIENCES.map((item) => (
                      <SelectItem key={item} value={item}>{t(`trainingAudience_${item}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" variant="primary">{editingRuleId ? t("trainingUpdateRule") : t("trainingSaveRule")}</Button>
                {editingRuleId ? (
                  <Button type="button" variant="outline" onClick={() => setEditingRuleId(null)}>
                    {t("cancelEdit")}
                  </Button>
                ) : null}
              </div>
            </form>
          ) : null}
          {rules === null ? (
            <div className="mt-4"><EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading /></div>
          ) : rules.length === 0 ? (
            <div className="mt-4"><EmptyState title={t("trainingNoRule")} description={t("trainingPromotionHint")} /></div>
          ) : (
            <div className="mt-4">
              <EntityTable
                rows={rules}
                columns={[
                  { key: "to_grade", header: t("trainingNextGrade") },
                  { key: "required_hours", header: t("trainingRequiredHours"), render: (row) => `${row.required_hours} h` },
                  { key: "audience", header: t("trainingHoursCount"), render: (row) => audienceLabel(row.audience) },
                  ...(canManage
                    ? [{
                        key: "actions",
                        header: "",
                        render: (row: PromotionRule) => (
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => beginEdit(row)}>
                              {t("editAction")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (!selectedClubId) return;
                                void deletePromotionRule(selectedClubId, row.id)
                                  .then(() => {
                                    if (editingRuleId === row.id) setEditingRuleId(null);
                                    return load();
                                  })
                                  .catch((error: Error) => setErrorMessage(error.message));
                              }}
                            >
                              {t("trainingRemove")}
                            </Button>
                          </div>
                        ),
                      }]
                    : []),
                ]}
              />
            </div>
          )}
        </FormPanel>
        <FormPanel>
          <h2 className="text-section text-foreground">{t("trainingBeltTests")}</h2>
          {canManage ? (
            <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={(event) => void addTest(event)}>
              <div>
                <Label>{t("trainingClassName")}</Label>
                <Input className="mt-1" value={testName} onChange={(event) => setTestName(event.target.value)} required />
              </div>
              <div>
                <Label>{t("trainingDate")}</Label>
                <Input className="mt-1" type="date" value={heldOn} onChange={(event) => setHeldOn(event.target.value)} required />
              </div>
              <div className="flex items-end">
                <Button type="submit" variant="primary">{t("trainingAddBeltTest")}</Button>
              </div>
            </form>
          ) : null}
          {tests === null ? null : tests.length === 0 ? (
            <div className="mt-4"><EmptyState title={t("trainingBeltTests")} description={t("trainingAddBeltTest")} /></div>
          ) : (
            <div className="mt-4">
              <EntityTable
                rows={tests}
                onRowClick={(row) => router.push(`/${locale}/dashboard/club/promotion/${row.id}`)}
                columns={[
                  { key: "held_on", header: t("trainingDate") },
                  { key: "name", header: t("trainingClassName") },
                  { key: "passed_count", header: t("trainingPassed"), render: (row) => t("trainingPassedCount", { count: row.passed_count }) },
                  {
                    key: "actions",
                    header: "",
                    render: (row) => (
                      <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/${locale}/dashboard/club/promotion/${row.id}`)}>
                        {t("trainingOpenTest")}
                      </Button>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </FormPanel>
      </div>
    </ClubAdminLayout>
  );
}
