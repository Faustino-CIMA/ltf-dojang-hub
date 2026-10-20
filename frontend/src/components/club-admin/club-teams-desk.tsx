"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable, type EntityTableColumn } from "@/components/club-admin/entity-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSelect } from "@/components/ui/popover-select";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { getMembersList, type Member } from "@/lib/club-admin-api";
import {
  addTeamMember,
  deleteClubTeam,
  duplicateClubTeam,
  getClubTeam,
  getClubTeams,
  removeTeamMember,
  saveClubTeam,
  setTeamArchived,
  updateTeamMemberRole,
  type ClubTeam,
  type TeamDuplicateResult,
  type TeamDiscipline,
  type TeamMember,
} from "@/lib/club-teams-api";
import { formatAgeClassLabel, suggestAgeClass } from "@/lib/age-class";
import { formatDisplayDate } from "@/lib/date-display";
import { formatFullName } from "@/lib/person-name";
import { type TableSort } from "@/lib/table-sort";
import { cn } from "@/lib/utils";

type Translator = (key: string, values?: Record<string, string | number>) => string;

type TeamTag = { id: number; name: string; discipline: TeamDiscipline };

const triggerClassName =
  "inline-flex min-h-[var(--control-height)] min-w-[11rem] items-center justify-between gap-2 rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 py-2 text-sm text-[var(--field-foreground)] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function disciplineLabel(t: Translator, discipline: string) {
  if (discipline === "poomsae") return t("teamsDisciplinePoomsae");
  if (discipline === "kyorugi") return t("teamsDisciplineKyorugi");
  return discipline;
}

