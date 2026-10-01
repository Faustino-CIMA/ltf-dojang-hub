"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { EntityTable } from "@/components/club-admin/entity-table";
import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { StudentMultiPicker, type StudentPick } from "@/components/club-admin/student-multi-picker";
import { useCanManageTraining } from "@/components/club-admin/use-training-access";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { FilterPills } from "@/components/ui/filter-pills";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getClubTrainers, getMembersList, type Member } from "@/lib/club-admin-api";
import { getTrainingSeries, saveTrainingSeries, type TrainingAudience, type TrainingSeries } from "@/lib/training-api";

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const AUDIENCES: TrainingAudience[] = ["kids", "adults", "belt_test", "competition", "other"];

function personName(member: { first_name: string; last_name: string }) {
  return `${member.first_name} ${member.last_name}`.trim();
}

function ageToday(iso: string | null) {
  if (!iso) return null;
  const born = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  if (today.getMonth() < born.getMonth() || (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())) {
    age -= 1;
  }
  return age;
}

export default function TrainingTimetablePage() {
  const t = useTranslations("ClubAdmin");
  const canManage = useCanManageTraining();
  const { selectedClubId } = useClubSelection();
  const [rows, setRows] = useState<TrainingSeries[] | null>(null);
  const [coaches, setCoaches] = useState<{ user_id: number; first_name: string; last_name: string }[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<TrainingAudience>("kids");
  const [weekday, setWeekday] = useState("0");
  const [startTime, setStartTime] = useState("17:00");
  const [endTime, setEndTime] = useState("18:30");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [skipPublic, setSkipPublic] = useState(true);
  const [skipSchool, setSkipSchool] = useState(true);
  const [countsUnder16, setCountsUnder16] = useState(true);
  const [place, setPlace] = useState("");
  const [coachIds, setCoachIds] = useState<number[]>([]);
  const [regularIds, setRegularIds] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRegulars, setEditRegulars] = useState<number[]>([]);
  const [editCountsUnder16, setEditCountsUnder16] = useState(false);
  const [editPlace, setEditPlace] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [audienceFilter, setAudienceFilter] = useState<"all" | TrainingAudience>("all");
  const [editingClassId, setEditingClassId] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    try {
      const series = await getTrainingSeries(selectedClubId);
      setRows(series);
      if (canManage) {
        const [trainerRows, people] = await Promise.all([
          getClubTrainers(selectedClubId),
          getMembersList({ clubId: selectedClubId, isActive: true }),
        ]);
        setCoaches(trainerRows.trainers);
        setMembers(people.filter((row) => row.club === selectedClubId && row.is_active));
      }
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
      setRows([]);
    }
  }, [canManage, selectedClubId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const picksExcept = (taken: number[]): StudentPick[] =>
    members
      .filter((member) => !taken.includes(member.id))
      .map((member) => ({ id: member.id, label: personName(member), age: ageToday(member.date_of_birth) }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedClubId) return;
    setIsSaving(true);
    try {
      await saveTrainingSeries(selectedClubId, {
        name,
        audience,
        weekday: Number(weekday),
        start_time: startTime,
        end_time: endTime,
        valid_from: validFrom,
        valid_until: validUntil,
        skip_public_holidays: skipPublic,
        skip_school_holidays: skipSchool,
        counts_for_under_16: countsUnder16,
        place,
        coach_ids: coachIds,
        regular_ids: regularIds,
      }, editingClassId ?? undefined);
      setName("");
      setRegularIds([]);
      setPlace("");
      setCoachIds([]);
      setCountsUnder16(true);
      setAudience("kids");
      setEditingClassId(null);
      setErrorMessage(null);
      setSuccessMessage(editingClassId ? t("trainingClassSaved") : t("trainingClassAdded"));
      await load();
    } catch (error) {
      setSuccessMessage(null);
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const saveRegulars = async (seriesId: number) => {
    if (!selectedClubId) return;
    setIsSaving(true);
    try {
      await saveTrainingSeries(selectedClubId, {
        regular_ids: editRegulars,
        counts_for_under_16: editCountsUnder16,
        place: editPlace,
      }, seriesId);
      setEditingId(null);
      setErrorMessage(null);
      setSuccessMessage(t("trainingRegularsSaved"));
      await load();
    } catch (error) {
      setSuccessMessage(null);
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const openRegulars = (row: TrainingSeries) => {
    setEditingId(row.id);
    setEditRegulars(row.regular_ids);
    setEditCountsUnder16(row.counts_for_under_16);
    setEditPlace(row.place || "");
  };

  const beginEditClass = (row: TrainingSeries) => {
    setEditingId(null);
    setEditingClassId(row.id);
    setName(row.name);
    setAudience(row.audience);
    setWeekday(String(row.weekday));
    setStartTime(row.start_time.slice(0, 5));
    setEndTime(row.end_time.slice(0, 5));
    setValidFrom(row.valid_from);
    setValidUntil(row.valid_until);
    setSkipPublic(row.skip_public_holidays);
    setSkipSchool(row.skip_school_holidays);
    setCountsUnder16(row.counts_for_under_16);
    setPlace(row.place || "");
    setCoachIds(row.coach_ids);
    setRegularIds(row.regular_ids);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      if (audienceFilter !== "all" && row.audience !== audienceFilter) return false;
      if (!needle) return true;
      const coachesText = (row.coach_names ?? []).join(" ").toLowerCase();
      return row.name.toLowerCase().includes(needle) || coachesText.includes(needle);
    });
  }, [audienceFilter, rows, search]);

  const editing = rows?.find((row) => row.id === editingId) ?? null;

  const skipsLabel = (row: TrainingSeries) => {
    const parts = [
      row.skip_public_holidays ? t("trainingSkipsPublicShort") : "",
      row.skip_school_holidays ? t("trainingSkipsSchoolShort") : "",
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : t("trainingSkipsNone");
  };

  return (
    <ClubAdminLayout title={t("trainingTitle")} subtitle={t("trainingTimetable")}>
      {!selectedClubId ? (
        <EmptyState title={t("selectClubPlaceholder")} description={t("trainingChooseClub")} />
      ) : (
        <div className="space-y-6">
          <ActionNotices
            error={errorMessage}
            success={successMessage}
            onDismiss={() => {
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
          />
          {canManage ? (
            <FormPanel>
            <h2 className="text-section text-foreground">{editingClassId ? t("trainingEditClass") : t("trainingAddClass")}</h2>
            <form ref={formRef} className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
              <div>
                <Label>{t("trainingClassName")}</Label>
                <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} required />
              </div>
              <div>
                <Label>{t("trainingAudience")}</Label>
                <Select value={audience} onValueChange={(value) => {
                  const next = value as TrainingAudience;
                  setAudience(next);
                  setCountsUnder16(next === "kids");
                }}>
                  <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCES.map((item) => (
                      <SelectItem key={item} value={item}>{t(`trainingAudience_${item}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("trainingWeekday")}</Label>
                <Select value={weekday} onValueChange={setWeekday}>
                  <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS.map((day) => (
                      <SelectItem key={day} value={String(day)}>{t(`trainingDay_${day}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("trainingStarts")}</Label>
                  <Input className="mt-1" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
                </div>
                <div>
                  <Label>{t("trainingEnds")}</Label>
                  <Input className="mt-1" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
                </div>
              </div>
              <div>
                <Label>{t("subsidiesFrom")}</Label>
                <Input className="mt-1" type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} required />
              </div>
              <div>
                <Label>{t("subsidiesTo")}</Label>
                <Input className="mt-1" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} required />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={skipPublic} onChange={(event) => setSkipPublic(event.target.checked)} />
                {t("trainingSkipPublic")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={skipSchool} onChange={(event) => setSkipSchool(event.target.checked)} />
                {t("trainingSkipSchool")}
              </label>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input type="checkbox" checked={countsUnder16} onChange={(event) => setCountsUnder16(event.target.checked)} />
                <span>
                  {t("trainingCountsUnder16")}
                  <span className="mt-0.5 block text-xs text-muted">{t("trainingCountsUnder16Hint")}</span>
                </span>
              </label>
              <div className="md:col-span-2">
                <Label>{t("trainingPlace")}</Label>
                <Input className="mt-1" value={place} onChange={(event) => setPlace(event.target.value)} placeholder={t("trainingPlaceHint")} />
              </div>
              <div className="md:col-span-2">
                <p className="text-sm font-medium">{t("trainingUsualCoaches")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {coaches.map((coach) => {
                    const on = coachIds.includes(coach.user_id);
                    return (
                      <button
                        key={coach.user_id}
                        type="button"
                        onClick={() => setCoachIds((current) => (on ? current.filter((id) => id !== coach.user_id) : [...current, coach.user_id]))}
                        className={`rounded-[var(--radius-form)] border px-3 py-2 text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                      >
                        {personName(coach)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm font-medium">{t("trainingRegulars")}</p>
                <p className="mt-1 text-xs text-muted">{t("trainingRegularsHint")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {regularIds.map((id) => {
                    const member = memberById.get(id);
                    if (!member) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setRegularIds((current) => current.filter((item) => item !== id))}
                        className="rounded-[var(--radius-form)] border border-primary bg-primary px-3 py-2 text-sm text-primary-foreground"
                      >
                        {personName(member)}
                      </button>
                    );
                  })}
                </div>
                <StudentMultiPicker
                  options={picksExcept(regularIds)}
                  showAgeFilter
                  onAdd={(ids) => setRegularIds((current) => Array.from(new Set([...current, ...ids])))}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="primary" disabled={isSaving}>
                  {isSaving ? t("saving") : editingClassId ? t("trainingUpdateRule") : t("trainingAddClass")}
                </Button>
                {editingClassId ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingClassId(null);
                      setName("");
                      setRegularIds([]);
                      setCoachIds([]);
                      setPlace("");
                      setCountsUnder16(true);
                      setAudience("kids");
                    }}
                  >
                    {t("cancelEdit")}
                  </Button>
                ) : null}
              </div>
            </form>
            </FormPanel>
          ) : null}
          {rows === null ? (
            <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
          ) : rows.length === 0 ? (
            <EmptyState title={t("trainingNoClassesYet")} description={t("trainingNoClassesYetHint")} />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
                <div className="min-w-[12rem] flex-1">
                  <Input
                    className="w-full max-w-xs"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("trainingSearchClasses")}
                    aria-label={t("trainingSearchClasses")}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <FilterPills
                    layout="wrap"
                    ariaLabel={t("trainingFilterAudience")}
                    value={audienceFilter}
                    onChange={setAudienceFilter}
                    options={[
                      { value: "all", title: t("filterAllTitle"), count: rows.length },
                      ...AUDIENCES.map((item) => ({
                        value: item,
                        title: t(`trainingAudience_${item}`),
                        count: rows.filter((row) => row.audience === item).length,
                      })),
                    ]}
                  />
                </div>
              </div>
              {visibleRows.length === 0 ? (
                <EmptyState title={t("trainingNoClasses")} description={t("trainingNoClassesHint")} />
              ) : (
                <EntityTable
                  rows={visibleRows}
                  onRowClick={canManage ? openRegulars : undefined}
                  columns={[
                    { key: "name", header: t("trainingClassName") },
                    {
                      key: "weekday",
                      header: t("trainingWeekday"),
                      render: (row) => t(`trainingDay_${row.weekday}`),
                    },
                    {
                      key: "time",
                      header: t("trainingTime"),
                      render: (row) => `${row.start_time}–${row.end_time}`,
                    },
                    {
                      key: "audience",
                      header: t("trainingAudience"),
                      render: (row) => t(`trainingAudience_${row.audience}`),
                    },
                    {
                      key: "season",
                      header: t("trainingSeason"),
                      render: (row) => `${row.valid_from} – ${row.valid_until}`,
                    },
                    {
                      key: "coaches",
                      header: t("trainingCoachesColumn"),
                      render: (row) => (row.coach_names ?? []).join(", ") || "—",
                    },
                    {
                      key: "students",
                      header: t("trainingStudentsColumn"),
                      render: (row) => row.regular_ids.length,
                    },
                    {
                      key: "under16",
                      header: t("subsidiesUnder16"),
                      render: (row) => (row.counts_for_under_16 ? "✓" : "—"),
                    },
                    {
                      key: "place",
                      header: t("trainingPlace"),
                      render: (row) => row.place || "—",
                    },
                    {
                      key: "skips",
                      header: t("trainingSkips"),
                      render: (row) => skipsLabel(row),
                    },
                    ...(canManage
                      ? [
                          {
                            key: "actions",
                            header: "",
                            render: (row: TrainingSeries) => (
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => beginEditClass(row)}>
                                  {t("editAction")}
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => openRegulars(row)}>
                                  {t("trainingRegulars")}
                                </Button>
                              </div>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              )}
              {canManage && editing ? (
                <FormPanel>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-section text-foreground">{editing.name} · {t("trainingRegulars")}</h2>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)}>
                      {t("trainingClosePanel")}
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted">{t("trainingRegularsHint")}</p>
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editCountsUnder16} onChange={(event) => setEditCountsUnder16(event.target.checked)} />
                    {t("trainingCountsUnder16")}
                  </label>
                  <div className="mt-3 max-w-md">
                    <Label>{t("trainingPlace")}</Label>
                    <Input className="mt-1" value={editPlace} onChange={(event) => setEditPlace(event.target.value)} placeholder={t("trainingPlaceHint")} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {editRegulars.map((id) => {
                      const member = memberById.get(id);
                      if (!member) return null;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setEditRegulars((current) => current.filter((item) => item !== id))}
                          className="rounded-[var(--radius-form)] border border-primary bg-primary px-3 py-2 text-sm text-primary-foreground"
                        >
                          {personName(member)}
                        </button>
                      );
                    })}
                  </div>
                  <StudentMultiPicker
                    options={picksExcept(editRegulars)}
                    showAgeFilter
                    onAdd={(ids) => setEditRegulars((current) => Array.from(new Set([...current, ...ids])))}
                  />
                  <Button className="mt-3" type="button" variant="primary" disabled={isSaving} onClick={() => void saveRegulars(editing.id)}>
                    {isSaving ? t("saving") : t("trainingSaveRegulars")}
                  </Button>
                </FormPanel>
              ) : null}
            </>
          )}
        </div>
      )}
    </ClubAdminLayout>
  );
}
