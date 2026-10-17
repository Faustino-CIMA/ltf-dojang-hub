"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { getClubs, getMembersList, type Member } from "@/lib/ltf-admin-api";
import {
  deleteAthleteStatus,
  deleteNationalTeamStaff,
  deleteSquadSelection,
  getAthleteStatuses,
  getNationalTeamLevels,
  getNationalTeamSeasons,
  getNationalTeamSettings,
  getNationalTeamSquads,
  getNationalTeamStaff,
  getSquadSelections,
  saveAthleteStatus,
  saveNationalTeamLevel,
  saveNationalTeamSeason,
  saveNationalTeamSettings,
  saveNationalTeamSquad,
  saveNationalTeamStaff,
  saveSquadSelection,
  type AthleteStatusRow,
  type NationalTeamLevel,
  type NationalTeamSeason,
  type NationalTeamSettings,
  type NationalTeamSquad,
  type NationalTeamStaffRow,
  type SquadSelectionRow,
} from "@/lib/national-team-api";
import { formatFullName } from "@/lib/person-name";
import { type TableSort } from "@/lib/table-sort";

const AGE_CLASSES = ["youth", "cadet", "junior", "senior"] as const;
const COSL_PATHWAYS = ["elite", "promotion"] as const;
const COSL_RANKS = ["P1", "P2", "P3", "P4", "P5", "P6"] as const;
const COSL_PROJECTS = ["olympic", "qualification", "elite"] as const;
const SUPPORTS = ["sportlycee", "ssea"] as const;
const STAFF_FUNCTIONS = [
  "national_coach",
  "sportlycee_coach",
  "technical_director",
  "physiotherapist",
  "photographer",
  "other",
] as const;

type PanelMode =
  | "add-selection"
  | "edit-selection"
  | "end-selection"
  | "delete-selection"
  | "status"
  | "add-staff"
  | "end-staff"
  | "delete-staff"
  | "add-squad"
  | "add-level"
  | "add-season"
  | null;

export type NationalTeamPreview = {
  seasons: NationalTeamSeason[];
  squads: NationalTeamSquad[];
  clubs: { id: number; name: string }[];
  levels: NationalTeamLevel[];
  selections: SquadSelectionRow[];
  staff: NationalTeamStaffRow[];
  settings: NationalTeamSettings;
  statuses?: AthleteStatusRow[];
  members?: Member[];
};

function ageKey(value: string) {
  if (value === "youth") return "nationalTeamAgeYouth";
  if (value === "cadet") return "nationalTeamAgeCadet";
  if (value === "junior") return "nationalTeamAgeJunior";
  if (value === "senior") return "nationalTeamAgeSenior";
  return "";
}

function staffKey(value: string) {
  if (value === "national_coach") return "nationalTeamStaffNationalCoach";
  if (value === "sportlycee_coach") return "nationalTeamStaffSportlyceeCoach";
  if (value === "technical_director") return "nationalTeamStaffTechnicalDirector";
  if (value === "physiotherapist") return "nationalTeamStaffPhysiotherapist";
  if (value === "photographer") return "nationalTeamStaffPhotographer";
  if (value === "other") return "nationalTeamStaffOther";
  return "";
}

function supportKey(value: string) {
  if (value === "sportlycee") return "nationalTeamSupportSportlycee";
  if (value === "ssea") return "nationalTeamSupportSsea";
  return "";
}

function pathwayKey(value: string) {
  if (value === "elite") return "nationalTeamCoslElite";
  if (value === "promotion") return "nationalTeamCoslPromotion";
  return "";
}

function projectKey(value: string) {
  if (value === "olympic") return "nationalTeamProjectOlympic";
  if (value === "qualification") return "nationalTeamProjectQualification";
  if (value === "elite") return "nationalTeamProjectElite";
  return "";
}

function translateCode(t: (key: string) => string, key: string, fallback: string) {
  return key ? t(key) : fallback;
}

export function formatCosl(t: (key: string) => string, cosl: SquadSelectionRow["cosl"]) {
  if (!cosl) return "-";
  return `${translateCode(t, pathwayKey(cosl.pathway), cosl.pathway)} ${cosl.rank} · ${translateCode(t, projectKey(cosl.project), cosl.project)}`;
}

function knownError(t: (key: string) => string, error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  const codes: Record<string, string> = {
    club_member_required: "nationalTeamClubMemberRequired",
    outside_season: "nationalTeamOutsideSeason",
    end_before_start: "nationalTeamEndBeforeStart",
    same_squad_overlap: "nationalTeamSameSquad",
    squad_overlap_forbidden: "nationalTeamOverlapForbidden",
    level_inactive: "nationalTeamLevelInactive",
    level_required: "nationalTeamLevelRequired",
    cosl_incomplete: "nationalTeamCoslIncomplete",
    support_required: "nationalTeamSupportRequired",
    status_overlap: "nationalTeamStatusOverlap",
    staff_overlap: "nationalTeamStaffOverlap",
    weight_required: "nationalTeamWeightRequired",
  };
  for (const [code, key] of Object.entries(codes)) {
    if (raw.includes(code)) return t(key);
  }
  return raw || t("nationalTeamSaveError");
}

