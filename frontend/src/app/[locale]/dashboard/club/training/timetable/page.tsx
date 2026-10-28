"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { EntityTable } from "@/components/club-admin/entity-table";
import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { StudentMultiPicker, type StudentPick } from "@/components/club-admin/student-multi-picker";
import { TrainingVenueField } from "@/components/club-admin/training-venue-field";
import { timetablePlaceText } from "@/components/club-admin/training-venue-picker";
import { useCanManageTraining } from "@/components/club-admin/use-training-access";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterPills } from "@/components/ui/filter-pills";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { PopoverSelect } from "@/components/ui/popover-select";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import { getClubTrainers, getMembersList, type Member } from "@/lib/club-admin-api";
import { formatFullName } from "@/lib/person-name";
import { getTrainingSeries, saveTrainingSeries, type TrainingAudience, type TrainingSeries } from "@/lib/training-api";
import { listTrainingVenues, type TrainingVenue } from "@/lib/training-venues";

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const AUDIENCES: TrainingAudience[] = ["kids", "adults", "belt_test", "competition", "other"];
const FORM_ID = "training-class-form";

function personName(member: { first_name: string; last_name: string }) {
  return formatFullName(member);
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
  const common = useTranslations("Common");
  const canManage = useCanManageTraining();
  const { selectedClubId } = useClubSelection();
  const [rows, setRows] = useState<TrainingSeries[] | null>(null);
  const [coaches, setCoaches] = useState<{ user_id: number; first_name: string; last_name: string }[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [classOpen, setClassOpen] = useState(false);
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
  const [venueId, setVenueId] = useState<number | null>(null);
  const [venueName, setVenueName] = useState("");
  const [venues, setVenues] = useState<TrainingVenue[] | null>(null);
  const [venueLoadFailed, setVenueLoadFailed] = useState(false);
  const [coachIds, setCoachIds] = useState<number[]>([]);
  const [regularIds, setRegularIds] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [audienceFilter, setAudienceFilter] = useState<"all" | TrainingAudience>("all");
  const [editingClassId, setEditingClassId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    setVenues(null);
    setVenueLoadFailed(false);
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
        try {
          setVenues(await listTrainingVenues(selectedClubId));
          setErrorMessage(null);
        } catch (error) {
          setVenues(null);
          setVenueLoadFailed(true);
          setErrorMessage(error instanceof Error ? error.message : t("trainingVenueLoadError"));
        }
      } else {
        setErrorMessage(null);
      }
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

  const resetClassForm = () => {
    setEditingClassId(null);
    setName("");
    setAudience("kids");
    setWeekday("0");
    setStartTime("17:00");
    setEndTime("18:30");
    setValidFrom("");
    setValidUntil("");
    setSkipPublic(true);
    setSkipSchool(true);
    setCountsUnder16(true);
    setPlace("");
    setVenueId(null);
    setVenueName("");
    setCoachIds([]);
    setRegularIds([]);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedClubId) return;
    setIsSaving(true);
    const wasEditing = editingClassId !== null;
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
        place: venueId == null ? place : "",
        venue_id: venueId,
        coach_ids: coachIds,
        regular_ids: regularIds,
      }, editingClassId ?? undefined);
      setClassOpen(false);
      resetClassForm();
      setErrorMessage(null);
      setSuccessMessage(wasEditing ? t("trainingClassSaved") : t("trainingClassAdded"));
      await load();
    } catch (error) {
      setSuccessMessage(null);
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const beginEditClass = (row: TrainingSeries) => {
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
    setPlace(row.venue_id ? "" : row.place || "");
    setVenueId(row.venue_id);
    setVenueName(row.venue_name || "");
    setCoachIds(row.coach_ids);
    setRegularIds(row.regular_ids);
    setClassOpen(true);
  };

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      if (audienceFilter !== "all" && row.audience !== audienceFilter) return false;
      if (!needle) return true;
      const coachesText = (row.coach_names ?? []).join(" ").toLowerCase();
      const placeText = timetablePlaceText(row).toLowerCase();
      return row.name.toLowerCase().includes(needle) || coachesText.includes(needle) || placeText.includes(needle);
    });
  }, [audienceFilter, rows, search]);

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
        <div className="space-y-3">
          <ActionNotices
            error={errorMessage}
            success={successMessage}
            onDismiss={() => {
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
          />
          {canManage ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  resetClassForm();
                  setClassOpen(true);
                }}
              >
                {t("trainingAddClass")}
              </Button>
            </div>
          ) : null}
          {rows === null ? (
            <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
          ) : rows.length === 0 ? (
            <EmptyState title={t("trainingNoClassesYet")} description={t("trainingNoClassesYetHint")} />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3">
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
                  onRowClick={canManage ? beginEditClass : undefined}
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
                      render: (row) => timetablePlaceText(row) || "—",
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
                              <RowActionMenu
                                label={common("rowActionsLabel")}
                                actions={[{ key: "edit", label: t("editAction"), onSelect: () => beginEditClass(row) }]}
                              />
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              )}
            </>
          )}
          <SidePanel
            open={classOpen}
            wide
            title={editingClassId ? t("trainingEditClass") : t("trainingAddClass")}
            closeLabel={t("cancelEdit")}
            onClose={() => setClassOpen(false)}
            footer={
              <>
                <Button type="button" variant="outline" onClick={() => setClassOpen(false)} disabled={isSaving}>
                  {t("cancelEdit")}
                </Button>
                <Button type="submit" form={FORM_ID} variant="primary" disabled={isSaving}>
                  {isSaving ? t("saving") : editingClassId ? t("trainingUpdateRule") : t("trainingAddClass")}
                </Button>
              </>
            }
          >
            <form id={FORM_ID} className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
              <div>
                <Label htmlFor="class-name" required>
                  {t("trainingClassName")}
                </Label>
                <Input id="class-name" className="mt-1" value={name} onChange={(event) => setName(event.target.value)} required />
              </div>
              <div>
                <Label>{t("trainingAudience")}</Label>
                <PopoverSelect
                  className="mt-1 w-full"
                  value={audience}
                  onValueChange={(value) => {
                    const next = value as TrainingAudience;
                    setAudience(next);
                    setCountsUnder16(next === "kids");
                  }}
                  ariaLabel={t("trainingAudience")}
                  options={AUDIENCES.map((item) => ({ value: item, label: t(`trainingAudience_${item}`) }))}
                />
              </div>
              <div>
                <Label>{t("trainingWeekday")}</Label>
                <PopoverSelect
                  className="mt-1 w-full"
                  value={weekday}
                  onValueChange={setWeekday}
                  ariaLabel={t("trainingWeekday")}
                  options={DAYS.map((day) => ({ value: String(day), label: t(`trainingDay_${day}`) }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="class-start" required>
                    {t("trainingStarts")}
                  </Label>
                  <Input id="class-start" className="mt-1" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="class-end" required>
                    {t("trainingEnds")}
                  </Label>
                  <Input id="class-end" className="mt-1" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
                </div>
              </div>
              <div>
                <Label htmlFor="class-from" required>
                  {t("subsidiesFrom")}
                </Label>
                <Input id="class-from" className="mt-1" type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} required />
              </div>
              <div>
                <Label htmlFor="class-until" required>
                  {t("subsidiesTo")}
                </Label>
                <Input id="class-until" className="mt-1" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} required />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={skipPublic} onCheckedChange={(checked) => setSkipPublic(checked === true)} />
                {t("trainingSkipPublic")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={skipSchool} onCheckedChange={(checked) => setSkipSchool(checked === true)} />
                {t("trainingSkipSchool")}
              </label>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <Checkbox checked={countsUnder16} onCheckedChange={(checked) => setCountsUnder16(checked === true)} />
                <span>
                  {t("trainingCountsUnder16")}
                  <span className="mt-0.5 block text-xs text-muted">{t("trainingCountsUnder16Hint")}</span>
                </span>
              </label>
              <div className="md:col-span-2">
                <TrainingVenueField
                  venues={venues}
                  loadFailed={venueLoadFailed}
                  venueId={venueId}
                  place={place}
                  knownName={venueName}
                  onChange={(choice) => {
                    setVenueId(choice.venueId);
                    setVenueName(choice.venueId == null ? "" : choice.place);
                    setPlace(choice.venueId == null ? choice.place : "");
                  }}
                />
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
            </form>
          </SidePanel>
        </div>
      )}
    </ClubAdminLayout>
  );
}
