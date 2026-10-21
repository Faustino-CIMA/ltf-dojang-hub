"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { DuplicateTeamPanel, TeamForm, disciplineLabel } from "@/components/club-admin/club-teams-desk";
import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable, type EntityTableColumn } from "@/components/club-admin/entity-table";
import { HeightWeightSection, MeasurementEntryPanel } from "@/components/club-admin/height-weight-section";
import { MemberGearSummary } from "@/components/club-admin/member-gear-card";
import { TeamCompetitionPanel } from "@/components/club-admin/team-competition";
import { TeamHistoryPanel } from "@/components/club-admin/team-history";
import { TeamGroups } from "@/components/club-admin/team-groups";
import { TeamWeighInPanel } from "@/components/club-admin/team-weigh-in";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatAgeClassLabel } from "@/lib/age-class";
import { bulkTeamMembers, downloadTeamSheet, getClubTeam, removeTeamCompetition, removeTeamMember, updateTeamMemberRole, type ClubTeam, type TeamMember } from "@/lib/club-teams-api";
import { gearSockSortRank, type MemberGear } from "@/lib/member-gear-api";
import { formatDisplayDate } from "@/lib/date-display";
import { formatFullName, fullNameSortKey } from "@/lib/person-name";
import { type TableSort } from "@/lib/table-sort";

type Translator = (key: string, values?: Record<string, string | number>) => string;

const AGE_RANK: Record<string, number> = {
  youth: 0,
  pupils: 1,
  minimes: 2,
  cadet: 3,
  junior: 4,
  senior: 5,
};

const POOMSAE_RANK: Record<string, number> = {
  cadet: 0,
  junior: 1,
  under_30: 2,
  under_40: 3,
  under_50: 4,
  under_60: 5,
  under_65: 6,
  over_65: 7,
};

const POOMSAE_KEYS: Record<string, string> = {
  cadet: "teamPoomsaeCadet",
  junior: "teamPoomsaeJunior",
  under_30: "teamPoomsaeUnder30",
  under_40: "teamPoomsaeUnder40",
  under_50: "teamPoomsaeUnder50",
  under_60: "teamPoomsaeUnder60",
  under_65: "teamPoomsaeUnder65",
  over_65: "teamPoomsaeOver65",
};

const LICENCE_RANK: Record<string, number> = {
  none: 0,
  expired: 1,
  pending: 2,
  active: 3,
};

const nowrap = "whitespace-nowrap";

function poomsaeLabel(t: Translator, code: string | undefined) {
  if (!code) return "—";
  const key = POOMSAE_KEYS[code];
  return key ? t(key) : code;
}

function licenceLabel(t: Translator, status: string | undefined) {
  if (status === "active") return t("statusActive");
  if (status === "pending") return t("statusPending");
  if (status === "expired") return t("statusExpired");
  return t("teamRosterLicenceNone");
}

const CATEGORY_AGE_KEYS: Record<string, string> = {
  pupils: "nationalTeamAgePupils",
  minimes: "nationalTeamAgeMinimes",
  youth: "teamCategoryYouth",
};

const SET_KEYS: Record<string, string> = {
  wt: "teamCategorySetWt",
  be: "teamCategorySetBe",
  nl: "teamCategorySetNl",
  de: "teamCategorySetDe",
  fr: "teamCategorySetFr",
  at: "teamCategorySetAt",
  custom: "teamCategorySetCustom",
};

function categoryCell(t: Translator, member: TeamMember, setCode: string) {
  if (member.role === "coach") return <span className="text-muted">—</span>;
  if (member.weight_category) return member.weight_category;
  const reason = member.weight_category_reason;
  const ageKey = reason ? CATEGORY_AGE_KEYS[reason] : undefined;
  const setKey = SET_KEYS[setCode] ?? "teamCategorySetWt";
  const text = ageKey
    ? t("teamCategoryNoClass", { ageClass: t(ageKey) })
    : reason === "no_birth_date"
      ? t("teamCategoryNoBirthDate")
      : reason === "no_sex"
        ? t("teamCategoryNoSex")
        : reason === "no_weight"
          ? t("teamCategoryNoWeight")
          : reason === "no_set_age"
            ? t("teamCategoryNoSetAge", { age: member.category_age ?? "", set: t(setKey) })
            : "";
  if (!text) return <span className="text-muted">—</span>;
  return <span className="text-muted">{text}</span>;
}

