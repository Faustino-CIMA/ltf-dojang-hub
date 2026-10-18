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
  getClubTeam,
  getClubTeams,
  removeTeamMember,
  saveClubTeam,
  type ClubTeam,
  type TeamDiscipline,
} from "@/lib/club-teams-api";
import { formatFullName } from "@/lib/person-name";
import { type TableSort } from "@/lib/table-sort";
import { cn } from "@/lib/utils";

type Translator = (key: string, values?: Record<string, string | number>) => string;

type TeamTag = { id: number; name: string; discipline: TeamDiscipline };

const triggerClassName =
  "inline-flex min-h-[var(--control-height)] min-w-[11rem] items-center justify-between gap-2 rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 py-2 text-sm text-[var(--field-foreground)] shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function disciplineLabel(t: Translator, discipline: string) {
  if (discipline === "poomsae") return t("teamsDisciplinePoomsae");
  if (discipline === "kyorugi") return t("teamsDisciplineKyorugi");
  return discipline;
}

export function teamColumn(t: Translator): EntityTableColumn<Member> {
  return {
    key: "teams",
    header: t("teamsColumn"),
    sortable: true,
    render: (member) => {
      const teams = member.teams ?? [];
      if (teams.length === 0) return <span className="text-muted">—</span>;
      return (
        <span className="flex flex-wrap gap-1">
          {teams.map((team) => (
            <StatusBadge key={team.id} label={`${team.name} · ${disciplineLabel(t, team.discipline)}`} />
          ))}
        </span>
      );
    },
  };
}

export function TeamFilter({
  teams,
  selected,
  onChange,
}: {
  teams: TeamTag[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const t = useTranslations("ClubAdmin");
  const [open, setOpen] = useState(false);
  const label = selected.length ? `${t("teamsFilter")} (${selected.length})` : t("teamsFilter");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClassName} aria-label={t("teamsFilter")} aria-haspopup="listbox">
        <span className="truncate">{label}</span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent aria-label={t("teamsFilter")}>
        <div role="listbox" aria-label={t("teamsFilter")} aria-multiselectable="true" className="max-h-64 overflow-y-auto">
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
                  "flex min-h-10 w-full items-center rounded-[var(--radius-form)] px-3 text-left text-sm text-[var(--popover-foreground)] hover:bg-accent",
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

function TeamForm({
  clubId,
  team,
  onClose,
  onSaved,
}: {
  clubId: number;
  team: ClubTeam | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("ClubAdmin");
  const [name, setName] = useState(team?.name ?? "");
  const [discipline, setDiscipline] = useState<TeamDiscipline>(team?.discipline ?? "kyorugi");
  const [note, setNote] = useState(team?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <SidePanel open title={team ? t("teamsEdit") : t("teamsAdd")} closeLabel={t("teamsClose")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) {
            setError(t("teamsRequired"));
            return;
          }
          setBusy(true);
          setError(null);
          void saveClubTeam(team?.id ?? null, { club: clubId, name: name.trim(), discipline, note })
            .then(() => onSaved())
            .catch(() => setError(t("teamsRequired")))
            .finally(() => setBusy(false));
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="team-name" required>{t("teamsName")}</Label>
          <Input id="team-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label required>{t("teamsDiscipline")}</Label>
          <PopoverSelect
            className="w-full"
            ariaLabel={t("teamsDiscipline")}
            value={discipline}
            onValueChange={(value) => setDiscipline(value as TeamDiscipline)}
            options={[
              { value: "kyorugi", label: t("teamsDisciplineKyorugi") },
              { value: "poomsae", label: t("teamsDisciplinePoomsae") },
            ]}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="team-note">{t("teamsNote")}</Label>
          <Input id="team-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={busy}>{busy ? t("teamsSaving") : t("teamsSave")}</Button>
      </form>
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

function ManageMembersPanel({ team, clubId, onClose, onChanged }: { team: ClubTeam; clubId: number; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("ClubAdmin");
  const [detail, setDetail] = useState<ClubTeam | null>(null);
  const [roster, setRoster] = useState<Member[]>([]);
  const [query, setQuery] = useState("");
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
  const needle = query.trim().toLowerCase();
  const matches = (person: { first_name: string; last_name: string }) =>
    formatFullName(person).toLowerCase().includes(needle);
  const available = roster.filter((member) => !memberIds.has(member.id) && matches(member));
  const current = members.filter((member) => matches(member));

  function refresh(next: ClubTeam) {
    setDetail(next);
    onChanged();
  }

  return (
    <SidePanel open title={t("teamsManageTitle")} description={t("teamsManageHint", { name: team.name })} closeLabel={t("teamsClose")} onClose={onClose}>
      <div className="space-y-4">
        <Input aria-label={t("teamsSearchMembers")} placeholder={t("teamsSearchMembers")} value={query} onChange={(event) => setQuery(event.target.value)} />
        <div>
          <p className="text-sm font-medium text-foreground">{t("teamsOnTeam")}</p>
          {current.length === 0 ? <p className="mt-2 text-sm text-muted">{needle ? t("teamsNoMatches") : t("teamsNoMembers")}</p> : (
            <ul className="mt-2 space-y-2">
              {current.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground">{formatFullName(member)}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => void removeTeamMember(team.id, member.id).then(refresh)}>
                    {t("teamsRemoveMember")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{t("teamsAddMember")}</p>
          {available.length === 0 ? <p className="mt-2 text-sm text-muted">{t("teamsNoMatches")}</p> : (
            <ul className="mt-2 space-y-2">
              {available.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground">{formatFullName(member)}</span>
                  <Button type="button" size="sm" onClick={() => void addTeamMember(team.id, member.id).then(refresh)}>
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

export function ClubTeamsDesk({ clubId }: { clubId: number }) {
  const t = useTranslations("ClubAdmin");
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<TableSort>({ key: "name", direction: "asc" });
  const [editing, setEditing] = useState<ClubTeam | null>(null);
  const [panel, setPanel] = useState<"create" | "edit" | "delete" | "members" | null>(null);

  function load() {
    setLoading(true);
    return getClubTeams(clubId)
      .then(setTeams)
      .catch(() => setTeams([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    void getClubTeams(clubId)
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
  }, [clubId]);

  const columns = useMemo<Array<EntityTableColumn<ClubTeam>>>(
    () => [
      { key: "name", header: t("teamsNameColumn"), sortable: true, sortValue: (row) => row.name },
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
              { key: "delete", label: t("teamsDeleteAction"), destructive: true, onSelect: () => { setEditing(row); setPanel("delete"); } },
            ]}
          />
        ),
      },
    ],
    [t]
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => { setEditing(null); setPanel("create"); }}>{t("teamsAdd")}</Button>
      </div>
      {loading ? <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading /> : teams.length === 0 ? (
        <EmptyState title={t("teamsEmptyTitle")} description={t("teamsEmptySubtitle")} />
      ) : (
        <EntityTable columns={columns} rows={teams} sort={sort} onSortChange={setSort} clientSort />
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
