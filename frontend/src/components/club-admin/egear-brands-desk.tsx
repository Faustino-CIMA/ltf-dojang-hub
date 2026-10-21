"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/api";
import { getEgearBrands, saveEgearBrands } from "@/lib/egear-brands-api";

export function EgearBrandsDesk({ clubId }: { clubId: number }) {
  const t = useTranslations("ClubAdmin");
  const [daedo, setDaedo] = useState(true);
  const [kpnp, setKpnp] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ role: string }>("/api/auth/me/")
      .then((me) => {
        if (!cancelled) setCanEdit(me.role === "club_admin");
      })
      .catch(() => {
        if (!cancelled) setCanEdit(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getEgearBrands(clubId)
      .then((payload) => {
        if (cancelled) return;
        setDaedo(payload.egear_daedo);
        setKpnp(payload.egear_kpnp);
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  function save(next: { daedo: boolean; kpnp: boolean }) {
    const previous = { daedo, kpnp };
    setDaedo(next.daedo);
    setKpnp(next.kpnp);
    setBusy(true);
    setError(false);
    void saveEgearBrands(clubId, next)
      .then((payload) => {
        setDaedo(payload.egear_daedo);
        setKpnp(payload.egear_kpnp);
      })
      .catch(() => {
        setDaedo(previous.daedo);
        setKpnp(previous.kpnp);
        setError(true);
      })
      .finally(() => setBusy(false));
  }

  return (
    <section className="space-y-3" aria-labelledby="egear-brands-title">
      <div>
        <h2 id="egear-brands-title" className="text-section text-foreground">{t("egearBrandsTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("egearBrandsHint")}</p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Switch
          id="egear-daedo"
          checked={daedo}
          disabled={!canEdit || busy}
          label={t("gearDaedo")}
          onCheckedChange={(next) => save({ daedo: next, kpnp })}
        />
        <Switch
          id="egear-kpnp"
          checked={kpnp}
          disabled={!canEdit || busy}
          label={t("gearKpnp")}
          onCheckedChange={(next) => save({ daedo, kpnp: next })}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{t("egearBrandsInvalid")}</p> : null}
    </section>
  );
}
