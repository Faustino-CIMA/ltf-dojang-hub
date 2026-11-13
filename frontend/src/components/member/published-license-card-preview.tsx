"use client";

import { useEffect, useState } from "react";

import { LoadingCard } from "@/components/ui/loading-card";
import {
  CardSide,
  getMemberLicenseCardImage,
  getMemberLicenseCardPreview,
} from "@/lib/license-card-api";

type PublishedLicenseCardPreviewProps = {
  memberId: number;
  licenseId?: number | null;
  title: string;
  frontLabel: string;
  backLabel: string;
  unavailableLabel: string;
};

const MAX_DISPLAY_WIDTH_PX = 420;
const CARD_CORNER_RADIUS_MM = 3.18;
const CARD_WIDTH_MM = 85;

function CardPicture({ src, title }: { src: string; title: string }) {
  return (
    <div
      className="w-full overflow-hidden border border-border bg-surface"
      style={{
        maxWidth: MAX_DISPLAY_WIDTH_PX,
        borderRadius: `${(CARD_CORNER_RADIUS_MM / CARD_WIDTH_MM) * 100}%`,
      }}
    >
      <img src={src} alt={title} className="block h-auto w-full" />
    </div>
  );
}

export function PublishedLicenseCardPreview({
  memberId,
  licenseId,
  title,
  frontLabel,
  backLabel,
  unavailableLabel,
}: PublishedLicenseCardPreviewProps) {
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const urls: string[] = [];
    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      setFrontUrl(null);
      setBackUrl(null);
      try {
        const frontPayload = await getMemberLicenseCardPreview(memberId, {
          licenseId: licenseId ?? undefined,
          side: "front",
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        setTemplateName(frontPayload.template_name || "");
        const frontBlob = await getMemberLicenseCardImage(memberId, {
          licenseId: licenseId ?? frontPayload.license_id ?? undefined,
          side: "front",
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        const frontObjectUrl = URL.createObjectURL(frontBlob);
        if (controller.signal.aborted) {
          URL.revokeObjectURL(frontObjectUrl);
          return;
        }
        urls.push(frontObjectUrl);
        setFrontUrl(frontObjectUrl);
        const backHasContent = Boolean(frontPayload.side_summary?.back?.has_content);
        const hasBack = frontPayload.available_sides?.includes("back" as CardSide) && backHasContent;
        if (hasBack) {
          const backBlob = await getMemberLicenseCardImage(memberId, {
            licenseId: licenseId ?? frontPayload.license_id ?? undefined,
            side: "back",
            signal: controller.signal,
          });
          if (controller.signal.aborted) {
            return;
          }
          const backObjectUrl = URL.createObjectURL(backBlob);
          if (controller.signal.aborted) {
            URL.revokeObjectURL(backObjectUrl);
            return;
          }
          urls.push(backObjectUrl);
          setBackUrl(backObjectUrl);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setFrontUrl(null);
        setBackUrl(null);
        setErrorMessage(error instanceof Error ? error.message : unavailableLabel);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };
    void load();
    return () => {
      controller.abort();
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [licenseId, memberId, unavailableLabel]);

  if (isLoading) {
    return (
      <div className="mb-5">
        <LoadingCard title={title} />
      </div>
    );
  }

  if (!frontUrl) {
    return errorMessage ? (
      <p className="mb-4 text-sm text-muted">{unavailableLabel}</p>
    ) : null;
  }

  return (
    <div className="mb-5 rounded-[var(--radius-card)] border border-border/80 bg-secondary/30 px-4 py-5">
      <p className="mb-4 text-sm font-medium text-foreground">{templateName || title}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <div className="w-[min(100%,420px)] space-y-2">
          <CardPicture src={frontUrl} title={frontLabel} />
          {backUrl ? <p className="text-center text-xs text-muted">{frontLabel}</p> : null}
        </div>
        {backUrl ? (
          <div className="w-[min(100%,420px)] space-y-2">
            <CardPicture src={backUrl} title={backLabel} />
            <p className="text-center text-xs text-muted">{backLabel}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
