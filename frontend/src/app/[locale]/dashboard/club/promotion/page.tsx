"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { EntityTable } from "@/components/club-admin/entity-table";
import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useCanManageTraining } from "@/components/club-admin/use-training-access";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { DeleteConfirmModal } from "@/components/ui/delete-confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import { PopoverSelect } from "@/components/ui/popover-select";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
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
const RULE_FORM_ID = "promotion-rule-form";

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function PromotionPage() {
  const t = useTranslations("ClubAdmin");
  const common = useTranslations("Common");
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
  const [ruleOpen, setRuleOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [pendingRule, setPendingRule] = useState<PromotionRule | null>(null);
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
      setRuleOpen(false);
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
    setRuleOpen(true);
  };

  const openNewRule = () => {
    setEditingRuleId(null);
    setHours("10");
    setAudience("all");
    setSuccessMessage(null);
    setRuleOpen(true);
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
      <div className="space-y-3">
        <ActionNotices
          error={errorMessage}
          success={successMessage}
          onDismiss={() => {
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
        />
        <FormPanel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-section text-foreground">{t("trainingRequiredHours")}</h2>
            {canManage ? (
              <Button type="button" variant="primary" onClick={openNewRule}>
                {t("trainingSaveRule")}
              </Button>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted">{t("trainingPromotionHint")}</p>
          {rules === null ? (
            <div className="mt-3"><EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading /></div>
          ) : rules.length === 0 ? (
            <div className="mt-3"><EmptyState title={t("trainingNoRule")} description={t("trainingPromotionHint")} /></div>
          ) : (
            <div className="mt-3">
              <EntityTable
                rows={rules}
                onRowClick={canManage ? beginEdit : undefined}
                columns={[
                  { key: "to_grade", header: t("trainingNextGrade") },
                  { key: "required_hours", header: t("trainingRequiredHours"), render: (row) => `${row.required_hours} h` },
                  { key: "audience", header: t("trainingHoursCount"), render: (row) => audienceLabel(row.audience) },
                  ...(canManage
                    ? [{
                        key: "actions",
                        header: "",
                        render: (row: PromotionRule) => (
                          <RowActionMenu
                            label={common("rowActionsLabel")}
                            actions={[
                              { key: "edit", label: t("editAction"), onSelect: () => beginEdit(row) },
                              {
                                key: "delete",
                                label: t("deleteAction"),
                                destructive: true,
                                onSelect: () => setPendingRule(row),
                              },
                            ]}
                          />
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
                <Label required>{t("trainingClassName")}</Label>
                <Input className="mt-1" value={testName} onChange={(event) => setTestName(event.target.value)} required />
              </div>
              <div>
                <Label required>{t("trainingDate")}</Label>
                <Input className="mt-1" type="date" value={heldOn} onChange={(event) => setHeldOn(event.target.value)} required />
              </div>
              <div className="flex items-end">
                <Button type="submit" variant="primary">{t("trainingAddBeltTest")}</Button>
              </div>
            </form>
          ) : null}
          {tests === null ? null : tests.length === 0 ? (
            <div className="mt-3"><EmptyState title={t("trainingBeltTests")} description={t("trainingAddBeltTest")} /></div>
          ) : (
            <div className="mt-3">
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
        <SidePanel
          open={ruleOpen}
          title={editingRuleId ? t("trainingUpdateRule") : t("trainingSaveRule")}
          closeLabel={t("cancelEdit")}
          onClose={() => setRuleOpen(false)}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setRuleOpen(false)}>
                {t("cancelEdit")}
              </Button>
              <Button type="submit" form={RULE_FORM_ID} variant="primary">
                {editingRuleId ? t("trainingUpdateRule") : t("trainingSaveRule")}
              </Button>
            </>
          }
        >
          <form id={RULE_FORM_ID} className="grid gap-3" onSubmit={(event) => void saveRule(event)}>
            <div>
              <Label>{t("trainingNextGrade")}</Label>
              <PopoverSelect
                className="mt-1 w-full"
                value={toGrade}
                onValueChange={setToGrade}
                ariaLabel={t("trainingNextGrade")}
                options={grades.map((grade) => ({ value: grade, label: grade }))}
              />
            </div>
            <div>
              <Label htmlFor="promotion-hours" required>
                {t("trainingRequiredHours")}
              </Label>
              <Input id="promotion-hours" className="mt-1" inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} required />
            </div>
            <div>
              <Label>{t("trainingHoursCount")}</Label>
              <PopoverSelect
                className="mt-1 w-full"
                value={audience}
                onValueChange={setAudience}
                ariaLabel={t("trainingHoursCount")}
                options={[
                  { value: "all", label: t("trainingHoursAll") },
                  ...AUDIENCES.map((item) => ({ value: item, label: t(`trainingAudience_${item}`) })),
                ]}
              />
            </div>
          </form>
        </SidePanel>
        <DeleteConfirmModal
          isOpen={pendingRule !== null}
          title={t("deleteAction")}
          description={common("deleteDescriptionWithName", { name: pendingRule?.to_grade ?? "" })}
          confirmLabel={common("deleteConfirmButton")}
          cancelLabel={common("deleteCancelButton")}
          onCancel={() => setPendingRule(null)}
          onConfirm={() => {
            if (!selectedClubId || !pendingRule) return;
            void deletePromotionRule(selectedClubId, pendingRule.id)
              .then(() => {
                if (editingRuleId === pendingRule.id) {
                  setEditingRuleId(null);
                  setRuleOpen(false);
                }
                setPendingRule(null);
                return load();
              })
              .catch((error: Error) => {
                setPendingRule(null);
                setErrorMessage(error.message);
              });
          }}
        />
      </div>
    </ClubAdminLayout>
  );
}