function signedKg(t: Translator, value: string | null | undefined) {
  if (!value) return "—";
  const signed = value.startsWith("-") || value.startsWith("+") || Number(value) === 0 ? value : `+${value}`;
  return t("heightWeightKg", { value: signed });
}

function measuredCell(value: string, date: string | null | undefined) {
  return (
    <span className="block whitespace-nowrap">
      <span className="block text-foreground">{value}</span>
      {date ? <span className="block text-xs text-muted">{formatDisplayDate(date)}</span> : null}
    </span>
  );
}

function licenceCell(t: Translator, member: TeamMember) {
  const status = member.licence_status;
  const warning = member.licence_warning;
  const marker =
    warning === "expires" ? (
      <span className="badge-warning inline-flex items-center rounded-[var(--radius-chip)] border px-2 py-0.5 text-xs font-medium">{t("teamLicenceExpires")}</span>
    ) : warning === "missing" ? (
      <span className="badge-warning inline-flex items-center rounded-[var(--radius-chip)] border px-2 py-0.5 text-xs font-medium">{t("teamLicenceMissing")}</span>
    ) : null;
  const statusNode =
    !status || status === "none" ? (
      <span className="text-muted">{t("teamRosterLicenceNone")}</span>
    ) : (
      <StatusBadge label={licenceLabel(t, status)} tone={status === "active" ? "success" : status === "pending" ? "warning" : "neutral"} />
    );
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {statusNode}
      {marker}
    </span>
  );
}

function gearCell(t: Translator, pss: string, member: TeamMember) {
  if (member.role === "coach") return <span className="text-muted">—</span>;
  const gear = member.gear;
  const shown = (value?: string) => value || "—";
  if (pss === "kpnp") {
    return (
      <span className="block">
        <span className="block">{t("gearSock")} {shown(gear?.kpnp_sock)}</span>
        <span className="block text-xs text-muted">{t("gearGlove")} {shown(gear?.kpnp_glove)}</span>
      </span>
    );
  }
  if (pss === "daedo") {
    return (
      <span className="block">
        <span className="block">{t("gearSock")} {shown(gear?.daedo_sock)}</span>
        <span className="block text-xs text-muted">{t("gearGlove")} {shown(gear?.daedo_glove)}</span>
      </span>
    );
  }
  return (
    <span className="block">
      <span className="block">{t("gearDaedo")} {shown(gear?.daedo_sock)}</span>
      <span className="block text-xs text-muted">{t("gearKpnp")} {shown(gear?.kpnp_sock)}</span>
    </span>
  );
}

function weightCell(t: Translator, member: TeamMember) {
  const value = signedKg(t, member.weight_delta_kg);
  if (!member.weight_warning) return value;
  const over = member.weight_delta_kg != null && Number(member.weight_delta_kg) > 0;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span>{value}</span>
      <span className="badge-warning inline-flex items-center rounded-[var(--radius-chip)] border px-2 py-0.5 text-xs font-medium">
        {over ? t("teamWeightOver") : t("teamWeightNear")}
      </span>
    </span>
  );
}

