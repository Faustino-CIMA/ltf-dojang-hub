"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";
import { EmptyState } from "@/components/club-admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_URL } from "@/lib/api";
import { confirmJoinCode, getJoinOverview, requestJoinCode, type JoinOverview } from "@/lib/clubmgmt-api";
import { formatDisplayDate } from "@/lib/date-display";

const JOIN_ERRORS = ["rate_email", "rate_ip", "rate_submit", "rate_link", "code_invalid", "email_failed", "email_invalid"] as const;

export function ClubJoinOverview({ token }: { token: string }) {
  const t = useTranslations("Join");
  const locale = useLocale();
  const [overview, setOverview] = useState<JoinOverview | null>(null);
  const [missing, setMissing] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJoinOverview(token)
      .then((row) => {
        if (!cancelled) setOverview(row);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const detail = error instanceof Error ? error.message : "";
        if (detail === "rate_link") {
          setNotice(t("rate_link"));
        }
        setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  function explain(error: unknown) {
    const detail = error instanceof Error ? error.message : "";
    if ((JOIN_ERRORS as readonly string[]).includes(detail)) {
      return t(detail as (typeof JOIN_ERRORS)[number]);
    }
    return t("email_failed");
  }

  if (missing) {
    return <EmptyState title={t("unavailableTitle")} description={notice || t("unavailableBody")} />;
  }
  if (!overview) {
    return <EmptyState title={t("loadingTitle")} description={t("loadingBody")} loading />;
  }

  const rulesHref = overview.rules
    ? overview.rules.kind === "url"
      ? overview.rules.url
      : `${API_URL}/api/club-management/onboarding/public/${encodeURIComponent(token)}/rules/`
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

      <section className="space-y-3 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-foreground">{t("emailTitle")}</h2>
        <p className="text-sm text-muted">{t("emailHint")}</p>
        {confirmed ? <p className="text-sm text-foreground">{t("emailConfirmed")}</p> : null}
        {notice && !missing ? <p className="text-sm text-destructive">{notice}</p> : null}
        <div className="space-y-2">
          <Label htmlFor="join-email">{t("emailLabel")}</Label>
          <Input id="join-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setNotice("");
            void requestJoinCode(token, email, locale)
              .then(() => {
                setCodeSent(true);
                setNotice(t("emailSent"));
              })
              .catch((error: unknown) => setNotice(explain(error)))
              .finally(() => setBusy(false));
          }}
        >
          {t("emailSend")}
        </Button>
        {codeSent ? (
          <div className="space-y-2">
            <Label htmlFor="join-code">{t("emailCode")}</Label>
            <Input id="join-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} />
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setNotice("");
                void confirmJoinCode(token, email, code)
                  .then(() => {
                    setConfirmed(true);
                    setNotice("");
                  })
                  .catch((error: unknown) => setNotice(explain(error)))
                  .finally(() => setBusy(false));
              }}
            >
              {t("emailCheck")}
            </Button>
          </div>
        ) : null}
      </section>
    </article>
  );
}