export function NationalTeamDesk({
  canManage,
  preview,
}: {
  canManage: boolean;
  preview?: NationalTeamPreview;
}) {
  const t = useTranslations("LtfAdmin");
  const [tab, setTab] = useState<"selections" | "staff" | "levels">("selections");
  const [seasons, setSeasons] = useState<NationalTeamSeason[]>(preview?.seasons ?? []);
  const [squads, setSquads] = useState<NationalTeamSquad[]>(preview?.squads ?? []);
  const [clubs, setClubs] = useState<{ id: number; name: string }[]>(preview?.clubs ?? []);
  const [levels, setLevels] = useState<NationalTeamLevel[]>(preview?.levels ?? []);
  const [rows, setRows] = useState<SquadSelectionRow[]>(preview?.selections ?? []);
  const [staff, setStaff] = useState<NationalTeamStaffRow[]>(preview?.staff ?? []);
  const [settings, setSettings] = useState<NationalTeamSettings>(
    preview?.settings ?? { forbid_overlapping_squads: false }
  );
  const [statuses, setStatuses] = useState<AthleteStatusRow[]>(preview?.statuses ?? []);
  const [seasonId, setSeasonId] = useState(preview?.seasons[0] ? String(preview.seasons[0].id) : "");
  const [squadId, setSquadId] = useState("");
  const [clubId, setClubId] = useState("");
  const [sort, setSort] = useState<TableSort | null>({ key: "name", direction: "asc" });
  const [loading, setLoading] = useState(!preview);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelMode>(null);
  const [selected, setSelected] = useState<SquadSelectionRow | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<NationalTeamStaffRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (preview) return;
    setErrorMessage(null);
    try {
      const [seasonRows, squadRows, levelRows, staffRows, settingRow, clubRows] = await Promise.all([
        getNationalTeamSeasons(),
        getNationalTeamSquads(),
        getNationalTeamLevels(),
        getNationalTeamStaff(),
        getNationalTeamSettings(),
        getClubs(),
      ]);
      setSeasons(seasonRows);
      setSquads(squadRows);
      setLevels(levelRows);
      setStaff(staffRows);
      setSettings(settingRow);
      setClubs(clubRows.map((club) => ({ id: club.id, name: club.name })));
      setSeasonId((current) => current || (seasonRows[0] ? String(seasonRows[0].id) : ""));
    } catch (error) {
      setErrorMessage(knownError(t, error));
    } finally {
      setLoading(false);
    }
  }, [preview, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadSelections = useCallback(async () => {
    if (preview || !seasonId) return;
    try {
      const selectionRows = await getSquadSelections({
        season: Number(seasonId),
        squad: squadId ? Number(squadId) : undefined,
        club: clubId ? Number(clubId) : undefined,
      });
      setRows(selectionRows);
    } catch (error) {
      setErrorMessage(knownError(t, error));
    }
  }, [clubId, preview, seasonId, squadId, t]);

  useEffect(() => {
    void loadSelections();
  }, [loadSelections]);

  const season = seasons.find((item) => String(item.id) === seasonId) ?? null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setErrorMessage(null);
    try {
      await action();
      setPanel(null);
      if (preview) return;
      await load();
      await loadSelections();
    } catch (error) {
      setErrorMessage(knownError(t, error));
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: t("nationalTeamName"),
        sortable: true,
        sortValue: (row: SquadSelectionRow) => `${row.person.last_name} ${row.person.first_name}`,
        render: (row: SquadSelectionRow) => (
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{formatFullName(row.person)}</span>
            {row.is_captain ? <StatusBadge label={t("nationalTeamCaptain")} tone="info" /> : null}
          </span>
        ),
      },
      {
        key: "club",
        header: t("nationalTeamClub"),
        sortable: true,
        sortValue: (row: SquadSelectionRow) => row.club_name,
        render: (row: SquadSelectionRow) => row.club_name || t("nationalTeamNoClub"),
      },
      {
        key: "squad",
        header: t("nationalTeamSquad"),
        sortable: true,
        sortValue: (row: SquadSelectionRow) => row.squad_name,
        render: (row: SquadSelectionRow) => row.squad_name,
      },
      {
        key: "age",
        header: t("nationalTeamAgeClass"),
        sortable: true,
        sortValue: (row: SquadSelectionRow) => row.age_class,
        render: (row: SquadSelectionRow) => translateCode(t, ageKey(row.age_class), row.age_class),
      },
      {
        key: "weight",
        header: t("nationalTeamWeight"),
        sortable: true,
        sortValue: (row: SquadSelectionRow) => row.weight_category,
        render: (row: SquadSelectionRow) => row.weight_category,
      },
      {
        key: "level",
        header: t("nationalTeamLevel"),
        sortable: true,
        sortValue: (row: SquadSelectionRow) => row.ltf_level?.name ?? "",
        render: (row: SquadSelectionRow) => row.ltf_level?.name || "-",
      },
      {
        key: "cosl",
        header: t("nationalTeamCosl"),
        sortable: true,
        sortValue: (row: SquadSelectionRow) => row.cosl?.rank ?? "",
        render: (row: SquadSelectionRow) => formatCosl(t, row.cosl),
      },
      {
        key: "support",
        header: t("nationalTeamSupport"),
        sortable: true,
        sortValue: (row: SquadSelectionRow) => row.support ?? "",
        render: (row: SquadSelectionRow) =>
          row.support ? translateCode(t, supportKey(row.support), row.support) : "-",
      },
      ...(canManage
        ? [
            {
              key: "actions",
              header: <span className="sr-only">{t("nationalTeamRowActions")}</span>,
              render: (row: SquadSelectionRow) => (
                <RowActionMenu
                  label={t("nationalTeamRowActions")}
                  actions={[
                    { key: "edit", label: t("nationalTeamEdit"), onSelect: () => { setSelected(row); setPanel("edit-selection"); } },
                    { key: "end", label: t("nationalTeamEnd"), onSelect: () => { setSelected(row); setPanel("end-selection"); } },
                    { key: "status", label: t("nationalTeamStatus"), onSelect: () => { setSelected(row); setStatuses(preview?.statuses?.filter((item) => item.member === row.member) ?? []); setPanel("status"); if (!preview) void getAthleteStatuses(row.member).then(setStatuses).catch(() => setStatuses([])); } },
                    { key: "delete", label: t("nationalTeamDelete"), destructive: true, onSelect: () => { setSelected(row); setPanel("delete-selection"); } },
                  ]}
                />
              ),
            },
          ]
        : []),
    ],
    [canManage, preview, t]
  );

  return (
    <div className="space-y-6">
      <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
      <UnderlineTabs
        ariaLabel={t("nationalTeamTabs")}
        idPrefix="national-team"
        value={tab}
        onChange={setTab}
        options={[
          { value: "selections", label: t("nationalTeamTabSelections") },
          { value: "staff", label: t("nationalTeamTabStaff") },
          { value: "levels", label: t("nationalTeamTabLevels") },
        ]}
      />
      {loading ? (
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      ) : tab === "selections" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <FilterField label={t("nationalTeamSeason")}>
              <PopoverSelect
                ariaLabel={t("nationalTeamSeason")}
                value={seasonId}
                onValueChange={setSeasonId}
                options={seasons.map((item) => ({ value: String(item.id), label: String(item.year) }))}
              />
            </FilterField>
            <FilterField label={t("nationalTeamSquad")}>
              <PopoverSelect
                ariaLabel={t("nationalTeamSquad")}
                value={squadId}
                onValueChange={setSquadId}
                options={[
                  { value: "", label: t("nationalTeamAllSquads") },
                  ...squads.map((item) => ({ value: String(item.id), label: item.name })),
                ]}
              />
            </FilterField>
            <FilterField label={t("nationalTeamClub")}>
              <PopoverSelect
                ariaLabel={t("nationalTeamClub")}
                value={clubId}
                onValueChange={setClubId}
                options={[
                  { value: "", label: t("nationalTeamAllClubs") },
                  ...clubs.map((item) => ({ value: String(item.id), label: item.name })),
                ]}
                searchable
                searchPlaceholder={t("nationalTeamClub")}
              />
            </FilterField>
            {canManage ? (
              <div className="ml-auto flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setPanel("add-squad")}>
                  {t("nationalTeamAddSquad")}
                </Button>
                <Button type="button" onClick={() => { setSelected(null); setPanel("add-selection"); }}>
                  {t("nationalTeamAddSelection")}
                </Button>
              </div>
            ) : null}
          </div>
          {rows.length === 0 ? (
            <EmptyState title={t("nationalTeamEmptyTitle")} description={t("nationalTeamEmptySubtitle")} />
          ) : (
            <EntityTable columns={columns} rows={rows} sort={sort} onSortChange={setSort} clientSort />
          )}
        </div>
      ) : tab === "staff" ? (
        <StaffSection
          staff={staff}
          squads={squads}
          canManage={canManage}
          onAdd={() => { setSelectedStaff(null); setPanel("add-staff"); }}
          onEnd={(row) => { setSelectedStaff(row); setPanel("end-staff"); }}
          onDelete={(row) => { setSelectedStaff(row); setPanel("delete-staff"); }}
        />
      ) : (
        <LevelsSection
          levels={levels}
          season={season}
          settings={settings}
          canManage={canManage}
          onAddLevel={() => setPanel("add-level")}
          onAddSeason={() => setPanel("add-season")}
          onToggle={async (value) => {
            if (preview) {
              setSettings({ forbid_overlapping_squads: value });
              return;
            }
            await run(async () => {
              setSettings(await saveNationalTeamSettings({ forbid_overlapping_squads: value }));
            });
          }}
          onToggleLevel={async (level) => {
            await run(async () => {
              if (preview) return;
              await saveNationalTeamLevel(level.id, { is_active: !level.is_active });
            });
          }}
          onSaveSeason={async (starts, ends) => {
            if (!season) return;
            await run(async () => {
              if (preview) return;
              await saveNationalTeamSeason(season.id, { starts_on: starts, ends_on: ends });
            });
          }}
        />
      )}
      <SelectionPanel
        mode={panel}
        selection={selected}
        season={season}
        squads={squads}
        levels={levels}
        statuses={statuses}
        members={preview?.members}
        busy={busy}
        onClose={() => setPanel(null)}
        onSaveSelection={(input) => run(() => saveSquadSelection(selected && panel !== "add-selection" ? selected.id : null, input).then(() => undefined))}
        onDelete={() => selected && run(() => deleteSquadSelection(selected.id).then(() => undefined))}
        onSaveStatus={(input) => run(async () => { await saveAthleteStatus(null, input); })}
        onEndStatus={(row, endedOn) => run(() => saveAthleteStatus(row.id, { ended_on: endedOn }).then(() => undefined))}
        onDeleteStatus={(row) => run(() => deleteAthleteStatus(row.id).then(() => undefined))}
      />
      <StaffPanel
        mode={panel}
        role={selectedStaff}
        squads={squads}
        members={preview?.members}
        busy={busy}
        onClose={() => setPanel(null)}
        onSave={(input) => run(() => saveNationalTeamStaff(panel === "add-staff" ? null : selectedStaff?.id ?? null, input).then(() => undefined))}
        onDelete={() => selectedStaff && run(() => deleteNationalTeamStaff(selectedStaff.id).then(() => undefined))}
      />
      <SquadPanel open={panel === "add-squad"} busy={busy} onClose={() => setPanel(null)} onSave={(name) => run(() => saveNationalTeamSquad({ name, discipline: "kyorugi" }).then(() => undefined))} />
      <LevelPanel open={panel === "add-level"} busy={busy} onClose={() => setPanel(null)} onSave={(input) => run(() => saveNationalTeamLevel(null, input).then(() => undefined))} />
      <SeasonPanel open={panel === "add-season"} busy={busy} onClose={() => setPanel(null)} onSave={(input) => run(() => saveNationalTeamSeason(null, input).then(() => undefined))} />
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-40 space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StaffSection({
  staff,
  squads,
  canManage,
  onAdd,
  onEnd,
  onDelete,
}: {
  staff: NationalTeamStaffRow[];
  squads: NationalTeamSquad[];
  canManage: boolean;
  onAdd: () => void;
  onEnd: (row: NationalTeamStaffRow) => void;
  onDelete: (row: NationalTeamStaffRow) => void;
}) {
  const t = useTranslations("LtfAdmin");
  const squadName = (id: number | null) => squads.find((item) => item.id === id)?.name || t("nationalTeamAllSquads");
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canManage ? (
          <Button type="button" onClick={onAdd}>
            {t("nationalTeamStaffAdd")}
          </Button>
        ) : null}
      </div>
      {staff.length === 0 ? (
        <EmptyState title={t("nationalTeamStaffEmptyTitle")} description={t("nationalTeamStaffEmptySubtitle")} />
      ) : (
        <EntityTable
          rows={staff}
          columns={[
            { key: "name", header: t("nationalTeamName"), render: (row) => formatFullName(row.person) },
            { key: "function", header: t("nationalTeamStaffFunction"), render: (row) => translateCode(t, staffKey(row.function), row.function) },
            { key: "squad", header: t("nationalTeamSquad"), render: (row) => squadName(row.squad) },
            { key: "start", header: t("nationalTeamStart"), render: (row) => row.started_on },
            { key: "end", header: t("nationalTeamEnd"), render: (row) => row.ended_on || t("nationalTeamOpenEnded") },
            ...(canManage
              ? [
                  {
                    key: "actions",
                    header: <span className="sr-only">{t("nationalTeamRowActions")}</span>,
                    render: (row: NationalTeamStaffRow) => (
                      <RowActionMenu
                        label={t("nationalTeamRowActions")}
                        actions={[
                          { key: "end", label: t("nationalTeamEnd"), onSelect: () => onEnd(row) },
                          { key: "delete", label: t("nationalTeamDelete"), destructive: true, onSelect: () => onDelete(row) },
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
  );
}

function SeasonDates(props: {
  season: NationalTeamSeason | null;
  canManage: boolean;
  onAddSeason: () => void;
  onSaveSeason: (starts: string, ends: string) => void;
}) {
  const t = useTranslations("LtfAdmin");
  return (
    <div className="app-panel space-y-3 p-4">
      <h2 className="text-section text-foreground">{t("nationalTeamSeasonDates")}</h2>
      <p className="text-sm text-muted">{t("nationalTeamSeasonDatesHint")}</p>
      {props.season ? (
        <SeasonDateFields
          key={`${props.season.id}:${props.season.starts_on}:${props.season.ends_on}`}
          season={props.season}
          canManage={props.canManage}
          onSaveSeason={props.onSaveSeason}
        />
      ) : null}
      {props.canManage ? (
        <Button type="button" variant="outline" onClick={props.onAddSeason}>
          {t("nationalTeamAddSeason")}
        </Button>
      ) : null}
    </div>
  );
}

function SeasonDateFields(props: {
  season: NationalTeamSeason;
  canManage: boolean;
  onSaveSeason: (starts: string, ends: string) => void;
}) {
  const t = useTranslations("LtfAdmin");
  const [starts, setStarts] = useState(props.season.starts_on);
  const [ends, setEnds] = useState(props.season.ends_on);
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="season-start">{t("nationalTeamSeasonStart")}</Label>
          <Input id="season-start" type="date" value={starts} disabled={!props.canManage} onChange={(event) => setStarts(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="season-end">{t("nationalTeamSeasonEnd")}</Label>
          <Input id="season-end" type="date" value={ends} disabled={!props.canManage} onChange={(event) => setEnds(event.target.value)} />
        </div>
      </div>
      {props.canManage ? (
        <Button type="button" variant="outline" onClick={() => props.onSaveSeason(starts, ends)}>
          {t("nationalTeamSaveSeason")}
        </Button>
      ) : null}
    </>
  );
}

function LevelsSection(props: {
  levels: NationalTeamLevel[];
  season: NationalTeamSeason | null;
  settings: NationalTeamSettings;
  canManage: boolean;
  onAddLevel: () => void;
  onAddSeason: () => void;
  onToggle: (value: boolean) => void;
  onToggleLevel: (level: NationalTeamLevel) => void;
  onSaveSeason: (starts: string, ends: string) => void;
}) {
  const t = useTranslations("LtfAdmin");
  return (
    <div className="space-y-6">
      <div className="app-panel space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="forbid-overlap"
            checked={props.settings.forbid_overlapping_squads}
            disabled={!props.canManage}
            onCheckedChange={(value) => props.onToggle(Boolean(value))}
          />
          <div>
            <Label htmlFor="forbid-overlap">{t("nationalTeamForbidOverlap")}</Label>
            <p className="text-sm text-muted">{t("nationalTeamForbidOverlapHint")}</p>
          </div>
        </div>
      </div>
      <SeasonDates
        season={props.season}
        canManage={props.canManage}
        onAddSeason={props.onAddSeason}
        onSaveSeason={props.onSaveSeason}
      />
      <div className="flex justify-end">
        {props.canManage ? (
          <Button type="button" onClick={props.onAddLevel}>
            {t("nationalTeamLevelAdd")}
          </Button>
        ) : null}
      </div>
      <EntityTable
        rows={props.levels}
        columns={[
          { key: "code", header: t("nationalTeamLevelCode"), render: (row) => row.code },
          { key: "name", header: t("nationalTeamLevelName"), render: (row) => row.name },
          {
            key: "active",
            header: t("nationalTeamLevelActive"),
            render: (row) => (
              <StatusBadge
                label={row.is_active ? t("nationalTeamLevelActive") : t("nationalTeamLevelInactive")}
                tone={row.is_active ? "success" : "neutral"}
              />
            ),
          },
          ...(props.canManage
            ? [
                {
                  key: "actions",
                  header: <span className="sr-only">{t("nationalTeamRowActions")}</span>,
                  render: (row: NationalTeamLevel) => (
                    <Button type="button" variant="outline" onClick={() => props.onToggleLevel(row)}>
                      {row.is_active ? t("nationalTeamDeactivate") : t("nationalTeamActivate")}
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

function SelectionPanel(props: {
  mode: PanelMode;
  selection: SquadSelectionRow | null;
  season: NationalTeamSeason | null;
  squads: NationalTeamSquad[];
  levels: NationalTeamLevel[];
  statuses: AthleteStatusRow[];
  members?: Member[];
  busy: boolean;
  onClose: () => void;
  onSaveSelection: (input: Record<string, unknown>) => void;
  onDelete: () => void;
  onSaveStatus: (input: Record<string, unknown>) => void;
  onEndStatus: (row: AthleteStatusRow, endedOn: string) => void;
  onDeleteStatus: (row: AthleteStatusRow) => void;
}) {
  const t = useTranslations("LtfAdmin");
  const open = props.mode === "add-selection" || props.mode === "edit-selection" || props.mode === "end-selection" || props.mode === "delete-selection" || props.mode === "status";
  if (!open) return null;
  const title = {
    "add-selection": t("nationalTeamAddSelection"),
    "edit-selection": t("nationalTeamEdit"),
    "end-selection": t("nationalTeamEnd"),
    "delete-selection": t("nationalTeamDelete"),
    status: t("nationalTeamStatus"),
  }[props.mode as "add-selection" | "edit-selection" | "end-selection" | "delete-selection" | "status"];
  return (
    <SidePanel open title={title} description={t("nationalTeamSelectionHint")} closeLabel={t("nationalTeamClose")} onClose={props.onClose}>
      {props.mode === "delete-selection" ? (
        <div className="space-y-4">
          <p className="text-sm text-foreground">{t("nationalTeamDeleteHint")}</p>
          <Button type="button" variant="destructive" disabled={props.busy} onClick={props.onDelete}>
            {t("nationalTeamDelete")}
          </Button>
        </div>
      ) : null}
      {props.mode === "end-selection" && props.selection ? (
        <EndDateForm
          initial={props.selection.ended_on || props.season?.ends_on || ""}
          busy={props.busy}
          onSave={(endedOn) => props.onSaveSelection({ ended_on: endedOn })}
        />
      ) : null}
      {(props.mode === "add-selection" || props.mode === "edit-selection") && props.season ? (
        <SelectionForm
          selection={props.mode === "edit-selection" ? props.selection : null}
          season={props.season}
          squads={props.squads}
          members={props.members}
          busy={props.busy}
          onSave={props.onSaveSelection}
        />
      ) : null}
      {props.mode === "status" && props.selection ? (
        <StatusHistory
          memberId={props.selection.member}
          levels={props.levels}
          statuses={props.statuses}
          busy={props.busy}
          onSave={props.onSaveStatus}
          onEnd={props.onEndStatus}
          onDelete={props.onDeleteStatus}
        />
      ) : null}
    </SidePanel>
  );
}

function SelectionForm({
  selection,
  season,
  squads,
  members,
  busy,
  onSave,
}: {
  selection: SquadSelectionRow | null;
  season: NationalTeamSeason;
  squads: NationalTeamSquad[];
  members?: Member[];
  busy: boolean;
  onSave: (input: Record<string, unknown>) => void;
}) {
  const t = useTranslations("LtfAdmin");
  const [memberId, setMemberId] = useState(selection ? String(selection.member) : "");
  const [squad, setSquad] = useState(selection ? String(selection.squad) : String(squads[0]?.id ?? ""));
  const [age, setAge] = useState(selection?.age_class || "senior");
  const [weight, setWeight] = useState(selection?.weight_category || "");
  const [captain, setCaptain] = useState(selection?.is_captain || false);
  const [started, setStarted] = useState(selection?.started_on || season.starts_on);
  const [ended, setEnded] = useState(selection?.ended_on || "");
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          member: Number(memberId),
          squad: Number(squad),
          season: season.id,
          age_class: age,
          weight_category: weight,
          is_captain: captain,
          started_on: started,
          ended_on: ended || null,
        });
      }}
    >
      <MemberSearch roster="club" members={members} value={memberId} onChange={setMemberId} />
      <div className="space-y-2">
        <Label>{t("nationalTeamSquad")}</Label>
        <PopoverSelect ariaLabel={t("nationalTeamSquad")} value={squad} onValueChange={setSquad} options={squads.filter((item) => item.is_active).map((item) => ({ value: String(item.id), label: item.name }))} />
      </div>
      <div className="space-y-2">
        <Label>{t("nationalTeamAgeClass")}</Label>
        <PopoverSelect ariaLabel={t("nationalTeamAgeClass")} value={age} onValueChange={setAge} options={AGE_CLASSES.map((value) => ({ value, label: translateCode(t, ageKey(value), value) }))} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="selection-weight">{t("nationalTeamWeight")}</Label>
        <Input id="selection-weight" value={weight} onChange={(event) => setWeight(event.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="selection-captain" checked={captain} onCheckedChange={(value) => setCaptain(Boolean(value))} />
        <Label htmlFor="selection-captain">{t("nationalTeamCaptain")}</Label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="selection-start">{t("nationalTeamStart")}</Label>
          <Input id="selection-start" type="date" value={started} onChange={(event) => setStarted(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="selection-end">{t("nationalTeamEnd")}</Label>
          <Input id="selection-end" type="date" value={ended} onChange={(event) => setEnded(event.target.value)} />
        </div>
      </div>
      <p className="text-sm text-muted">{t("nationalTeamEndHint")}</p>
      <Button type="submit" disabled={busy || !memberId}>
        {busy ? t("nationalTeamSaving") : t("nationalTeamSave")}
      </Button>
    </form>
  );
}

function MemberSearch({
  roster,
  members,
  value,
  onChange,
}: {
  roster: "club" | "all";
  members?: Member[];
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("LtfAdmin");
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<Member[]>([]);
  const filtered = useMemo(() => {
    if (!members) return null;
    const needle = query.trim().toLowerCase();
    return members.filter((member) =>
      `${member.last_name} ${member.first_name}`.toLowerCase().includes(needle)
    );
  }, [members, query]);
  useEffect(() => {
    if (members) return;
    const handle = window.setTimeout(() => {
      void getMembersList({ q: query, roster: roster === "club" ? "club" : "all", isActive: true })
        .then(setRemote)
        .catch(() => setRemote([]));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [members, query, roster]);
  const found = filtered ?? remote;
  const chosen = found.find((member) => String(member.id) === value);
  return (
    <div className="space-y-2">
      <Label htmlFor="national-team-member">{t("nationalTeamMember")}</Label>
      <Input id="national-team-member" value={query} placeholder={t("nationalTeamSearchMember")} onChange={(event) => setQuery(event.target.value)} />
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {found.slice(0, 8).map((member) => (
          <button
            key={member.id}
            type="button"
            className="flex w-full rounded-[var(--radius-form)] px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
            onClick={() => onChange(String(member.id))}
          >
            {formatFullName(member)}
            {member.club ? "" : ` · ${t("nationalTeamNoClub")}`}
          </button>
        ))}
      </div>
      {chosen ? <p className="text-sm text-muted">{formatFullName(chosen)}</p> : null}
    </div>
  );
}

function EndDateForm({ initial, busy, onSave }: { initial: string; busy: boolean; onSave: (value: string) => void }) {
  const t = useTranslations("LtfAdmin");
  const [ended, setEnded] = useState(initial);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(ended);
      }}
    >
      <p className="text-sm text-muted">{t("nationalTeamEndHint")}</p>
      <div className="space-y-2">
        <Label htmlFor="end-date">{t("nationalTeamEnd")}</Label>
        <Input id="end-date" type="date" value={ended} onChange={(event) => setEnded(event.target.value)} />
      </div>
      <Button type="submit" disabled={busy || !ended}>
        {t("nationalTeamSave")}
      </Button>
    </form>
  );
}

function StatusHistory(props: {
  memberId: number;
  levels: NationalTeamLevel[];
  statuses: AthleteStatusRow[];
  busy: boolean;
  onSave: (input: Record<string, unknown>) => void;
  onEnd: (row: AthleteStatusRow, endedOn: string) => void;
  onDelete: (row: AthleteStatusRow) => void;
}) {
  const t = useTranslations("LtfAdmin");
  const [scheme, setScheme] = useState("ltf_level");
  const [started, setStarted] = useState("");
  const [note, setNote] = useState("");
  const [levelId, setLevelId] = useState(String(props.levels.find((level) => level.is_active)?.id ?? ""));
  const [pathway, setPathway] = useState("elite");
  const [rank, setRank] = useState("P1");
  const [project, setProject] = useState("olympic");
  const [support, setSupport] = useState("sportlycee");
  const activeLevels = props.levels.filter((level) => level.is_active);
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {props.statuses.length === 0 ? <li className="text-sm text-muted">{t("nationalTeamStatusEmpty")}</li> : null}
        {props.statuses.map((row) => (
          <li key={row.id} className="rounded-[var(--radius-form)] border border-border p-3 text-sm">
            <p className="font-medium text-foreground">
              {row.scheme === "ltf_level"
                ? row.level?.name || t("nationalTeamSchemeLevel")
                : row.scheme === "cosl"
                  ? formatCosl(t, { pathway: row.cosl_pathway, rank: row.cosl_rank, project: row.cosl_project })
                  : translateCode(t, supportKey(row.support_program), row.support_program)}
            </p>
            <p className="text-muted">
              {row.started_on} – {row.ended_on || t("nationalTeamOpenEnded")}
            </p>
            {row.source_note ? <p className="text-foreground">{row.source_note}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <EndInline disabled={props.busy} onSave={(value) => props.onEnd(row, value)} />
              <Button type="button" variant="outline" disabled={props.busy} onClick={() => props.onDelete(row)}>
                {t("nationalTeamDelete")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="space-y-3 border-t border-border pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSave({
            member: props.memberId,
            scheme,
            started_on: started,
            source_note: note,
            cadre_level_id: scheme === "ltf_level" ? Number(levelId) : null,
            cosl_pathway: scheme === "cosl" ? pathway : "",
            cosl_rank: scheme === "cosl" ? rank : "",
            cosl_project: scheme === "cosl" ? project : "",
            support_program: scheme === "support" ? support : "",
          });
        }}
      >
        <div className="space-y-2">
          <Label>{t("nationalTeamScheme")}</Label>
          <PopoverSelect
            ariaLabel={t("nationalTeamScheme")}
            value={scheme}
            onValueChange={setScheme}
            options={[
              { value: "ltf_level", label: t("nationalTeamSchemeLevel") },
              { value: "cosl", label: t("nationalTeamSchemeCosl") },
              { value: "support", label: t("nationalTeamSchemeSupport") },
            ]}
          />
        </div>
        {scheme === "ltf_level" ? (
          <div className="space-y-2">
            <Label>{t("nationalTeamLevel")}</Label>
            <PopoverSelect ariaLabel={t("nationalTeamLevel")} value={levelId} onValueChange={setLevelId} options={activeLevels.map((level) => ({ value: String(level.id), label: level.name }))} />
          </div>
        ) : null}
        {scheme === "cosl" ? (
          <div className="grid gap-3">
            <PopoverSelect ariaLabel={t("nationalTeamCoslPathway")} value={pathway} onValueChange={setPathway} options={COSL_PATHWAYS.map((value) => ({ value, label: translateCode(t, pathwayKey(value), value) }))} />
            <PopoverSelect ariaLabel={t("nationalTeamCoslRank")} value={rank} onValueChange={setRank} options={COSL_RANKS.map((value) => ({ value, label: value }))} />
            <PopoverSelect ariaLabel={t("nationalTeamCoslProject")} value={project} onValueChange={setProject} options={COSL_PROJECTS.map((value) => ({ value, label: translateCode(t, projectKey(value), value) }))} />
          </div>
        ) : null}
        {scheme === "support" ? (
          <PopoverSelect ariaLabel={t("nationalTeamSupport")} value={support} onValueChange={setSupport} options={SUPPORTS.map((value) => ({ value, label: translateCode(t, supportKey(value), value) }))} />
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="status-start">{t("nationalTeamStart")}</Label>
          <Input id="status-start" type="date" value={started} onChange={(event) => setStarted(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status-note">{t("nationalTeamSourceNote")}</Label>
          <Input id="status-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        <Button type="submit" disabled={props.busy || !started}>
          {t("nationalTeamSave")}
        </Button>
      </form>
    </div>
  );
}

function EndInline({ disabled, onSave }: { disabled: boolean; onSave: (value: string) => void }) {
  const t = useTranslations("LtfAdmin");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  if (!open) {
    return (
      <Button type="button" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        {t("nationalTeamEnd")}
      </Button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(value);
      }}
    >
      <Input aria-label={t("nationalTeamEnd")} type="date" value={value} onChange={(event) => setValue(event.target.value)} />
      <Button type="submit" variant="outline" disabled={disabled || !value}>
        {t("nationalTeamSave")}
      </Button>
    </form>
  );
}

function StaffPanel(props: {
  mode: PanelMode;
  role: NationalTeamStaffRow | null;
  squads: NationalTeamSquad[];
  members?: Member[];
  busy: boolean;
  onClose: () => void;
  onSave: (input: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("LtfAdmin");
  const open = props.mode === "add-staff" || props.mode === "end-staff" || props.mode === "delete-staff";
  if (!open) return null;
  return (
    <SidePanel
      open
      title={props.mode === "add-staff" ? t("nationalTeamStaffAdd") : props.mode === "delete-staff" ? t("nationalTeamDelete") : t("nationalTeamEnd")}
      description={t("nationalTeamStaffHint")}
      closeLabel={t("nationalTeamClose")}
      onClose={props.onClose}
    >
      {props.mode === "delete-staff" ? (
        <Button type="button" variant="destructive" disabled={props.busy} onClick={props.onDelete}>
          {t("nationalTeamDelete")}
        </Button>
      ) : null}
      {props.mode === "end-staff" && props.role ? (
        <EndDateForm initial={props.role.ended_on || ""} busy={props.busy} onSave={(endedOn) => props.onSave({ ended_on: endedOn })} />
      ) : null}
      {props.mode === "add-staff" ? <StaffForm squads={props.squads} members={props.members} busy={props.busy} onSave={props.onSave} /> : null}
    </SidePanel>
  );
}

function StaffForm({
  squads,
  members,
  busy,
  onSave,
}: {
  squads: NationalTeamSquad[];
  members?: Member[];
  busy: boolean;
  onSave: (input: Record<string, unknown>) => void;
}) {
  const t = useTranslations("LtfAdmin");
  const [memberId, setMemberId] = useState("");
  const [fn, setFn] = useState("national_coach");
  const [squad, setSquad] = useState("");
  const [title, setTitle] = useState("");
  const [started, setStarted] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          member: Number(memberId),
          function: fn,
          squad: squad ? Number(squad) : null,
          title,
          started_on: started,
        });
      }}
    >
      <MemberSearch roster="all" members={members} value={memberId} onChange={setMemberId} />
      <div className="space-y-2">
        <Label>{t("nationalTeamStaffFunction")}</Label>
        <PopoverSelect ariaLabel={t("nationalTeamStaffFunction")} value={fn} onValueChange={setFn} options={STAFF_FUNCTIONS.map((value) => ({ value, label: translateCode(t, staffKey(value), value) }))} />
      </div>
      <div className="space-y-2">
        <Label>{t("nationalTeamSquad")}</Label>
        <PopoverSelect
          ariaLabel={t("nationalTeamSquad")}
          value={squad}
          onValueChange={setSquad}
          options={[{ value: "", label: t("nationalTeamAllSquads") }, ...squads.map((item) => ({ value: String(item.id), label: item.name }))]}
        />
      </div>
      {fn === "other" ? (
        <div className="space-y-2">
          <Label htmlFor="staff-title">{t("nationalTeamStaffTitle")}</Label>
          <Input id="staff-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="staff-start">{t("nationalTeamStart")}</Label>
        <Input id="staff-start" type="date" value={started} onChange={(event) => setStarted(event.target.value)} />
      </div>
      <Button type="submit" disabled={busy || !memberId || !started}>
        {t("nationalTeamSave")}
      </Button>
    </form>
  );
}

function SquadPanel({ open, busy, onClose, onSave }: { open: boolean; busy: boolean; onClose: () => void; onSave: (name: string) => void }) {
  const t = useTranslations("LtfAdmin");
  const [name, setName] = useState("");
  if (!open) return null;
  return (
    <SidePanel open title={t("nationalTeamAddSquad")} description={t("nationalTeamAddSquadHint")} closeLabel={t("nationalTeamClose")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name);
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="squad-name">{t("nationalTeamSquadName")}</Label>
          <Input id="squad-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <p className="text-sm text-muted">{t("nationalTeamDisciplineKyorugi")}</p>
        <Button type="submit" disabled={busy || !name.trim()}>
          {t("nationalTeamSave")}
        </Button>
      </form>
    </SidePanel>
  );
}

function LevelPanel({
  open,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (input: Partial<NationalTeamLevel>) => void;
}) {
  const t = useTranslations("LtfAdmin");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  if (!open) return null;
  return (
    <SidePanel open title={t("nationalTeamLevelAdd")} description={t("nationalTeamLevelHint")} closeLabel={t("nationalTeamClose")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ code, name, is_active: true, sort_order: 20 });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="level-code">{t("nationalTeamLevelCode")}</Label>
          <Input id="level-code" value={code} onChange={(event) => setCode(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="level-name">{t("nationalTeamLevelName")}</Label>
          <Input id="level-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <Button type="submit" disabled={busy || !code.trim() || !name.trim()}>
          {t("nationalTeamSave")}
        </Button>
      </form>
    </SidePanel>
  );
}

function SeasonPanel({
  open,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (input: Partial<NationalTeamSeason>) => void;
}) {
  const t = useTranslations("LtfAdmin");
  const [year, setYear] = useState(String(new Date().getFullYear() + 1));
  const [starts, setStarts] = useState(`${Number(year)}-01-01`);
  const [ends, setEnds] = useState(`${Number(year)}-12-31`);
  if (!open) return null;
  return (
    <SidePanel open title={t("nationalTeamAddSeason")} description={t("nationalTeamSeasonDatesHint")} closeLabel={t("nationalTeamClose")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ year: Number(year), starts_on: starts, ends_on: ends });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="season-year">{t("nationalTeamSeason")}</Label>
          <Input id="season-year" inputMode="numeric" value={year} onChange={(event) => setYear(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-season-start">{t("nationalTeamSeasonStart")}</Label>
          <Input id="new-season-start" type="date" value={starts} onChange={(event) => setStarts(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-season-end">{t("nationalTeamSeasonEnd")}</Label>
          <Input id="new-season-end" type="date" value={ends} onChange={(event) => setEnds(event.target.value)} />
        </div>
        <Button type="submit" disabled={busy}>
          {t("nationalTeamSave")}
        </Button>
      </form>
    </SidePanel>
  );
}