export function TeamRoster({
  teamId,
  onBack,
  onDuplicated,
}: {
  teamId: number;
  onBack: () => void;
  onDuplicated?: (team: ClubTeam) => void;
}) {
  const t = useTranslations("ClubAdmin");
  const [team, setTeam] = useState<ClubTeam | null>(null);
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [panel, setPanel] = useState<"weigh" | "competition" | "edit" | "duplicate" | "history" | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [weightMember, setWeightMember] = useState<TeamMember | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sort, setSort] = useState<TableSort>({ key: "name", direction: "asc" });
  const locale = useLocale();
  const loading = loadedId !== teamId;

  useEffect(() => {
    let cancelled = false;
    void getClubTeam(teamId)
      .then((row) => {
        if (!cancelled) setTeam(row);
      })
      .catch(() => {
        if (!cancelled) setTeam(null);
      })
      .finally(() => {
        if (!cancelled) setLoadedId(teamId);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const rows = useMemo(() => team?.members ?? [], [team]);
  const athletes = rows.filter((row) => row.role !== "coach");
  const coaches = rows.filter((row) => row.role === "coach");
  const poomsae = team?.discipline === "poomsae";
  const archived = Boolean(team?.archived);
  const setCode = team?.category_set || "wt";
  const selectedIds = useMemo(
    () => selected.filter((id) => rows.some((row) => row.id === id)),
    [rows, selected],
  );

  function reloadTeam() {
    void getClubTeam(teamId).then((row) => setTeam(row));
  }

  const applyTeam = useCallback((next: ClubTeam, message: string) => {
    setTeam(next);
    setNotice(message);
    setBulkConfirm(false);
  }, []);

  const columns = useMemo<Array<EntityTableColumn<TeamMember>>>(() => {
    const select: EntityTableColumn<TeamMember> = {
      key: "select",
      header: (
        <Checkbox
          aria-label={t("teamSelectAll")}
          checked={rows.length > 0 && rows.every((row) => selectedIds.includes(row.id))}
          onCheckedChange={() => {
            setBulkConfirm(false);
            const all = rows.every((row) => selectedIds.includes(row.id));
            setSelected(all ? [] : rows.map((row) => row.id));
          }}
        />
      ),
      headerClassName: "w-12",
      cellClassName: "w-12",
      render: (row) => (
        <Checkbox
          aria-label={t("teamSelectMember", { name: formatFullName(row) })}
          checked={selectedIds.includes(row.id)}
          onCheckedChange={() => {
            setBulkConfirm(false);
            setSelected((current) => (current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id]));
          }}
        />
      ),
    };
    const actions: EntityTableColumn<TeamMember> = {
      key: "actions",
      header: t("teamsActions"),
      headerClassName: `text-right ${nowrap}`,
      cellClassName: `text-right ${nowrap}`,
      render: (row) => {
        const coach = row.role === "coach";
        return (
          <RowActionMenu
            label={t("teamRowActions", { name: formatFullName(row) })}
            actions={[
              ...(archived
                ? []
                : [
                    {
                      key: "role",
                      label: coach ? t("teamMakeAthlete") : t("teamMakeCoach"),
                      onSelect: () => {
                        void updateTeamMemberRole(teamId, row.id, coach ? "athlete" : "coach").then((next) =>
                          applyTeam(next, t("teamRoleUpdated")),
                        );
                      },
                    },
                    {
                      key: "weight",
                      label: t("teamAddWeight"),
                      onSelect: () => setWeightMember(row),
                    },
                  ]),
              {
                key: "open",
                label: t("teamOpenMember"),
                href: `/${locale}/dashboard/club/members/${row.id}`,
                onSelect: () => undefined,
              },
              ...(archived
                ? []
                : [
                    {
                      key: "remove",
                      label: t("teamRemoveFromTeam"),
                      confirmLabel: t("teamRemovePrompt", { name: formatFullName(row) }),
                      destructive: true,
                      onSelect: () => {
                        void removeTeamMember(teamId, row.id).then((next) => applyTeam(next, t("teamMemberRemoved")));
                      },
                    },
                  ]),
            ]}
          />
        );
      },
    };
    const name: EntityTableColumn<TeamMember> = {
      key: "name",
      header: t("teamsNameColumn"),
      sortable: true,
      sortValue: (row) => fullNameSortKey(row),
      headerClassName: nowrap,
      cellClassName: nowrap,
      render: (row) => (
        <span className="inline-flex items-center gap-2">
          <span>{formatFullName(row)}</span>
          {row.role === "coach" ? <StatusBadge label={t("teamRoleCoach")} tone="info" /> : null}
        </span>
      ),
    };
    const sex: EntityTableColumn<TeamMember> = {
      key: "sex",
      header: t("sexLabel"),
      sortable: true,
      sortValue: (row) => row.sex ?? "",
      headerClassName: `w-12 text-center ${nowrap}`,
      cellClassName: `w-12 text-center ${nowrap}`,
      render: (row) =>
        row.sex === "F" || row.sex === "M" ? (
          <span aria-label={row.sex === "F" ? t("sexFemale") : t("sexMale")}>{row.sex === "F" ? "♀" : "♂"}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    };
    const birth: EntityTableColumn<TeamMember> = {
      key: "birth_year",
      header: t("teamRosterBirthYear"),
      sortable: true,
      sortValue: (row) => row.birth_year ?? null,
      headerClassName: nowrap,
      cellClassName: nowrap,
      render: (row) => row.birth_year ?? "—",
    };
    const gradeHeader = poomsae ? t("teamRosterGradePoomsae") : t("teamRosterGrade");
    const grade: EntityTableColumn<TeamMember> = {
      key: "belt_rank",
      header: gradeHeader,
      sortable: true,
      sortValue: (row) => row.belt_rank ?? "",
      headerClassName: nowrap,
      cellClassName: nowrap,
      render: (row) => row.belt_rank || "—",
    };
    const height: EntityTableColumn<TeamMember> = {
      key: "latest_height",
      header: t("heightWeightLatestHeight"),
      sortable: true,
      sortValue: (row) => row.latest_height_cm ?? null,
      headerClassName: nowrap,
      cellClassName: nowrap,
      render: (row) =>
        row.latest_height_cm
          ? measuredCell(t("heightWeightCm", { value: row.latest_height_cm }), row.latest_height_on)
          : "—",
    };
    const licence: EntityTableColumn<TeamMember> = {
      key: "licence_status",
      header: t("teamRosterLicence"),
      sortable: true,
      sortValue: (row) => LICENCE_RANK[row.licence_status ?? "none"] ?? 0,
      headerClassName: nowrap,
      cellClassName: nowrap,
      render: (row) => licenceCell(t, row),
    };
    const leading = archived ? [] : [select];
    if (poomsae) {
      return [
        ...leading,
        name,
        sex,
        birth,
        {
          key: "poomsae_division",
          header: t("teamRosterPoomsaeDivision"),
          sortable: true,
          sortValue: (row) => (row.poomsae_division ? POOMSAE_RANK[row.poomsae_division] ?? null : null),
          headerClassName: nowrap,
          cellClassName: nowrap,
          render: (row) => poomsaeLabel(t, row.poomsae_division),
        },
        grade,
        height,
        licence,
        actions,
      ];
    }
    const pss = team?.pss_system || "";
    const gear: EntityTableColumn<TeamMember> = {
      key: "gear",
      header: t("gearColumn"),
      sortable: true,
      sortValue: (row) => gearSockSortRank(pss, row.gear, row.role),
      render: (row) => gearCell(t, pss, row),
    };
    return [
      ...leading,
      name,
      gear,
      sex,
      birth,
      {
        key: "age_class",
        header: t("teamRosterAgeClass"),
        sortable: true,
        sortValue: (row) => (row.age_class ? AGE_RANK[row.age_class] ?? null : null),
        headerClassName: nowrap,
        cellClassName: nowrap,
        render: (row) => (row.age_class ? formatAgeClassLabel(t, row.age_class) : "—"),
      },
      grade,
      {
        key: "latest_weight",
        header: t("heightWeightLatestWeight"),
        sortable: true,
        sortValue: (row) => (row.latest_weight_kg ? Number(row.latest_weight_kg) : null),
        headerClassName: nowrap,
        cellClassName: nowrap,
        render: (row) =>
          row.latest_weight_kg
            ? measuredCell(t("heightWeightKg", { value: row.latest_weight_kg }), row.latest_weight_on)
            : "—",
      },
      {
        key: "weight_category",
        header: t("teamRosterCategory"),
        sortable: true,
        sortValue: (row) => row.weight_category || null,
        headerClassName: nowrap,
        cellClassName: nowrap,
        render: (row) => categoryCell(t, row, setCode),
      },
      {
        key: "weight_delta_kg",
        header: t("teamRosterDelta"),
        sortable: true,
        sortValue: (row) => (row.weight_delta_kg ? Number(row.weight_delta_kg) : null),
        headerClassName: nowrap,
        cellClassName: `tabular-nums ${nowrap}`,
        render: (row) => weightCell(t, row),
      },
      height,
      licence,
      actions,
    ];
  }, [applyTeam, archived, locale, poomsae, rows, selectedIds, setCode, t, team?.pss_system, teamId]);

  const saveGear = (memberId: number, saved: MemberGear) => {
    setTeam((current) =>
      current
        ? {
            ...current,
            members: current.members?.map((member) =>
              member.id === memberId ? { ...member, gear: saved, clothing: saved.clothing } : member,
            ),
          }
        : current,
    );
  };
  const renderGearDetail = (row: TeamMember) =>
    expandedId === row.id ? (
      <div className="space-y-3">
        <HeightWeightSection key={`${row.id}-${reloadToken}`} memberId={row.id} embedded onChanged={reloadTeam} />
        <MemberGearSummary
          memberId={row.id}
          gear={{ ...(row.gear ?? {}), clothing: row.clothing ?? [] }}
          onSaved={(saved) => saveGear(row.id, saved)}
        />
      </div>
    ) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-section text-foreground">{team?.name ?? t("teamsTitle")}</h2>
          {team ? <p className="mt-1 text-sm text-muted">{disciplineLabel(t, team.discipline)}</p> : null}
          {team?.competition_on ? (
            <div className="mt-1 flex items-center gap-1">
              <p className="text-sm text-foreground">
                {[team.competition_name, formatDisplayDate(team.competition_on)].filter(Boolean).join(" · ")}
              </p>
              {archived ? null : (
                <RowActionMenu
                  label={t("teamCompetitionActions")}
                  actions={[
                    {
                      key: "remove",
                      label: t("teamCompetitionRemove"),
                      confirmLabel: t("teamCompetitionRemovePrompt"),
                      destructive: true,
                      onSelect: () => {
                        void removeTeamCompetition(teamId).then((next) => {
                          setTeam(next);
                          setPanel(null);
                        });
                      },
                    },
                  ]}
                />
              )}
            </div>
          ) : null}
          {team && !poomsae ? (
            <p className="mt-1 text-sm text-muted">{t(SET_KEYS[setCode] ?? "teamCategorySetWt")}</p>
          ) : null}
          {archived ? <p className="mt-1 text-sm text-muted">{t("teamArchivedHint")}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {team ? (
            <>
              <Button type="button" variant="outline" onClick={() => setPanel("edit")}>{t("teamsEdit")}</Button>
              <Button type="button" variant="outline" onClick={() => setPanel("duplicate")}>{t("teamDuplicateAction")}</Button>
              <Button type="button" variant="outline" onClick={() => setPanel("history")}>{t("teamHistory")}</Button>
              {archived ? null : (
                <>
                  <Button type="button" variant="outline" onClick={() => setPanel("weigh")}>{t("teamWeighIn")}</Button>
                  <Button type="button" variant="outline" onClick={() => setPanel("competition")}>
                    {team.competition_on ? t("teamCompetition") : t("teamCompetitionAdd")}
                  </Button>
                </>
              )}
              <Button type="button" variant="outline" onClick={() => void downloadTeamSheet(team.id, "csv", locale)}>{t("teamExportCsv")}</Button>
              <Button type="button" variant="outline" onClick={() => void downloadTeamSheet(team.id, "pdf", locale)}>{t("teamExportPdf")}</Button>
            </>
          ) : null}
          <Button type="button" variant="outline" onClick={onBack}>{t("teamRosterBack")}</Button>
        </div>
      </div>
      {loading ? <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading /> : null}
      {!loading && !team ? <EmptyState title={t("teamsEmptyTitle")} description={t("teamsEmptySubtitle")} /> : null}
      {!loading && team && rows.length === 0 ? (
        <EmptyState title={t("teamsNoMembers")} />
      ) : null}
      {!loading && team && rows.length > 0 ? (
        <>
          {notice ? <p role="status" className="text-sm text-muted">{notice}</p> : null}
          {!archived && selectedIds.length > 0 ? (
            <div role="region" aria-label={t("teamBulkBar")} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-border bg-secondary px-3 py-2">
              <span className="text-sm text-foreground">{t("teamBulkCount", { count: selectedIds.length })}</span>
              {bulkConfirm ? (
                <>
                  <span className="text-sm text-foreground">{t("teamBulkRemoveConfirm", { count: selectedIds.length })}</span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      void bulkTeamMembers(teamId, "remove", selectedIds).then((next) => {
                        setSelected([]);
                        applyTeam(next, t("teamMemberRemoved"));
                      });
                    }}
                  >
                    {t("teamRemoveConfirm")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setBulkConfirm(false)}>{t("teamsClose")}</Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={() => void bulkTeamMembers(teamId, "coach", selectedIds).then((next) => applyTeam(next, t("teamRoleUpdated")))}>{t("teamMakeCoach")}</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void bulkTeamMembers(teamId, "athlete", selectedIds).then((next) => applyTeam(next, t("teamRoleUpdated")))}>{t("teamMakeAthlete")}</Button>
                  <Button type="button" variant="destructive" size="sm" onClick={() => setBulkConfirm(true)}>{t("teamRemoveFromTeam")}</Button>
                </>
              )}
            </div>
          ) : null}
          {poomsae ? <p className="text-xs text-muted">{t("teamPoomsaeSource")}</p> : (
            <p className="text-xs text-muted">{t("teamWeightMarginHint", { margin: team.weight_margin_kg ?? "1.0" })}</p>
          )}
          {coaches.length > 0 ? (
            <section className="space-y-2" aria-labelledby="team-coaches-heading">
              <h3 id="team-coaches-heading" className="text-sm font-medium text-foreground">{t("teamCoachesHeading")}</h3>
              <EntityTable
                columns={columns}
                rows={coaches}
                sort={sort}
                onSortChange={setSort}
                clientSort
                onRowClick={(row) => setExpandedId((current) => (current === row.id ? null : row.id))}
                renderDetail={renderGearDetail}
              />
            </section>
          ) : null}
          <section className="space-y-2" aria-labelledby={coaches.length > 0 ? "team-athletes-heading" : undefined}>
            {coaches.length > 0 ? (
              <h3 id="team-athletes-heading" className="text-sm font-medium text-foreground">{t("teamAthletesHeading")}</h3>
            ) : null}
            {athletes.length === 0 ? <p className="text-sm text-muted">{t("teamsNoMembers")}</p> : (
              <EntityTable
                columns={columns}
                rows={athletes}
                sort={sort}
                onSortChange={setSort}
                clientSort
                onRowClick={(row) => setExpandedId((current) => (current === row.id ? null : row.id))}
                renderDetail={renderGearDetail}
              />
            )}
          </section>
        </>
      ) : null}
      {!loading && team && poomsae ? <TeamGroups team={team} onChanged={setTeam} /> : null}
      {panel === "weigh" && team ? (
        <TeamWeighInPanel
          team={team}
          onClose={() => setPanel(null)}
          onSaved={(next) => {
            setTeam(next);
            setReloadToken((value) => value + 1);
            setPanel(null);
          }}
        />
      ) : null}
      {panel === "competition" && team ? (
        <TeamCompetitionPanel team={team} onClose={() => setPanel(null)} onSaved={(next) => { setTeam(next); setPanel(null); }} />
      ) : null}
      {panel === "history" && team ? <TeamHistoryPanel teamId={team.id} onClose={() => setPanel(null)} /> : null}
      {panel === "duplicate" && team ? (
        <DuplicateTeamPanel
          teamId={team.id}
          onClose={() => setPanel(null)}
          onCreated={(created) => onDuplicated?.(created)}
        />
      ) : null}
      {panel === "edit" && team ? (
        <TeamForm
          clubId={team.club}
          team={team}
          onClose={() => setPanel(null)}
          onSaved={(next) => {
            setTeam(next);
            setPanel(null);
          }}
        />
      ) : null}
      {weightMember ? (
        <MeasurementEntryPanel
          memberId={weightMember.id}
          row={null}
          busy={false}
          onClose={() => setWeightMember(null)}
          onSaved={() => {
            setWeightMember(null);
            reloadTeam();
          }}
        />
      ) : null}
    </div>
  );
}
