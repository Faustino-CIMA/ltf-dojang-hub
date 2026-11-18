"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { HANDOFF_QR_MAX_PX, handoffQrMarkup } from "@/lib/handoff-qr";
import {
  cancelMemberChallenge,
  cardCheckPath,
  createMemberChallenge,
  getMemberVerification,
} from "@/lib/member-verification";

type Phase = "loading" | "waiting" | "verified" | "expired" | "no-number" | "failed" | "fallback";

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
  const [link, setLink] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [requestError, setRequestError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setPhase("loading");
    setRequestError(null);
    setCopied(false);
    setSvg("");
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
    setLink(url);
    setExpiresAt(created.expires_at);
    try {
      setSvg(handoffQrMarkup(url));
      setPhase("waiting");
    } catch {
      setPhase("fallback");
    }
  }, [locale, memberId]);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      start().catch(() => {
        if (live) {
          setRequestError(t("unreadable"));
          setPhase("failed");
        }
      });
    }, 0);
    return () => {
      live = false;
      window.clearTimeout(timer);
      const current = tokenRef.current;
      tokenRef.current = "";
      if (current) {
        void cancelMemberChallenge(memberId, current).catch(() => undefined);
      }
    };
  }, [memberId, start, t]);

  useEffect(() => {
    if (phase !== "waiting" && phase !== "fallback") {
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

  const expiry = expiresAt
    ? t("qrExpires", {
        time: new Date(expiresAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
      })
    : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

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
            className="inline-block max-w-full rounded-md border border-border bg-[var(--brand-on-ink)] text-[var(--brand-ink)]"
            data-handoff-qr={HANDOFF_QR_MAX_PX}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          {expiry ? <p className="text-sm text-foreground">{expiry}</p> : null}
          <p className="text-sm text-foreground">{t("qrWaiting")}</p>
        </div>
      ) : null}
      {phase === "fallback" && link ? (
        <div className="space-y-3">
          <p className="text-sm text-warning">{t("qrFallback")}</p>
          {expiry ? <p className="text-sm text-foreground">{expiry}</p> : null}
          <Input readOnly value={link} aria-label={t("qrFallback")} onFocus={(event) => event.currentTarget.select()} />
          <Button type="button" variant="outline" onClick={() => void copyLink()}>
            {copied ? t("qrCopied") : t("qrCopy")}
          </Button>
        </div>
      ) : null}
      {phase === "verified" ? <p className="text-sm text-success">{t("verifiedDone")}</p> : null}
      {phase === "expired" ? <p className="text-sm text-destructive">{t("qrExpired")}</p> : null}
      {phase === "expired" || phase === "failed" || phase === "fallback" ? (
        <Button type="button" onClick={() => void start().catch(() => setPhase("failed"))}>
          {t("startAgain")}
        </Button>
      ) : null}
    </div>
  );
}
