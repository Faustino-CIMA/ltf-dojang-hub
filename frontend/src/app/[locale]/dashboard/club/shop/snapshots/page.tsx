"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { ClubShopTabs } from "@/components/clubmgmt/shop-tabs";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { formatDisplayDateTime } from "@/lib/date-display";
import {
  asShopList,
  createShopSnapshot,
  downloadShopSnapshotPdf,
  listShopSnapshots,
  type ShopSnapshot,
} from "@/lib/clubmgmt-api";

export default function ClubShopSnapshotsPage() {
  const t = useTranslations("ClubMgmt");
  const { selectedClubId } = useClubSelection();
  const [rows, setRows] = useState<ShopSnapshot[]>([]);
  const [note, setNote] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!selectedClubId) return;
    setIsLoading(true);
    try {
      setRows(asShopList(await listShopSnapshots(selectedClubId)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [selectedClubId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ClubAdminLayout title={t("shopCountSheetTitle")} subtitle={t("shopCountSheetSubtitle")}>
      <div className="space-y-6">
        <ClubShopTabs />
        <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-xs" value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("shopSnapshotNote")} />
          <Button
            type="button"
            variant="primary"
            disabled={isSaving || !selectedClubId}
            onClick={async () => {
              if (!selectedClubId) return;
              setIsSaving(true);
              try {
                const snapshot = await createShopSnapshot(selectedClubId, note);
                setNote("");
                await load();
                await downloadShopSnapshotPdf(selectedClubId, snapshot.id);
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : t("saveError"));
              } finally {
                setIsSaving(false);
              }
            }}
          >
            {isSaving ? t("saving") : t("shopTakeCountSheet")}
          </Button>
        </div>
        {isLoading ? (
          <EmptyState title={t("shopLoadingTitle")} description={t("shopLoadingSnapshots")} loading />
        ) : rows.length === 0 ? (
          <EmptyState title={t("shopSnapshotsEmptyTitle")} description={t("shopSnapshotsEmptySubtitle")} />
        ) : (
          <EntityTable
            columns={[
              { key: "taken_at", header: t("shopSnapshotAt"), render: (row) => formatDisplayDateTime(row.taken_at) },
              { key: "note", header: t("shopSnapshotNote") },
              { key: "line_count", header: t("shopSnapshotLines") },
              { key: "units", header: t("shopUnitsOnHand") },
              {
                key: "print",
                header: t("shopActions"),
                render: (row) =>
                  selectedClubId ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => downloadShopSnapshotPdf(selectedClubId, row.id).catch((error) => setErrorMessage(error.message))}
                    >
                      {t("shopPrintSnapshot")}
                    </Button>
                  ) : null,
              },
            ]}
            rows={rows}
          />
        )}
      </div>
    </ClubAdminLayout>
  );
}
