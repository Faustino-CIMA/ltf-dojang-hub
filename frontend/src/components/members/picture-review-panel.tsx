"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { InfoHint } from "@/components/ui/info-hint";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { apiRequest } from "@/lib/api";

type WaitingPicture = { id: number; first_name: string; last_name: string };

export function PictureReviewButton({ namespace }: { namespace: "ClubAdmin" | "LtfAdmin" }) {
  const t = useTranslations(namespace);
  const common = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<WaitingPicture[]>([]);

  const load = () => {
    apiRequest<WaitingPicture[]>("/api/members/picture-reviews/")
      .then(setRows)
      .catch(() => setRows([]));
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (id: number, decision: "approve" | "reject") => {
    await apiRequest(`/api/members/${id}/picture-review/`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    load();
  };

  if (rows.length === 0 && !open) {
    return null;
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {t("pictureReviewTitle")}
      </Button>
      <SidePanel
        open={open}
        title={t("pictureReviewTitle")}
        closeLabel={common("modalClose")}
        onClose={() => setOpen(false)}
      >
        <div className="mb-3 flex items-start gap-2">
          <p className="text-sm text-muted">{t("pictureReviewHint")}</p>
          <InfoHint size="compact" ariaLabel={common("aboutTitle", { title: t("pictureReviewTitle") })}>
            {t("pictureReviewHint")}
          </InfoHint>
        </div>
        {rows.length === 0 ? <p className="text-sm text-muted">{t("pictureReviewEmpty")}</p> : null}
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-border p-2">
              <span className="text-sm text-foreground">{row.last_name} {row.first_name}</span>
              <span className="flex gap-2">
                <Button type="button" onClick={() => void decide(row.id, "approve")}>{t("pictureReviewApprove")}</Button>
                <Button type="button" variant="outline" onClick={() => void decide(row.id, "reject")}>{t("pictureReviewReject")}</Button>
              </span>
            </li>
          ))}
        </ul>
      </SidePanel>
    </>
  );
}
