"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Activity,
  AlertTriangle,
  CircleHelp,
  Container,
  Database,
  GitBranch,
  HardDrive,
  HeartPulse,
  KeyRound,
  Mail,
  Server,
  ShieldAlert,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { SummaryCard } from "@/components/club-admin/summary-card";
import { OpsLayout } from "@/components/ops/ops-layout";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { InfoHint } from "@/components/ui/info-hint";
import { LoadingCard } from "@/components/ui/loading-card";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDisplayDateTime } from "@/lib/date-display";
import { getOpsOverview, getOpsSessions, type HealthCheck, type OpsOverview, type OpsSession } from "@/lib/ops-api";

const HEALTH_CHECKS: Array<{ key: string; icon: LucideIcon }> = [
  { key: "postgres", icon: Database },
  { key: "redis", icon: Zap },
  { key: "celery", icon: Workflow },
  { key: "smtp", icon: Mail },
  { key: "media", icon: HardDrive },
  { key: "migrations", icon: GitBranch },
  { key: "env_keys", icon: KeyRound },
  { key: "docker", icon: Container },
];

function toneForOk(ok: boolean): "success" | "danger" {
  return ok ? "success" : "danger";
}

function checkLabel(t: ReturnType<typeof useTranslations>, name: string) {
  const key = `healthCheck_${name}`;
  return t.has(key) ? t(key) : name.replaceAll("_", " ");
}

function HealthCheckTitle({
  name,
  icon: Icon,
  accent = false,
  badge,
}: {
  name: string;
  icon: LucideIcon;
  accent?: boolean;
  badge: ReactNode;
}) {
  const t = useTranslations("Ops");
  const label = checkLabel(t, name);
  const helpKey = `healthHelp_${name}`;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className={accent ? "size-4 shrink-0 text-[var(--accent)]" : "size-4 shrink-0 text-muted"} aria-hidden />
        <p className="truncate text-sm font-semibold text-foreground">{label}</p>
        {t.has(helpKey) ? (
          <InfoHint
            size="compact"
            icon={CircleHelp}
            tooltipAlign="left"
            ariaLabel={t("healthHelpAria", { name: label })}
          >
            {t(helpKey)}
          </InfoHint>
        ) : null}
      </div>
      {badge}
    </div>
  );
}

export default function OpsOverviewPage() {
  const t = useTranslations("Ops");
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [sessions, setSessions] = useState<OpsSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const [nextOverview, nextSessions] = await Promise.all([getOpsOverview(), getOpsSessions()]);
      setOverview(nextOverview);
      setSessions(nextSessions.results);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const checks = overview ? Object.entries(overview.health.checks) : [];
  const orderedChecks = [
    ...HEALTH_CHECKS.filter((row) => checks.some(([name]) => name === row.key)).map((row) => {
      const found = checks.find(([name]) => name === row.key);
      return [row.key, found?.[1]] as [string, HealthCheck | undefined];
    }),
    ...checks.filter(([name]) => !HEALTH_CHECKS.some((row) => row.key === name)),
  ];

  return (
    <OpsLayout title={t("overviewTitle")} subtitle={t("overviewSubtitle")}>
      <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title={t("cardOnline")}
          value={isLoading ? "…" : String(overview?.online_sessions ?? "—")}
          icon={Activity}
          tone="accent"
        />
        <SummaryCard
          title={t("cardAlerts")}
          value={isLoading ? "…" : String(overview?.open_alerts ?? "—")}
          icon={AlertTriangle}
          tone={overview && overview.open_alerts > 0 ? "danger" : "success"}
        />
        <SummaryCard
          title={t("cardFailedLogins")}
          value={isLoading ? "…" : String(overview?.failed_logins_24h ?? "—")}
          helper={t("last24h")}
          icon={ShieldAlert}
          tone={overview && overview.failed_logins_24h > 0 ? "warning" : "neutral"}
        />
        <SummaryCard
          title={t("cardUsers")}
          value={isLoading ? "…" : String(overview?.user_count ?? "—")}
          helper={t("superuserCount", { count: overview?.superuser_count ?? 0 })}
          icon={Users}
          tone="neutral"
        />
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-center gap-3">
          <HeartPulse className="size-5 text-[var(--accent)]" aria-hidden />
          <h2 className="text-lg font-semibold text-foreground">{t("healthTitle")}</h2>
          {isLoading ? <Spinner className="size-5" label={t("healthLoadingLabel")} /> : null}
        </div>
        <p className="mt-1 text-sm text-muted">
          {overview
            ? t("healthMeta", {
                version: overview.health.app_version || "—",
                django: overview.health.django_version,
              })
            : t("healthLoadingMeta")}
        </p>
        <div
          className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          role={isLoading ? "status" : undefined}
          aria-busy={isLoading || undefined}
          aria-live={isLoading ? "polite" : undefined}
        >
          {isLoading
            ? HEALTH_CHECKS.map((row, index) => {
                const Icon = row.icon;
                return (
                  <LoadingCard
                    key={row.key}
                    delayMs={index * 70}
                    header={
                      <HealthCheckTitle
                        name={row.key}
                        icon={Icon}
                        accent
                        badge={<StatusBadge label={t("statusChecking")} tone="neutral" />}
                      />
                    }
                    description={t(`healthChecking_${row.key}`)}
                  />
                );
              })
            : orderedChecks.map(([name, check]) => {
                const Icon = HEALTH_CHECKS.find((row) => row.key === name)?.icon ?? Server;
                if (!check) {
                  return null;
                }
                return (
                  <div key={name} className="app-panel relative p-4">
                    <HealthCheckTitle
                      name={name}
                      icon={Icon}
                      badge={<StatusBadge label={check.ok ? t("statusOk") : t("statusDown")} tone={toneForOk(check.ok)} />}
                    />
                    <p className="mt-2 text-sm text-muted">{check.detail}</p>
                  </div>
                );
              })}
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Server className="size-4 text-muted" aria-hidden />
          <h2 className="text-lg font-semibold text-foreground">{t("sessionsTitle")}</h2>
        </div>
        {isLoading ? (
          <EmptyState title={t("sessionsLoadingTitle")} description={t("sessionsLoadingSubtitle")} loading />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted">{t("sessionsEmpty")}</p>
        ) : (
          <EntityTable
            columns={[
              { key: "username", header: t("colUser") },
              { key: "role", header: t("colRole") },
              {
                key: "is_superuser",
                header: t("colSuperuser"),
                render: (row) => (row.is_superuser ? t("yes") : t("no")),
              },
              { key: "last_ip", header: t("colIp"), render: (row) => row.last_ip || "—" },
              {
                key: "last_used_at",
                header: t("colLastUsed"),
                render: (row) => (row.last_used_at ? formatDisplayDateTime(row.last_used_at) : "—"),
              },
            ]}
            rows={sessions.map((session) => ({ ...session, id: session.user_id }))}
          />
        )}
      </section>
    </OpsLayout>
  );
}
