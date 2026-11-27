"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";
import { EmptyState } from "@/components/club-admin/empty-state";
import { API_URL } from "@/lib/api";
import { getJoinOverview, type JoinOverview } from "@/lib/clubmgmt-api";
import { formatDisplayDate } from "@/lib/date-display";

export function ClubJoinOverview({ clubId }: { clubId: number }) {
  const t = useTranslations("Join");
  const [overview, setOverview] = useState<JoinOverview | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJoinOverview(clubId)
      .then((row) => {
        if (!cancelled) setOverview(row);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  if (missing) {
    return <EmptyState title={t("unavailableTitle")} description={t("unavailableBody")} />;
  }
  if (!overview) {
    return <EmptyState title={t("loadingTitle")} description={t("loadingBody")} loading />;
  }

  const rulesHref = overview.rules
    ? overview.rules.kind === "url"
      ? overview.rules.url
      : `${API_URL}/api/club-management/onboarding/public/${clubId}/rules/`
    : "";

  return (
    <article className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {overview.logo_url ? (
            // The club logo is served by this site.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`${API_URL}${overview.logo_url}`} alt="" className="mb-3 h-12 w-auto" />
          ) : null}
          <h1 className="text-section text-foreground">{overview.name}</h1>
          {overview.city ? <p className="text-sm text-muted">{overview.city}</p> : null}
        </div>
        <LanguageSwitcher compact />
      </div>

      {overview.fees.length > 0 || overview.license_fee ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">{t("feesTitle")}</h2>
          <ul className="space-y-1 text-sm text-foreground">
            {overview.fees.map((fee) => (
              <li key={fee.name}>
                {fee.name} · {fee.amount} EUR
              </li>
            ))}
            {overview.license_fee ? (
              <li>
                {t("licenseFee")} · {overview.license_fee.amount} EUR
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {overview.timetable.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">{t("timetableTitle")}</h2>
          <ul className="space-y-2 text-sm text-foreground">
            {overview.timetable.map((row) => (
              <li key={`${row.weekday}-${row.start_time}-${row.name}`}>
                <p className="font-medium">
                  {t(`weekday${row.weekday}`)} · {row.start_time}–{row.end_time}
                </p>
                <p className="text-muted">
                  {row.name} · {t(`audience_${row.audience}`)}
                  {row.place ? ` · ${row.place}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {overview.rules ? (
        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{t("rulesTitle", { club: overview.name })}</h2>
          <p className="text-sm text-muted">{formatDisplayDate(overview.rules.effective_on)}</p>
          <a className="text-sm text-link" href={rulesHref} target="_blank" rel="noreferrer">
            {t("rulesLink")}
          </a>
        </section>
      ) : null}

      {overview.equipment_note ? (
        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{t("equipmentTitle")}</h2>
          <p className="whitespace-pre-wrap text-sm text-foreground">{overview.equipment_note}</p>
        </section>
      ) : null}

      {overview.email || overview.website || overview.iban ? (
        <section className="space-y-1 text-sm text-foreground">
          <h2 className="font-semibold">{t("contactTitle")}</h2>
          {overview.email ? <p>{overview.email}</p> : null}
          {overview.website ? (
            <p>
              <a className="text-link" href={overview.website} target="_blank" rel="noreferrer">
                {overview.website}
              </a>
            </p>
          ) : null}
          {overview.iban ? (
            <p>
              {overview.iban}
              {overview.bank_name ? ` · ${overview.bank_name}` : ""}
            </p>
          ) : null}
        </section>
      ) : null}

      {overview.committee.length > 0 ? (
        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{t("committeeTitle")}</h2>
          <ul className="space-y-1 text-sm text-foreground">
            {overview.committee.map((row) => (
              <li key={`${row.role}-${row.name}`}>
                {row.title || t(`role_${row.role}`)} · {row.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {overview.coaches.length > 0 ? (
        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{t("coachesTitle")}</h2>
          <ul className="space-y-1 text-sm text-foreground">
            {overview.coaches.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
