"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import {
  cancelMemberChallenge,
  cardCheckPath,
  createMemberChallenge,
  getMemberVerification,
} from "@/lib/member-verification";

type Phase = "loading" | "waiting" | "verified" | "expired" | "no-number" | "failed";

export function DesktopCardHandoff({
  memberId,
  locale,
  backHref,
}: {
  memberId: number;
  locale: string;
  backHref: string;
}) {
  const t = useTranslations("Verification");
  const tokenRef = useRef("");
  const [svg, setSvg] = useState("");
  const [phase, setPhase] = useState<Phase>("loading");
  const [requestError, setRequestError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setPhase("loading");
    setRequestError(null);
    const state = await getMemberVerification(memberId);
    if (state.verified) {
      setPhase("verified");
      return;
    }
    if (!state.has_number) {
      setPhase("no-number");
      return;
    }
    const previous = tokenRef.current;
    tokenRef.current = "";
    if (previous) {
      await cancelMemberChallenge(memberId, previous).catch(() => undefined);
    }
    const created = await createMemberChallenge(memberId);
    tokenRef.current = created.token;
    const url = `${window.location.origin}${cardCheckPath(locale, created.token)}`;
    const qrcode = await import("qrcode");
    const markup = await qrcode.toString(url, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    });
    setSvg(markup);
    setPhase("waiting");
  }, [locale, memberId]);

  useEffect(() => {
    let live = true;
    start().catch(() => {
      if (live) {
        setRequestError(t("unreadable"));
        setPhase("failed");
      }
    });
    return () => {
      live = false;
      const current = tokenRef.current;
      tokenRef.current = "";
      if (current) {
        void cancelMemberChallenge(memberId, current).catch(() => undefined);
      }
    };
  }, [memberId, start, t]);

  useEffect(() => {
    if (phase !== "waiting") {
      return;
    }
    const look = () => {
      void getMemberVerification(memberId)
        .then((state) => {
          if (state.verified) {
            tokenRef.current = "";
            setPhase("verified");
          } else if (!state.challenge_open) {
            setPhase("expired");
          }
        })
        .catch(() => undefined);
    };
    look();
    const timer = window.setInterval(look, 3000);
    return () => window.clearInterval(timer);
  }, [memberId, phase]);

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" asChild>
        <Link href={backHref}>{t("back")}</Link>
      </Button>
      <ActionNotices error={requestError} onDismiss={() => setRequestError(null)} />
      <h2 className="text-section text-foreground">{t("qrTitle")}</h2>
      <p className="text-sm text-muted">{t("qrHint")}</p>
      {phase === "loading" ? <p className="text-sm text-muted">{t("reading")}</p> : null}
      {phase === "no-number" ? <p className="text-sm text-warning">{t("noNumber")}</p> : null}
      {phase === "waiting" && svg ? (
        <div className="space-y-3">
          <div
            className="inline-block rounded-md border border-border bg-white p-3"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="text-sm text-foreground">{t("qrWaiting")}</p>
        </div>
      ) : null}
      {phase === "verified" ? <p className="text-sm text-success">{t("verifiedDone")}</p> : null}
      {phase === "expired" ? <p className="text-sm text-destructive">{t("qrExpired")}</p> : null}
      {phase === "expired" || phase === "failed" ? (
        <Button type="button" onClick={() => void start().catch(() => setPhase("failed"))}>
          {t("startAgain")}
        </Button>
      ) : null}
    </div>
  );
}
