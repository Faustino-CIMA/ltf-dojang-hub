"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { disciplineLabel } from "@/components/club-admin/club-teams-desk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidePanel } from "@/components/ui/side-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { addTeamMember, getClubTeams, removeTeamMember, type ClubTeam } from "@/lib/club-teams-api";

type MemberTeam = { id: number; name: string; discipline: string; role?: "athlete" | "coach" };

export function MemberTeamsCard({
  memberId,
  clubId,
  teams,
  onChanged,
}: {
  memberId: number;
  clubId: number;
  teams: MemberTeam[];
  onChanged: () => void;
}) {
  const t = useTranslations("ClubAdmin");
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<ClubTeam[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getClubTeams(clubId).then((rows) => {
      if (!cancelled) setCatalog(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [clubId, open, teams]);
  const needle = query.trim().toLowerCase();
  const visible = catalog.filter((team) => team.name.toLowerCase().includes(needle));
  const current = new Set(teams.map((team) => team.id));
  return (
    <section className="app-panel p-3" aria-labelledby="member-teams-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="member-teams-title" className="text-section text-foreground">{t("teamsCardTitle")}</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-[var(--control-height)] min-h-[var(--control-height)] shrink-0"
          onClick={() => setOpen(true)}
        >
          {t("teamsManageOwn")}
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted">{t("teamsCardHint")}</p>
      {teams.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t("teamsCardEmpty")}</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {teams.map((team) => (
            <span key={team.id} className="inline-flex items-center gap-2">
              <StatusBadge label={`${team.name} · ${disciplineLabel(t, team.discipline)}`} />
              {team.role === "coach" ? <StatusBadge label={t("teamRoleCoach")} tone="info" /> : null}
            </span>
          ))}
        </div>
      )}
      {open ? (
        <SidePanel open title={t("teamsManageOwn")} description={t("teamsCardHint")} closeLabel={t("teamsClose")} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <Input aria-label={t("teamsSearchMembers")} placeholder={t("teamsSearchMembers")} value={query} onChange={(event) => setQuery(event.target.value)} />
            {visible.length === 0 ? <p className="text-sm text-muted">{t("teamsNoMatches")}</p> : null}
            <ul className="space-y-2">
              {visible.map((team) => {
                const onTeam = current.has(team.id);
                return (
                  <li key={team.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-foreground">{team.name} · {disciplineLabel(t, team.discipline)}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant={onTeam ? "outline" : "default"}
                      onClick={() => {
                        const action = onTeam ? removeTeamMember(team.id, memberId) : addTeamMember(team.id, memberId);
                        void action.then(() => onChanged());
                      }}
                    >
                      {onTeam ? t("teamsRemoveMember") : t("teamsAddMember")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        </SidePanel>
      ) : null}
    </section>
  );
}
