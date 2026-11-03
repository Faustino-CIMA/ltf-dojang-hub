"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { ModulePurchaseOverrides } from "@/components/ltf-admin/module-purchase-overrides";
import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import {
  getClubs,
  getModulePurchaseOverrides,
  getModulePurchases,
  overrideModulePurchase,
  type ModulePurchaseOverrideRow,
  type ModulePurchaseRow,
} from "@/lib/ltf-admin-api";

export default function ModulePurchasesPage() {
  const t = useTranslations("LtfAdmin");
  const [clubs, setClubs] = useState<{ id: number; name: string }[]>([]);
  const [clubId, setClubId] = useState("");
  const [purchases, setPurchases] = useState<ModulePurchaseRow[]>([]);
  const [audits, setAudits] = useState<ModulePurchaseOverrideRow[]>([]);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getClubs()
      .then((rows) => {
        if (!cancelled) setClubs(rows.map((club) => ({ id: club.id, name: club.name })));
      })
      .catch(() => {
        if (!cancelled) setClubs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!clubId) {
      return;
    }
    let cancelled = false;
    Promise.all([getModulePurchases(Number(clubId)), getModulePurchaseOverrides(Number(clubId))])
      .then(([nextPurchases, nextAudits]) => {
        if (cancelled) return;
        setPurchases(nextPurchases);
        setAudits(nextAudits);
      })
      .catch(() => {
        if (cancelled) return;
        setPurchases([]);
        setAudits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  return (
    <LtfAdminLayout title={t("modulePurchaseTitle")} subtitle={t("modulePurchaseSubtitle")}>
      {notice ? (
        <p className={notice.kind === "error" ? "mb-3 text-sm text-destructive" : "mb-3 text-sm text-foreground"}>
          {notice.message}
        </p>
      ) : null}
      <ModulePurchaseOverrides
        clubs={clubs}
        clubId={clubId}
        purchases={purchases}
        audits={audits}
        onSelectClub={(next) => {
          setClubId(next);
          setPurchases([]);
          setAudits([]);
        }}
        onNotice={(kind, message) => setNotice({ kind, message })}
        onOverride={async (id, action, extra) => {
          await overrideModulePurchase(id, { action, ...extra });
          const [nextPurchases, nextAudits] = await Promise.all([
            getModulePurchases(Number(clubId)),
            getModulePurchaseOverrides(Number(clubId)),
          ]);
          setPurchases(nextPurchases);
          setAudits(nextAudits);
        }}
      />
    </LtfAdminLayout>
  );
}
