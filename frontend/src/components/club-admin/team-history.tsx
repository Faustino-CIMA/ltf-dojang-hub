"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { EntityTable, type EntityTableColumn } from "@/components/club-admin/entity-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidePanel } from "@/components/ui/side-panel";
import { getTeamHistory, type TeamHistory, type TeamHistoryEvent, type TeamHistoryPerson } from "@/lib/club-teams-api";
import { formatDisplayDate } from "@/lib/date-display";
import { formatFullName, fullNameSortKey } from "@/lib/person-name";
import { type TableSort } from "@/lib/table-sort";

function todayInput() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function TeamHistoryPanel({
  teamId,
  onClose,
  preview,
}: {
  teamId: number;
  onClose: () => void;
  preview?: TeamHistory;
}) {
  const t = useTranslations("ClubAdmin");
  const [on, setOn] = useState(preview?.on ?? todayInput());
  const [data, setData] = useState<TeamHistory | null>(preview ?? null);
  const [rosterSort, setRosterSort] = useState<TableSort>({ key: "name", direction: "asc" });
  const [eventSort, setEventSort] = useState<TableSort>({ key: "when", direction: "desc" });

  useEffect(() => {
    if (preview !== undefined) {
      setData(preview);
      return;
    }
    let cancelled = false;
    void getTeamHistory(teamId, on)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [on, preview, teamId]);

  const roleLabel = (role: string) => (role === "coach" ? t("teamRoleCoach") : t("teamRoleAthlete"));

  const rosterColumns = useMemo<Array<EntityTableColumn<TeamHistoryPerson>>>(
    () => [
      {
        key: "name",
        header: t("teamsNameColumn"),
        sortable: true,
        sortValue: (row) => fullNameSortKey(row),
        render: (row) => formatFullName(row),
      },
      {
        key: "role",
        header: t("teamRoleLabel"),
        sortable: true,
        sortValue: (row) => row.role,
        render: (row) => roleLabel(row.role),
      },
    ],
    [t],
  );

  const eventColumns = useMemo<Array<EntityTableColumn<TeamHistoryEvent>>>(
    () => [
      {
        key: "when",
        header: t("teamHistoryWhen"),
        sortable: true,
        sortValue: (row) => `${row.occurred_on}T${row.occurred_time}`,
        render: (row) => `${formatDisplayDate(row.occurred_on)} ${row.occurred_time}`,
      },
      {
        key: "name",
        header: t("teamsNameColumn"),
        sortable: true,
        sortValue: (row) => fullNameSortKey(row),
        render: (row) => formatFullName(row),
      },
      {
        key: "change",
        header: t("teamHistoryChange"),
        sortable: true,
        sortValue: (row) => row.action,
        render: (row) => {
          if (row.action === "already") return t("teamHistoryAlready");
          if (row.action === "removed") return t("teamHistoryRemoved");
          if (row.action === "role_changed") return t("teamHistoryRoleChanged", { role: roleLabel(row.role) });
          if (row.note) return t("teamHistoryCopied", { name: row.note });
          return t("teamHistoryAdded");
        },
      },
      {
        key: "actor",
        header: t("teamHistoryBy"),
        sortable: true,
        sortValue: (row) => row.actor_name,
        render: (row) => row.actor_name || t("teamHistoryNoActor"),
      },
    ],
    [t],
  );

  return (
    <SidePanel open wide title={t("teamHistoryTitle")} description={t("teamHistoryHint")} closeLabel={t("teamsClose")} onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="team-history-on">{t("teamHistoryOn")}</Label>
          <Input id="team-history-on" type="date" value={on} onChange={(event) => setOn(event.target.value)} />
        </div>
        {data?.incomplete ? (
          <p className="text-sm text-muted">
            {t("teamHistoryIncomplete", { date: formatDisplayDate(data.history_started_on) })}
          </p>
        ) : (
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">{t("teamHistoryRoster")}</h3>
            {data && data.roster.length === 0 ? <p className="text-sm text-muted">{t("teamHistoryEmpty")}</p> : null}
            {data && data.roster.length > 0 ? (
              <EntityTable columns={rosterColumns} rows={data.roster} sort={rosterSort} onSortChange={setRosterSort} clientSort embedded />
            ) : null}
          </section>
        )}
        {data && !data.incomplete && data.events.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">{t("teamHistoryChanges")}</h3>
            <EntityTable columns={eventColumns} rows={data.events} sort={eventSort} onSortChange={setEventSort} clientSort embedded />
          </section>
        ) : null}
      </div>
    </SidePanel>
  );
}