export function TeamFilter({
  teams,
  value,
  onChange,
}: {
  teams: TeamTag[];
  value: number[] | "none";
  onChange: (next: number[] | "none") => void;
}) {
  const t = useTranslations("ClubAdmin");
  const [open, setOpen] = useState(false);
  const selected = value === "none" ? [] : value;
  const label = value === "none" ? t("teamsFilterNone") : selected.length ? `${t("teamsFilter")} (${selected.length})` : t("teamsFilter");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClassName} aria-label={t("teamsFilter")} aria-haspopup="listbox">
        <span className="truncate">{label}</span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent aria-label={t("teamsFilter")}>
        <div role="listbox" aria-label={t("teamsFilter")} aria-multiselectable="true" className="max-h-64 overflow-y-auto">
          <button
            type="button"
            role="option"
            aria-selected={value === "none"}
            className={cn(
              "flex min-h-[var(--control-height)] w-full items-center rounded-[var(--radius-form)] px-3 text-left text-sm text-[var(--popover-foreground)] hover:bg-[var(--accent-soft)] hover:text-foreground",
              value === "none" && "bg-accent text-accent-foreground"
            )}
            onClick={() => onChange(value === "none" ? [] : "none")}
          >
            {t("teamsFilterNone")}
          </button>
          {teams.length === 0 ? <p className="px-3 py-2 text-sm text-muted">{t("teamsFilterEmpty")}</p> : null}
          {teams.map((team) => {
            const active = selected.includes(team.id);
            return (
              <button
                key={team.id}
                type="button"
                role="option"
                aria-selected={active}
                className={cn(
                  "flex min-h-[var(--control-height)] w-full items-center rounded-[var(--radius-form)] px-3 text-left text-sm text-[var(--popover-foreground)] hover:bg-[var(--accent-soft)] hover:text-foreground",
                  active && "bg-accent text-accent-foreground"
                )}
                onClick={() => onChange(active ? selected.filter((id) => id !== team.id) : [...selected, team.id])}
              >
                {team.name}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TeamForm({
  clubId,
  team,
  onClose,
  onSaved,
}: {
  clubId: number;
  team: ClubTeam | null;
  onClose: () => void;
  onSaved: (team: ClubTeam) => void;
}) {
  const t = useTranslations("ClubAdmin");
  const [name, setName] = useState(team?.name ?? "");
  const [discipline, setDiscipline] = useState<TeamDiscipline>(team?.discipline ?? "kyorugi");
  const [note, setNote] = useState(team?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const archived = Boolean(team?.archived);
  const disciplineChanged = Boolean(team && discipline !== team.discipline);
  return (
    <SidePanel open title={team ? t("teamsEdit") : t("teamsAdd")} closeLabel={t("teamsClose")} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (archived) return;
          if (!name.trim()) {
            setError(t("teamsRequired"));
            return;
          }
          setBusy(true);
          setError(null);
          void saveClubTeam(team?.id ?? null, { club: clubId, name: name.trim(), discipline, note })
            .then((saved) => onSaved(saved))
            .catch(() => setError(t("teamsRequired")))
            .finally(() => setBusy(false));
        }}
      >
        {archived ? <p className="text-sm text-muted">{t("teamArchivedHint")}</p> : null}
        <div className="space-y-2">
          <Label htmlFor="team-name" required>{t("teamsName")}</Label>
          <Input id="team-name" value={name} disabled={archived} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label required>{t("teamsDiscipline")}</Label>
          <PopoverSelect
            className="w-full"
            ariaLabel={t("teamsDiscipline")}
            value={discipline}
            disabled={archived}
            onValueChange={(value) => setDiscipline(value as TeamDiscipline)}
            options={[
              { value: "kyorugi", label: t("teamsDisciplineKyorugi") },
              { value: "poomsae", label: t("teamsDisciplinePoomsae") },
            ]}
          />
          {disciplineChanged ? <p className="text-sm text-destructive">{t("teamDisciplineWarning")}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="team-note">{t("teamsNote")}</Label>
          <Input id="team-note" value={note} disabled={archived} onChange={(event) => setNote(event.target.value)} />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {archived ? null : <Button type="submit" disabled={busy}>{busy ? t("teamsSaving") : t("teamsSave")}</Button>}
        {team ? (
          <Button
            type="button"
            variant={archived ? "default" : "outline"}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void setTeamArchived(team.id, !archived)
                .then((saved) => onSaved(saved))
                .catch(() => setError(t("teamsRequired")))
                .finally(() => setBusy(false));
            }}
          >
            {archived ? t("teamUnarchive") : t("teamArchive")}
          </Button>
        ) : null}
      </form>
    </SidePanel>
  );
}

const CATEGORY_SET_KEYS: Record<string, string> = {
  wt: "teamCategorySetWt",
  be: "teamCategorySetBe",
  nl: "teamCategorySetNl",
  de: "teamCategorySetDe",
  fr: "teamCategorySetFr",
  at: "teamCategorySetAt",
  custom: "teamCategorySetCustom",
};

function suggestedCopyName(name: string, taken: Set<string>) {
  const first = `${name} copy`;
  if (!taken.has(first)) return first;
  let index = 2;
  while (taken.has(`${name} copy ${index}`)) index += 1;
  return `${name} copy ${index}`;
}

export function DuplicateTeamPanel({
  teamId,
  onClose,
  onCreated,
}: {
  teamId: number;
  onClose: () => void;
  onCreated: (team: ClubTeam) => void;
}) {
  const t = useTranslations("ClubAdmin");
  const [source, setSource] = useState<ClubTeam | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TeamDuplicateResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getClubTeam(teamId).then((team) => {
      if (cancelled) return;
      setSource(team);
      void getClubTeams(team.club, { includeArchived: true }).then((rows) => {
        if (!cancelled) setName(suggestedCopyName(team.name, new Set(rows.map((row) => row.name))));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const finish = (payload: TeamDuplicateResult) => {
    if (payload.skipped_left_club === 0 && payload.dropped_groups.length === 0) {
      onCreated(payload.team);
      return;
    }
    setResult(payload);
  };

  return (
    <SidePanel
      open
      title={t("teamDuplicateTitle")}
      description={t("teamDuplicateHint")}
      closeLabel={t("teamsClose")}
      onClose={onClose}
    >
      {result ? (
        <div className="space-y-3">
          {result.skipped_left_club > 0 ? (
            <p className="text-sm text-foreground">{t("teamDuplicateSkipped", { count: result.skipped_left_club })}</p>
          ) : null}
          {result.dropped_groups.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-foreground">{t("teamDuplicateDropped", { count: result.dropped_groups.length })}</p>
              <ul className="space-y-1 text-sm text-muted">
                {result.dropped_groups.map((group) => (
                  <li key={`${group.kind}-${group.name}`}>{group.name || group.kind}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button type="button" onClick={() => onCreated(result.team)}>
            {t("teamDuplicateOpen")}
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) {
              setError(t("teamsRequired"));
              return;
            }
            setBusy(true);
            setError(null);
            void duplicateClubTeam(teamId, name.trim())
              .then(finish)
              .catch(() => setError(t("teamsRequired")))
              .finally(() => setBusy(false));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="duplicate-team-name" required>
              {t("teamDuplicateName")}
            </Label>
            <Input id="duplicate-team-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          {source ? (
            <div className="space-y-1 text-sm text-foreground">
              <p>{disciplineLabel(t, source.discipline)}</p>
              <p>
                {t("teamsMemberCount", {
                  athletes: source.athlete_count ?? source.member_count,
                  coaches: source.coach_count ?? 0,
                })}
              </p>
              <p>{t("teamDuplicateGroups", { count: source.groups?.length ?? 0 })}</p>
              <p>
                {source.competition_on
                  ? t("teamDuplicateCompetition", {
                      name: [source.competition_name, formatDisplayDate(source.competition_on)].filter(Boolean).join(" · "),
                    })
                  : t("teamDuplicateNoCompetition")}
              </p>
              <p>{t("teamDuplicateCategory", { set: t(CATEGORY_SET_KEYS[source.category_set ?? "wt"] ?? "teamCategorySetWt") })}</p>
              {(source.custom_bands?.length ?? 0) > 0 ? (
                <p>{t("teamDuplicateBands", { count: source.custom_bands?.length ?? 0 })}</p>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={busy || !source}>
            {busy ? t("teamsSaving") : t("teamDuplicateAction")}
          </Button>
        </form>
      )}
    </SidePanel>
  );
}

function DeleteTeamPanel({ team, onClose, onDeleted }: { team: ClubTeam; onClose: () => void; onDeleted: () => void }) {
  const t = useTranslations("ClubAdmin");
  const [busy, setBusy] = useState(false);
  return (
    <SidePanel open title={t("teamsDeleteTitle")} description={t("teamsDeleteHint", { name: team.name })} closeLabel={t("teamsClose")} onClose={onClose}>
      <Button
        type="button"
        variant="destructive"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void deleteClubTeam(team.id).then(() => onDeleted()).finally(() => setBusy(false));
        }}
      >
        {t("teamsDeleteConfirm")}
      </Button>
    </SidePanel>
  );
}

const AGE_FILTERS = ["youth", "pupils", "minimes", "cadet", "junior", "senior"] as const;

function personAgeClass(person: { age_class?: string; birth_year?: number | null; date_of_birth?: string | null }, year: number) {
  if (person.age_class) return person.age_class;
  if (person.date_of_birth) return suggestAgeClass(person.date_of_birth, year);
  if (person.birth_year) return suggestAgeClass(`${person.birth_year}-01-01`, year);
  return "";
}

function RoleToggle({
  name,
  role,
  disabled,
  onChange,
}: {
  name: string;
  role: "athlete" | "coach";
  disabled?: boolean;
  onChange: (role: "athlete" | "coach") => void;
}) {
  const t = useTranslations("ClubAdmin");
  return (
    <div role="group" aria-label={t("teamRoleChange", { name })} className="inline-flex rounded-[var(--radius-form)] border border-border p-0.5">
      {(["athlete", "coach"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={role === value}
          disabled={disabled}
          className={cn(
            "min-h-8 rounded-[var(--radius-form)] px-3 text-sm text-foreground",
            role === value && "bg-accent text-accent-foreground",
          )}
          onClick={() => onChange(value)}
        >
          {value === "coach" ? t("teamRoleCoach") : t("teamRoleAthlete")}
        </button>
      ))}
    </div>
  );
}

function ManageMembersPanel({ team, clubId, onClose, onChanged }: { team: ClubTeam; clubId: number; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("ClubAdmin");
  const [detail, setDetail] = useState<ClubTeam | null>(null);
  const [roster, setRoster] = useState<Member[]>([]);
  const [query, setQuery] = useState("");
  const [sexFilter, setSexFilter] = useState("");
  const [ageFilter, setAgeFilter] = useState("");
  const [beltFilter, setBeltFilter] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getClubTeam(team.id).then((payload) => {
      if (!cancelled) setDetail(payload);
    });
    void getMembersList({ clubId, isActive: true }).then((rows) => {
      if (!cancelled) setRoster(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [clubId, team.id]);
  const members = detail?.members ?? [];
  const memberIds = new Set(members.map((member) => member.id));
  const year = Number((detail?.competition_on ?? "").slice(0, 4)) || new Date().getFullYear();
  const archived = Boolean(detail?.archived);
  const needle = query.trim().toLowerCase();
  const suggested = new Set(detail?.suggested_coach_ids ?? []);

  function ageOf(person: TeamMember | Member) {
    return personAgeClass(person, year);
  }

  function matches(person: { first_name: string; last_name: string; sex?: string; belt_rank?: string; age_class?: string; birth_year?: number | null; date_of_birth?: string | null }) {
    if (needle && !formatFullName(person).toLowerCase().includes(needle)) return false;
    if (sexFilter && person.sex !== sexFilter) return false;
    if (ageFilter && ageOf(person) !== ageFilter) return false;
    if (beltFilter && (person.belt_rank || "") !== beltFilter) return false;
    return true;
  }

  const belts = [...new Set([...members, ...roster].map((person) => person.belt_rank).filter((rank): rank is string => Boolean(rank)))].sort();
  const available = roster
    .filter((member) => !memberIds.has(member.id) && matches(member))
    .sort((left, right) => {
      const leftCoach = suggested.has(left.id) ? 0 : 1;
      const rightCoach = suggested.has(right.id) ? 0 : 1;
      if (leftCoach !== rightCoach) return leftCoach - rightCoach;
      return formatFullName(left).localeCompare(formatFullName(right));
    });
  const current = members.filter((member) => matches(member));

  function refresh(next: ClubTeam, message: string) {
    setDetail(next);
    setNotice(message);
    onChanged();
  }

  return (
    <SidePanel open title={t("teamsManageTitle")} description={t("teamsManageHint", { name: team.name })} closeLabel={t("teamsClose")} onClose={onClose}>
      <div className="space-y-3">
        {archived ? <p className="text-sm text-muted">{t("teamArchivedHint")}</p> : null}
        <Input aria-label={t("teamsSearchMembers")} placeholder={t("teamsSearchMembers")} value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="grid gap-3">
          <div className="space-y-2">
            <Label>{t("teamFilterSex")}</Label>
            <PopoverSelect
              className="w-full"
              ariaLabel={t("teamFilterSex")}
              value={sexFilter}
              onValueChange={setSexFilter}
              options={[
                { value: "", label: t("teamFilterAny") },
                { value: "F", label: t("sexFemale") },
                { value: "M", label: t("sexMale") },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("teamFilterAge")}</Label>
            <PopoverSelect
              className="w-full"
              ariaLabel={t("teamFilterAge")}
              value={ageFilter}
              onValueChange={setAgeFilter}
              options={[
                { value: "", label: t("teamFilterAny") },
                ...AGE_FILTERS.map((code) => ({ value: code, label: formatAgeClassLabel(t, code) })),
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("teamFilterBelt")}</Label>
            <PopoverSelect
              className="w-full"
              ariaLabel={t("teamFilterBelt")}
              value={beltFilter}
              onValueChange={setBeltFilter}
              options={[{ value: "", label: t("teamFilterAny") }, ...belts.map((rank) => ({ value: rank, label: rank }))]}
            />
          </div>
        </div>
        {notice ? <p role="status" className="text-sm text-muted">{notice}</p> : null}
        <div>
          <p className="text-sm font-medium text-foreground">{t("teamsOnTeam")}</p>
          {current.length === 0 ? <p className="mt-2 text-sm text-muted">{needle || sexFilter || ageFilter || beltFilter ? t("teamsNoMatches") : t("teamsNoMembers")}</p> : (
            <ul className="mt-2 space-y-3">
              {current.map((member) => (
                <li key={member.id} className="space-y-2 border-b border-border pb-3">
                  <span className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-sm text-foreground">
                      <span>{formatFullName(member)}</span>
                      {member.role === "coach" ? <StatusBadge label={t("teamRoleCoach")} tone="info" /> : null}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={archived || busyId === member.id}
                      onClick={() => {
                        setBusyId(member.id);
                        void removeTeamMember(team.id, member.id)
                          .then((next) => refresh(next, t("teamMemberRemoved")))
                          .finally(() => setBusyId(null));
                      }}
                    >
                      {t("teamsRemoveMember")}
                    </Button>
                  </span>
                  <RoleToggle
                    name={formatFullName(member)}
                    role={member.role === "coach" ? "coach" : "athlete"}
                    disabled={archived || busyId === member.id}
                    onChange={(value) => {
                      if (value === (member.role === "coach" ? "coach" : "athlete")) return;
                      setBusyId(member.id);
                      void updateTeamMemberRole(team.id, member.id, value)
                        .then((next) => refresh(next, t("teamRoleUpdated")))
                        .finally(() => setBusyId(null));
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{t("teamsClubMembers")}</p>
          <p className="mt-1 text-sm text-muted">{t("teamRoleHint")}</p>
          {available.length === 0 ? <p className="mt-2 text-sm text-muted">{t("teamsNoMatches")}</p> : (
            <ul className="mt-2 space-y-2">
              {available.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground">
                    {formatFullName(member)}
                    {suggested.has(member.id) ? <span className="ml-2 text-muted">{t("teamClubCoach")}</span> : null}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={archived || busyId === member.id}
                    onClick={() => {
                      setBusyId(member.id);
                      void addTeamMember(team.id, member.id, "athlete")
                        .then((next) => refresh(next, t("teamMemberAdded")))
                        .finally(() => setBusyId(null));
                    }}
                  >
                    {t("teamsAddMember")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SidePanel>
  );
}

export function ClubTeamsDesk({ clubId, onOpenTeam }: { clubId: number; onOpenTeam?: (team: ClubTeam) => void }) {
  const t = useTranslations("ClubAdmin");
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<TableSort>({ key: "name", direction: "asc" });
  const [editing, setEditing] = useState<ClubTeam | null>(null);
  const [panel, setPanel] = useState<"create" | "edit" | "duplicate" | "delete" | "members" | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  function load(includeArchived = showArchived) {
    setLoading(true);
    return getClubTeams(clubId, includeArchived ? { includeArchived: true } : undefined)
      .then(setTeams)
      .catch(() => setTeams([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    void getClubTeams(clubId, showArchived ? { includeArchived: true } : undefined)
      .then((rows) => {
        if (!cancelled) setTeams(rows);
      })
      .catch(() => {
        if (!cancelled) setTeams([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId, showArchived]);

  const columns = useMemo<Array<EntityTableColumn<ClubTeam>>>(
    () => [
      {
        key: "name",
        header: t("teamsNameColumn"),
        sortable: true,
        sortValue: (row) => row.name,
        render: (row) => (
          <span className="inline-flex items-center gap-2">
            <span>{row.name}</span>
            {row.archived ? <StatusBadge label={t("teamArchived")} /> : null}
          </span>
        ),
      },
      {
        key: "discipline",
        header: t("teamsDisciplineColumn"),
        sortable: true,
        sortValue: (row) => row.discipline,
        render: (row) => disciplineLabel(t, row.discipline),
      },
      {
        key: "member_count",
        header: t("teamsMembersColumn"),
        sortable: true,
        sortValue: (row) => row.member_count,
        render: (row) =>
          t("teamsMemberCount", {
            athletes: row.athlete_count ?? row.member_count,
            coaches: row.coach_count ?? 0,
          }),
      },
      { key: "note", header: t("teamsNoteColumn"), sortable: true, sortValue: (row) => row.note, render: (row) => row.note || "—" },
      {
        key: "actions",
        header: t("teamsActions"),
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (row) => (
          <RowActionMenu
            label={t("teamsActions")}
            actions={[
              { key: "edit", label: t("teamsEditAction"), onSelect: () => { setEditing(row); setPanel("edit"); } },
              { key: "members", label: t("teamsManageAction"), onSelect: () => { setEditing(row); setPanel("members"); } },
              { key: "duplicate", label: t("teamDuplicateAction"), onSelect: () => { setEditing(row); setPanel("duplicate"); } },
              { key: "delete", label: t("teamsDeleteAction"), destructive: true, onSelect: () => { setEditing(row); setPanel("delete"); } },
            ]}
          />
        ),
      },
    ],
    [t]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant={showArchived ? "default" : "outline"} aria-pressed={showArchived} onClick={() => setShowArchived((current) => !current)}>
          {t("teamShowArchived")}
        </Button>
        <Button type="button" onClick={() => { setEditing(null); setPanel("create"); }}>{t("teamsAdd")}</Button>
      </div>
      {loading ? <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading /> : teams.length === 0 ? (
        <EmptyState title={t("teamsEmptyTitle")} description={t("teamsEmptySubtitle")} />
      ) : (
        <EntityTable columns={columns} rows={teams} sort={sort} onSortChange={setSort} clientSort onRowClick={onOpenTeam} />
      )}
      {panel === "create" || panel === "edit" ? (
        <TeamForm
          clubId={clubId}
          team={panel === "edit" ? editing : null}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            void load();
          }}
        />
      ) : null}
      {panel === "duplicate" && editing ? (
        <DuplicateTeamPanel
          teamId={editing.id}
          onClose={() => setPanel(null)}
          onCreated={(team) => {
            setPanel(null);
            onOpenTeam?.(team);
          }}
        />
      ) : null}
      {panel === "delete" && editing ? (
        <DeleteTeamPanel
          team={editing}
          onClose={() => setPanel(null)}
          onDeleted={() => {
            setPanel(null);
            void load();
          }}
        />
      ) : null}
      {panel === "members" && editing ? (
        <ManageMembersPanel team={editing} clubId={clubId} onClose={() => setPanel(null)} onChanged={() => void load()} />
      ) : null}
    </div>
  );
}
