"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { EntityTable } from "@/components/club-admin/entity-table";
import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useCanManageTraining } from "@/components/club-admin/use-training-access";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { DeleteConfirmModal } from "@/components/ui/delete-confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import { addSchoolHoliday, deleteSchoolHoliday, getTrainingHolidays } from "@/lib/training-api";

const FORM_ID = "school-holiday-form";

type SchoolHoliday = { id: number; name: string; starts_on: string; ends_on: string };

export default function TrainingHolidaysPage() {
  const t = useTranslations("ClubAdmin");
  const common = useTranslations("Common");
  const canManage = useCanManageTraining();
  const { selectedClubId } = useClubSelection();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [publicHolidays, setPublicHolidays] = useState<{ date: string; name: string }[]>([]);
  const [school, setSchool] = useState<SchoolHoliday[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SchoolHoliday | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    setLoading(true);
    try {
      const data = await getTrainingHolidays(selectedClubId, Number(year) || new Date().getFullYear());
      setPublicHolidays(data.public);
      setSchool(data.school);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [selectedClubId, t, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeAdd = () => {
    setAddOpen(false);
    setName("");
    setStartsOn("");
    setEndsOn("");
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedClubId) return;
    try {
      await addSchoolHoliday(selectedClubId, {
        name,
        starts_on: startsOn,
        ends_on: endsOn,
        school_year: Number(year),
      });
      closeAdd();
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    }
  };

  const confirmRemove = async () => {
    if (!selectedClubId || !pendingDelete) return;
    try {
      await deleteSchoolHoliday(selectedClubId, pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (error) {
      setPendingDelete(null);
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    }
  };

  return (
    <ClubAdminLayout title={t("trainingTitle")} subtitle={t("trainingHolidays")}>
      {!selectedClubId ? (
        <EmptyState title={t("selectClubPlaceholder")} description={t("trainingChooseClub")} />
      ) : (
        <div className="space-y-3">
          <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-xs rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <Label htmlFor="holiday-year">{t("subsidiesYear")}</Label>
              <Input id="holiday-year" className="mt-1" value={year} onChange={(event) => setYear(event.target.value)} />
            </div>
            {canManage ? (
              <Button type="button" variant="primary" onClick={() => setAddOpen(true)}>
                {t("trainingAddHoliday")}
              </Button>
            ) : null}
          </div>
          {loading ? (
            <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-3">
                <h2 className="text-section text-foreground">{t("trainingPublicHolidays")}</h2>
                {publicHolidays.length === 0 ? (
                  <EmptyState title={t("trainingNoHolidays")} description={t("trainingPublicHolidays")} />
                ) : (
                  <EntityTable
                    rows={publicHolidays.map((row) => ({ id: row.date, ...row }))}
                    columns={[
                      { key: "date", header: t("trainingDate") },
                      { key: "name", header: t("trainingHolidayName") },
                    ]}
                  />
                )}
              </div>
              <div className="space-y-3">
                <h2 className="text-section text-foreground">{t("trainingSchoolHolidays")}</h2>
                {school.length === 0 ? (
                  <EmptyState title={t("trainingNoHolidays")} description={t("trainingSchoolHolidays")} />
                ) : (
                  <EntityTable
                    rows={school}
                    columns={[
                      { key: "name", header: t("trainingHolidayName") },
                      { key: "starts_on", header: t("subsidiesFrom") },
                      { key: "ends_on", header: t("subsidiesTo") },
                      ...(canManage
                        ? [
                            {
                              key: "actions",
                              header: "",
                              render: (row: SchoolHoliday) => (
                                <RowActionMenu
                                  label={common("rowActionsLabel")}
                                  actions={[
                                    {
                                      key: "delete",
                                      label: t("trainingRemove"),
                                      destructive: true,
                                      onSelect: () => setPendingDelete(row),
                                    },
                                  ]}
                                />
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
              </div>
            </div>
          )}
          <SidePanel
            open={addOpen}
            title={t("trainingAddHoliday")}
            closeLabel={t("cancelEdit")}
            onClose={closeAdd}
            footer={
              <>
                <Button type="button" variant="outline" onClick={closeAdd}>
                  {t("cancelEdit")}
                </Button>
                <Button type="submit" form={FORM_ID} variant="primary">
                  {t("trainingAddHoliday")}
                </Button>
              </>
            }
          >
            <form id={FORM_ID} className="grid gap-3" onSubmit={(event) => void onSubmit(event)}>
              <div>
                <Label htmlFor="holiday-name" required>
                  {t("trainingHolidayName")}
                </Label>
                <Input id="holiday-name" className="mt-1" value={name} onChange={(event) => setName(event.target.value)} required />
              </div>
              <div>
                <Label htmlFor="holiday-from" required>
                  {t("subsidiesFrom")}
                </Label>
                <Input id="holiday-from" className="mt-1" type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} required />
              </div>
              <div>
                <Label htmlFor="holiday-to" required>
                  {t("subsidiesTo")}
                </Label>
                <Input id="holiday-to" className="mt-1" type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} required />
              </div>
            </form>
          </SidePanel>
          <DeleteConfirmModal
            isOpen={pendingDelete !== null}
            title={t("trainingRemove")}
            description={t("trainingRemoveHolidayConfirm")}
            confirmLabel={t("trainingRemove")}
            cancelLabel={t("cancelEdit")}
            listItems={pendingDelete ? [`${pendingDelete.name} · ${pendingDelete.starts_on} – ${pendingDelete.ends_on}`] : []}
            onCancel={() => setPendingDelete(null)}
            onConfirm={() => void confirmRemove()}
          />
        </div>
      )}
    </ClubAdminLayout>
  );
}
