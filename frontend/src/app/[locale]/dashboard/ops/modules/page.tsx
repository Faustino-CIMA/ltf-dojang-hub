"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, KeyRound } from "lucide-react";

import { EntityTable } from "@/components/club-admin/entity-table";
import { OpsLayout } from "@/components/ops/ops-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { formatDisplayDateTime } from "@/lib/date-display";
import {
  getOpsModules,
  mintProductCode,
  redeemProductCode,
  setClubModuleAssignment,
  type CatalogModule,
  type OpsModules,
} from "@/lib/modules-api";

function toneForStatus(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "active") return "success";
  if (status === "expired") return "warning";
  if (status === "revoked" || status === "invalid") return "danger";
  return "neutral";
}

export default function OpsModulesPage() {
  const t = useTranslations("Ops");
  const [data, setData] = useState<OpsModules | null>(null);
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErrorMessage(null);
    try {
      setData(await getOpsModules());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const perClubEntitled = useMemo(
    () => (data?.modules ?? []).filter((row) => row.scope === "club" && row.entitled),
    [data],
  );

  const copyInstallId = async () => {
    if (!data?.install_id) return;
    try {
      await navigator.clipboard.writeText(data.install_id);
      setSuccessMessage(t("modulesInstallIdCopied"));
    } catch {
      setErrorMessage(t("saveError"));
    }
  };

  const redeem = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      await redeemProductCode(code.trim());
      setCode("");
      setSuccessMessage(t("modulesRedeemed"));
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setBusy(false);
    }
  };

  const mintPreview = async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const minted = await mintProductCode(["preview"]);
      setCode(minted.code);
      setSuccessMessage(t("modulesMinted"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setBusy(false);
    }
  };

  const toggleAssignment = async (clubId: number, moduleId: string, enabled: boolean) => {
    setErrorMessage(null);
    try {
      await setClubModuleAssignment(clubId, moduleId, enabled);
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    }
  };

  const assignmentEnabled = (clubId: number, moduleId: string) =>
    Boolean(data?.assignments.some((row) => row.club_id === clubId && row.module_id === moduleId && row.enabled));

  const statusLabel = (row: CatalogModule) => {
    if (row.status === "active") return t("modulesStatusActive");
    if (row.status === "expired") return t("modulesStatusExpired");
    return t("modulesStatusOff");
  };

  return (
    <OpsLayout title={t("modulesTitle")} subtitle={t("modulesSubtitle")}>
      <ActionNotices
        error={errorMessage}
        success={successMessage}
        onDismiss={() => {
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
      />

      <section className="app-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{t("modulesInstallId")}</p>
            <p className="mt-1 font-mono text-sm text-muted">{data?.install_id || "—"}</p>
            <p className="mt-2 max-w-2xl text-sm text-muted">{t("modulesInstallHint")}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => void copyInstallId()} disabled={!data?.install_id}>
            <Copy className="size-4" aria-hidden />
            {t("modulesCopyInstallId")}
          </Button>
        </div>
      </section>

      <section className="mt-6 app-panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="size-4 text-muted" aria-hidden />
          <h2 className="text-lg font-semibold text-foreground">{t("modulesRedeemTitle")}</h2>
        </div>
        <p className="mb-4 text-sm text-muted">{t("modulesRedeemHint")}</p>
        <div className="flex flex-col gap-3 md:flex-row">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={t("modulesCodePlaceholder")}
            className="font-mono"
            aria-label={t("modulesCodePlaceholder")}
          />
          <Button type="button" variant="primary" onClick={() => void redeem()} disabled={busy || !code.trim()}>
            {t("modulesRedeemAction")}
          </Button>
          {data?.can_mint_locally ? (
            <Button type="button" variant="outline" onClick={() => void mintPreview()} disabled={busy}>
              {t("modulesMintPreview")}
            </Button>
          ) : null}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">{t("modulesCatalogTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("modulesCatalogHint")}</p>
        <div className="mt-4">
          <EntityTable
            columns={[
              { key: "label", header: t("modulesColModule") },
              { key: "id", header: t("modulesColId") },
              {
                key: "scope",
                header: t("modulesColScope"),
                render: (row) => (row.scope === "club" ? t("modulesScopeClub") : t("modulesScopeInstall")),
              },
              {
                key: "status",
                header: t("colStatus"),
                render: (row) => (
                  <StatusBadge label={statusLabel(row)} tone={toneForStatus(row.status || "not_entitled")} />
                ),
              },
              {
                key: "shipped",
                header: t("modulesColShipped"),
                render: (row) => (row.shipped ? t("yes") : t("modulesNotShipped")),
              },
              {
                key: "expires_at",
                header: t("modulesColExpiry"),
                render: (row) => (row.expires_at ? formatDisplayDateTime(row.expires_at) : "—"),
              },
            ]}
            rows={data?.modules ?? []}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">{t("modulesMatrixTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("modulesMatrixHint")}</p>
        {perClubEntitled.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t("modulesMatrixEmpty")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="px-3 py-2 font-semibold text-foreground">{t("modulesColClub")}</th>
                  {perClubEntitled.map((mod) => (
                    <th key={mod.id} className="px-3 py-2 font-semibold text-foreground">
                      {mod.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.clubs ?? []).map((club) => (
                  <tr key={club.id} className="border-b border-[var(--border)]">
                    <td className="px-3 py-2 text-foreground">{club.name}</td>
                    {perClubEntitled.map((mod) => {
                      const checked = assignmentEnabled(club.id, mod.id);
                      return (
                        <td key={mod.id} className="px-3 py-2">
                          <Switch
                            id={`mod-${club.id}-${mod.id}`}
                            checked={checked}
                            onCheckedChange={(next) => void toggleAssignment(club.id, mod.id, next)}
                            label={checked ? t("modulesOn") : t("modulesOff")}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">{t("modulesRedemptionsTitle")}</h2>
        <div className="mt-4">
          <EntityTable
            columns={[
              { key: "fingerprint_suffix", header: t("modulesColFingerprint") },
              {
                key: "modules",
                header: t("modulesColModule"),
                render: (row) => row.modules.join(", "),
              },
              {
                key: "status",
                header: t("colStatus"),
                render: (row) => <StatusBadge label={row.status} tone={toneForStatus(row.status)} />,
              },
              {
                key: "redeemed_at",
                header: t("colCreated"),
                render: (row) => (row.redeemed_at ? formatDisplayDateTime(row.redeemed_at) : "—"),
              },
              {
                key: "expires_at",
                header: t("modulesColExpiry"),
                render: (row) => (row.expires_at ? formatDisplayDateTime(row.expires_at) : "—"),
              },
            ]}
            rows={(data?.redemptions ?? []).map((row) => ({ ...row, id: row.jti }))}
          />
        </div>
      </section>
    </OpsLayout>
  );
}
