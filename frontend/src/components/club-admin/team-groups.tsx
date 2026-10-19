"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { EntityTable, type EntityTableColumn } from "@/components/club-admin/entity-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import { deleteTeamGroup, saveTeamGroup, type ClubTeam, type TeamGroup } from "@/lib/club-teams-api";
import { formatFullName } from "@/lib/person-name";
import { cn } from "@/lib/utils";

type Translator = (key: string, values?: Record<string, string | number>) => string;

function groupError(t: Translator, code: string) {
  if (code === "pair_mixed" || code === "team_same_sex") return t("teamGroupsErrorSex");
  if (code === "member_not_on_team") return t("teamGroupsErrorMember");
  return t("teamGroupsErrorSize");
}

function GroupForm({
  team,
  group,
  onClose,
  onSaved,
}: {
  team: ClubTeam;
  group: TeamGroup | null;
  onClose: () => void;
  onSaved: (team: ClubTeam) => void;
}) {
  const t = useTranslations("ClubAdmin");
  const [kind, setKind] = useState<"pair" | "team">(group?.kind ?? "pair");
  const [name, setName] = useState(group?.name ?? "");
  const [selected, setSelected] = useState<number[]>(group?.members.map((member) => member.id) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const athletes = (team.members ?? []).filter((member) => member.role !== "coach");

  return (
    <SidePanel
      open
      title={group ? t("teamGroupsEdit") : t("teamGroupsAdd")}
      description={t("teamGroupsHint")}
      closeLabel={t("teamsClose")}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (selected.length === 0) {
            setError(t("teamGroupsErrorSize"));
            return;
          }
          setBusy(true);
          setError(null);
          void saveTeamGroup(team.id, group?.id ?? null, { kind, name: name.trim(), members: selected })
            .then(onSaved)
            .catch(async (reason: unknown) => {
              const code = reason instanceof Error ? reason.message : "";
              setError(groupError(t, code));
            })
            .finally(() => setBusy(false));
        }}
      >
        <div className="space-y-2">
          <Label required>{t("teamGroupsKind")}</Label>
          <PopoverSelect
            className="w-full"
            ariaLabel={t("teamGroupsKind")}
            value={kind}
            onValueChange={(value) => setKind(value as "pair" | "team")}
            options={[
              { value: "pair", label: t("teamGroupsPair") },
              { value: "team", label: t("teamGroupsTeam") },
            ]}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-name">{t("teamGroupsName")}</Label>
          <Input id="group-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label required>{t("teamGroupsAthletes")}</Label>
          <div role="group" aria-label={t("teamGroupsAthletes")} className="space-y-1">
            {athletes.map((member) => {
              const active = selected.includes(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    "flex min-h-10 w-full items-center rounded-[var(--radius-form)] px-3 text-left text-sm text-foreground hover:bg-[var(--accent-soft)] hover:text-foreground",
                    active && "bg-accent text-accent-foreground",
                  )}
                  onClick={() =>
                    setSelected((current) => (active ? current.filter((id) => id !== member.id) : [...current, member.id]))
                  }
                >
                  {formatFullName(member)}
                </button>
              );
            })}
          </div>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={busy}>{busy ? t("teamsSaving") : t("teamGroupsSave")}</Button>
      </form>
    </SidePanel>
  );
}

export function TeamGroups({ team, onChanged }: { team: ClubTeam; onChanged: (team: ClubTeam) => void }) {
  const t = useTranslations("ClubAdmin");
  const groups = team.groups ?? [];
  const [editing, setEditing] = useState<TeamGroup | null>(null);
  const [panel, setPanel] = useState<"edit" | "delete" | null>(null);
  const columns: Array<EntityTableColumn<TeamGroup>> = [
    {
      key: "kind",
      header: t("teamGroupsKind"),
      cellClassName: "whitespace-nowrap",
      headerClassName: "whitespace-nowrap",
      render: (row) => (row.kind === "pair" ? t("teamGroupsPair") : t("teamGroupsTeam")),
    },
    {
      key: "name",
      header: t("teamGroupsName"),
      cellClassName: "whitespace-nowrap",
      headerClassName: "whitespace-nowrap",
      render: (row) => row.name || "—",
    },
    {
      key: "members",
      header: t("teamGroupsAthletes"),
      cellClassName: "whitespace-nowrap",
      headerClassName: "whitespace-nowrap",
      render: (row) => row.members.map((member) => formatFullName(member)).join(", ") || "—",
    },
    {
      key: "actions",
      header: t("teamGroupsActions"),
      headerClassName: "text-right whitespace-nowrap",
      cellClassName: "text-right whitespace-nowrap",
      render: (row) => (
        <RowActionMenu
          label={t("teamGroupsActions")}
          actions={[
            { key: "edit", label: t("teamsEditAction"), onSelect: () => { setEditing(row); setPanel("edit"); } },
            { key: "delete", label: t("teamsDeleteAction"), destructive: true, onSelect: () => { setEditing(row); setPanel("delete"); } },
          ]}
        />
      ),
    },
  ];

  return (
    <section className="app-panel p-6" aria-labelledby="team-groups-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="team-groups-title" className="text-section text-foreground">{t("teamGroupsTitle")}</h2>
        <Button type="button" variant="outline" onClick={() => { setEditing(null); setPanel("edit"); }}>
          {t("teamGroupsAdd")}
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted">{t("teamGroupsHint")}</p>
      <p className="mt-1 text-xs text-muted">{t("teamGroupsSource")}</p>
      {groups.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t("teamGroupsEmpty")}</p>
      ) : (
        <div className="mt-4">
          <EntityTable embedded columns={columns} rows={groups} />
        </div>
      )}
      {panel === "edit" ? (
        <GroupForm team={team} group={editing} onClose={() => setPanel(null)} onSaved={(next) => { setPanel(null); onChanged(next); }} />
      ) : null}
      {panel === "delete" && editing ? (
        <SidePanel
          open
          title={t("teamGroupsDeleteTitle")}
          description={t("teamGroupsDeleteHint", { name: editing.name || (editing.kind === "pair" ? t("teamGroupsPair") : t("teamGroupsTeam")) })}
          closeLabel={t("teamsClose")}
          onClose={() => setPanel(null)}
        >
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              void deleteTeamGroup(team.id, editing.id).then((next) => {
                setPanel(null);
                onChanged(next);
              });
            }}
          >
            {t("teamGroupsDeleteConfirm")}
          </Button>
        </SidePanel>
      ) : null}
    </section>
  );
}
