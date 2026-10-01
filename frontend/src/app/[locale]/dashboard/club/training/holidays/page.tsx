"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { EntityTable } from "@/components/club-admin/entity-table";
import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useCanManageTraining } from "@/components/club-admin/use-training-access";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import { addSchoolHoliday, deleteSchoolHoliday, getTrainingHolidays } from "@/lib/training-api";

export default function TrainingHolidaysPage() {
  const t = useTranslations("ClubAdmin");
  const canManage = useCanManageTraining();
  const { selectedClubId } = useClubSelection();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [publicHolidays, setPublicHolidays] = useState<{ date: string; name: string }[]>([]);
  const [school, setSchool] = useState<{ id: number; name: string; starts_on: string; ends_on: string }[]>([]);
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
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
      setName("");
      setStartsOn("");
      setEndsOn("");
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    }
  };

  const remove = async (id: number) => {
    if (!selectedClubId || !window.confirm(t("trainingRemoveHolidayConfirm"))) return;
    try {
      await deleteSchoolHoliday(selectedClubId, id);
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    }
  };

  return (
    <ClubAdminLayout title={t("trainingTitle")} subtitle={t("trainingHolidays")}>
      {!selectedClubId ? (
        <EmptyState title={t("selectClubPlaceholder")} description={t("trainingChooseClub")} />
      ) : (
        <div className="space-y-6">
          <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
          <div className="max-w-xs rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <Label>{t("subsidiesYear")}</Label>
            <Input className="mt-1" value={year} onChange={(event) => setYear(event.target.value)} />
          </div>
          {loading ? (
            <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
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
                              render: (row: { id: number }) => (
                                <Button type="button" variant="outline" size="sm" onClick={() => void remove(row.id)}>
                                  {t("trainingRemove")}
                                </Button>
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
                {canManage ? (
                  <FormPanel>
                    <h2 className="text-section text-foreground">{t("trainingAddHoliday")}</h2>
                    <form className="mt-4 grid gap-3" onSubmit={(event) => void onSubmit(event)}>
                      <div>
                        <Label>{t("trainingHolidayName")}</Label>
                        <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} required />
                      </div>
                      <div>
                        <Label>{t("subsidiesFrom")}</Label>
                        <Input className="mt-1" type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} required />
                      </div>
                      <div>
                        <Label>{t("subsidiesTo")}</Label>
                        <Input className="mt-1" type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} required />
                      </div>
                      <Button type="submit" variant="outline">{t("trainingAddHoliday")}</Button>
                    </form>
                  </FormPanel>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </ClubAdminLayout>
  );
}
