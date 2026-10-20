"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { formatCosl } from "@/components/national-team/national-team-desk";
import { formatAgeClassLabel } from "@/lib/age-class";
import { FormPanel } from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAthleteNationalTeam, type AthleteNationalTeam } from "@/lib/national-team-api";
import { formatFullName } from "@/lib/person-name";

function supportLabel(t: (key: string) => string, value: string | null) {
  if (value === "sportlycee") return t("nationalTeamSupportSportlycee");
  if (value === "ssea") return t("nationalTeamSupportSsea");
  return "-";
}

function ageLabel(t: (key: string) => string, value: string) {
  return formatAgeClassLabel(t, value);
}

function coachFunction(t: (key: string) => string, value: string) {
  if (value === "national_coach") return t("nationalTeamStaffNationalCoach");
  if (value === "sportlycee_coach") return t("nationalTeamStaffSportlyceeCoach");
  return value;
}

export function MemberNationalTeamBlock({
  memberId,
  preview,
}: {
  memberId: number;
  preview?: AthleteNationalTeam | null;
}) {
  const t = useTranslations("ClubAdmin");
  const [data, setData] = useState<AthleteNationalTeam | null>(preview ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (preview !== undefined) {
      return;
    }
    let cancelled = false;
    getAthleteNationalTeam(memberId)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [memberId, preview]);

  if (failed || !data) {
    return null;
  }

  return (
    <FormPanel>
      <h2 className="text-section text-foreground">{t("nationalTeamBlockTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("nationalTeamBlockHint")}</p>
      {data.selections.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t("nationalTeamBlockEmpty")}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {data.selections.map((row) => (
            <article key={row.id} className="rounded-[var(--radius-form)] border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium text-foreground">
                  {row.squad_name} · {row.season_year}
                </h3>
                {row.is_captain ? <StatusBadge label={t("nationalTeamCaptain")} tone="info" /> : null}
              </div>
              <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted">{t("nationalTeamAgeClass")}</dt>
                  <dd className="font-medium text-foreground">{ageLabel(t, row.age_class)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t("nationalTeamWeight")}</dt>
                  <dd className="font-medium text-foreground">{row.weight_category || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t("nationalTeamLevel")}</dt>
                  <dd className="font-medium text-foreground">{data.current.ltf_level?.name || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t("nationalTeamCosl")}</dt>
                  <dd className="font-medium text-foreground">{formatCosl(t, data.current.cosl)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t("nationalTeamSupport")}</dt>
                  <dd className="font-medium text-foreground">{supportLabel(t, data.current.support)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t("nationalTeamDates")}</dt>
                  <dd className="font-medium text-foreground">
                    {row.started_on} – {row.ended_on || t("nationalTeamOpenEnded")}
                  </dd>
                </div>
              </dl>
              <div className="mt-3">
                <p className="text-xs text-muted">{t("nationalTeamCoaches")}</p>
                {row.coaches.length === 0 ? (
                  <p className="text-sm text-foreground">-</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-sm text-foreground">
                    {row.coaches.map((coach) => (
                      <li key={coach.id}>
                        {formatFullName(coach)} · {coachFunction(t, coach.function)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))}
          {data.statuses.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-foreground">{t("nationalTeamStatusHistory")}</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {data.statuses.map((row) => (
                  <li key={row.id} className="text-foreground">
                    <span className="font-medium">
                      {row.scheme === "ltf_level"
                        ? row.level?.name
                        : row.scheme === "cosl"
                          ? formatCosl(t, { pathway: row.cosl_pathway, rank: row.cosl_rank, project: row.cosl_project })
                          : supportLabel(t, row.support_program)}
                    </span>
                    <span className="text-muted">
                      {" "}
                      · {row.started_on} – {row.ended_on || t("nationalTeamOpenEnded")}
                    </span>
                    {row.source_note ? <span className="text-muted"> · {row.source_note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </FormPanel>
  );
}
