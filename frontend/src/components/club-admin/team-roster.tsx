"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { disciplineLabel } from "@/components/club-admin/club-teams-desk";
import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable, type EntityTableColumn } from "@/components/club-admin/entity-table";
import { HeightWeightSection } from "@/components/club-admin/height-weight-section";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatAgeClassLabel } from "@/lib/age-class";
import { getClubTeam, type ClubTeam, type TeamMember } from "@/lib/club-teams-api";
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

function licenceCell(t: Translator, status: string | undefined) {
  if (!status || status === "none") {
    return <span className="text-muted">{t("teamRosterLicenceNone")}</span>;
  }
  const tone = status === "active" ? "success" : status === "pending" ? "warning" : "neutral";
  return <StatusBadge label={licenceLabel(t, status)} tone={tone} />;
}

export function TeamRoster({ teamId, onBack }: { teamId: number; onBack: () => void }) {
  const t = useTranslations("ClubAdmin");
  const [team, setTeam] = useState<ClubTeam | null>(null);
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sort, setSort] = useState<TableSort>({ key: "name", direction: "asc" });
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

  const rows = team?.members ?? [];
  const poomsae = team?.discipline === "poomsae";

  const columns = useMemo<Array<EntityTableColumn<TeamMember>>>(() => {
    const name: EntityTableColumn<TeamMember> = {
      key: "name",
      header: t("teamsNameColumn"),
      sortable: true,
      sortValue: (row) => fullNameSortKey(row),
      headerClassName: nowrap,
      cellClassName: nowrap,
      render: (row) => formatFullName(row),
    };
    const sex: EntityTableColumn<TeamMember> = {
      key: "sex",
      header: t("sexLabel"),
      sortable: true,
      sortValue: (row) => row.sex ?? "",
      headerClassName: `w-12 text-center ${nowrap}`,
      cellClassName: `w-12 text-center ${nowrap}`,
      render: (row) => (
        <span aria-label={row.sex === "F" ? t("sexFemale") : t("sexMale")}>{row.sex === "F" ? "♀" : "♂"}</span>
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
      render: (row) => licenceCell(t, row.licence_status),
    };
    if (poomsae) {
      return [
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
      ];
    }
    return [
      name,
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
        render: (row) => row.weight_category || "—",
      },
      {
        key: "weight_delta_kg",
        header: t("teamRosterDelta"),
        sortable: true,
        sortValue: (row) => (row.weight_delta_kg ? Number(row.weight_delta_kg) : null),
        headerClassName: nowrap,
        cellClassName: `tabular-nums ${nowrap}`,
        render: (row) => signedKg(t, row.weight_delta_kg),
      },
      height,
      licence,
    ];
  }, [poomsae, t]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-section text-foreground">{team?.name ?? t("teamsTitle")}</h2>
          {team ? <p className="mt-1 text-sm text-muted">{disciplineLabel(t, team.discipline)}</p> : null}
        </div>
        <Button type="button" variant="outline" onClick={onBack}>
          {t("teamRosterBack")}
        </Button>
      </div>
      {loading ? <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading /> : null}
      {!loading && !team ? <EmptyState title={t("teamsEmptyTitle")} description={t("teamsEmptySubtitle")} /> : null}
      {!loading && team && rows.length === 0 ? (
        <EmptyState title={t("teamsNoMembers")} />
      ) : null}
      {!loading && team && rows.length > 0 ? (
        <>
          {poomsae ? <p className="text-xs text-muted">{t("teamPoomsaeSource")}</p> : null}
          <EntityTable
            columns={columns}
            rows={rows}
            sort={sort}
            onSortChange={setSort}
            clientSort
            onRowClick={(row) => setExpandedId((current) => (current === row.id ? null : row.id))}
            renderDetail={(row) =>
              expandedId === row.id ? <HeightWeightSection memberId={row.id} embedded /> : null
            }
          />
        </>
      ) : null}
    </div>
  );
}
