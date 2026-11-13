"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ImageIcon, Mail } from "lucide-react";

import { InfoHint } from "@/components/ui/info-hint";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { API_URL, apiRequest } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { readActiveDeskHeader } from "@/lib/active-desk";
import { memberPhotoAspectRatio } from "@/lib/member-photo-frame";

type ReviewDetail = {
  id: number;
  first_name: string;
  last_name: string;
  current_url: string;
  pending_url: string;
};

type AdminNotice = {
  id: number;
  kind: string;
  member_id: number;
  name: string;
  club_id: number | null;
};

async function loadProtectedImage(url: string): Promise<string> {
  if (!url) return "";
  const token = getToken();
  const desk = readActiveDeskHeader();
  const response = await fetch(url.startsWith("http") ? url : `${API_URL}${url}`, {
    headers: {
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...(desk ? { "X-Desk": desk } : {}),
    },
  });
  if (!response.ok) return "";
  return URL.createObjectURL(await response.blob());
}

export function PhotoReviewMark({ label, onOpen }: { label: string; onOpen?: () => void }) {
  const badge = <StatusBadge label={label} tone="warning" />;
  if (!onOpen) return badge;
  return (
    <button
      type="button"
      className="inline-flex"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      {badge}
    </button>
  );
}

export function PictureReviewPanel({
  open,
  memberId,
  namespace,
  onClose,
  onDecided,
}: {
  open: boolean;
  memberId: number | null;
  namespace: "ClubAdmin" | "LtfAdmin";
  onClose: () => void;
  onDecided: () => void;
}) {
  const t = useTranslations(namespace);
  const common = useTranslations("Common");
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [currentSrc, setCurrentSrc] = useState("");
  const [pendingSrc, setPendingSrc] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || memberId == null) return;
    let cancelled = false;
    const urls: string[] = [];
    setReason("");
    apiRequest<ReviewDetail>(`/api/members/${memberId}/picture-review/`)
      .then(async (row) => {
        if (cancelled) return;
        setDetail(row);
        const [current, pending] = await Promise.all([
          loadProtectedImage(row.current_url),
          loadProtectedImage(row.pending_url),
        ]);
        if (cancelled) {
          if (current) URL.revokeObjectURL(current);
          if (pending) URL.revokeObjectURL(pending);
          return;
        }
        if (current) urls.push(current);
        if (pending) urls.push(pending);
        setCurrentSrc(current);
        setPendingSrc(pending);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [open, memberId]);

  const decide = async (decision: "approve" | "reject") => {
    if (memberId == null || busy) return;
    setBusy(true);
    try {
      await apiRequest(`/api/members/${memberId}/picture-review/`, {
        method: "POST",
        body: JSON.stringify({ decision, reason: decision === "reject" ? reason.trim() : "" }),
      });
      onDecided();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel
      open={open}
      wide
      title={t("pictureReviewTitle")}
      closeLabel={common("modalClose")}
      onClose={onClose}
    >
      <div className="mb-3 flex items-start gap-2">
        <p className="text-sm text-muted">{t("pictureReviewHint")}</p>
        <InfoHint size="compact" ariaLabel={common("aboutTitle", { title: t("pictureReviewTitle") })}>
          {t("pictureReviewHint")}
        </InfoHint>
      </div>
      {detail ? (
        <p className="mb-3 text-sm text-foreground">
          {detail.last_name} {detail.first_name}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <figure className="space-y-1">
          <figcaption className="text-sm text-muted">{t("pictureReviewCurrent")}</figcaption>
          <div
            className="mx-auto w-full max-w-56 overflow-hidden rounded-[var(--radius-card)] border border-border bg-secondary"
            style={{ aspectRatio: memberPhotoAspectRatio }}
          >
            {currentSrc ? (
              <img src={currentSrc} alt={t("pictureReviewCurrent")} className="h-full w-full object-contain" />
            ) : (
              <p className="p-2 text-sm text-muted">{t("pictureReviewNoPhoto")}</p>
            )}
          </div>
        </figure>
        <figure className="space-y-1">
          <figcaption className="text-sm text-muted">{t("pictureReviewNew")}</figcaption>
          <div
            className="mx-auto w-full max-w-56 overflow-hidden rounded-[var(--radius-card)] border border-border bg-secondary"
            style={{ aspectRatio: memberPhotoAspectRatio }}
          >
            {pendingSrc ? (
              <img src={pendingSrc} alt={t("pictureReviewNew")} className="h-full w-full object-contain" />
            ) : (
              <p className="p-2 text-sm text-muted">{t("pictureReviewNoPhoto")}</p>
            )}
          </div>
        </figure>
      </div>
      <label className="mt-3 block space-y-1">
        <span className="text-sm text-foreground">{t("pictureReviewReason")}</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="min-h-20 w-full rounded-[var(--radius-form)] border border-border bg-[var(--field-background)] px-3 py-2 text-sm text-foreground"
        />
      </label>
      <div className="mt-4 flex gap-2">
        <Button type="button" write disabled={busy} onClick={() => void decide("approve")}>
          {t("pictureReviewApprove")}
        </Button>
        <Button type="button" write variant="outline" disabled={busy} onClick={() => void decide("reject")}>
          {t("pictureReviewReject")}
        </Button>
      </div>
    </SidePanel>
  );
}

export function AdminNoticeBell({ namespace }: { namespace: "ClubAdmin" | "LtfAdmin" }) {
  const t = useTranslations(namespace);
  const common = useTranslations("Common");
  const [rows, setRows] = useState<AdminNotice[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [memberId, setMemberId] = useState<number | null>(null);

  const load = () => {
    apiRequest<AdminNotice[]>("/api/notices/")
      .then((items) => setRows(items.filter((item) => item.kind === "picture_review")))
      .catch(() => setRows([]));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <Button type="button" variant="outline" size="icon" className="relative" aria-label={common("noticesLabel")} onClick={() => setListOpen(true)}>
        <Mail aria-hidden />
        {rows.length > 0 ? (
          <span className="badge-warning absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs">
            {rows.length}
          </span>
        ) : null}
      </Button>
      <SidePanel open={listOpen} title={common("noticesLabel")} closeLabel={common("modalClose")} onClose={() => setListOpen(false)}>
        {rows.length === 0 ? <p className="text-sm text-muted">{common("noticesEmpty")}</p> : null}
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-[var(--radius-card)] border border-border px-3 py-2 text-left text-sm text-foreground"
                onClick={() => setMemberId(row.member_id)}
              >
                <ImageIcon aria-hidden className="size-4 text-muted" />
                {common("noticePictureReview", { name: row.name })}
              </button>
            </li>
          ))}
        </ul>
      </SidePanel>
      <PictureReviewPanel
        open={memberId != null}
        memberId={memberId}
        namespace={namespace}
        onClose={() => setMemberId(null)}
        onDecided={() => {
          setMemberId(null);
          load();
        }}
      />
    </>
  );
}
