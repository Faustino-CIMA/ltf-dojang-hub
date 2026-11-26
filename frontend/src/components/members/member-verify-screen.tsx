"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { attachCameraPreview, openCamera, stopMediaStream, isCameraDenied } from "@/lib/camera-capture";
import { formatDisplayDate } from "@/lib/date-display";
import { CardReaderStartError, readCardOnDevice, releaseCardReader } from "@/lib/card-ocr";
import type { CardCountry } from "@/lib/card-read";
import {
  compareCardChallenge,
  compareMemberCard,
  getCardChallenge,
  getMemberVerification,
  unlockMemberCard,
  type CardCompareBody,
} from "@/lib/member-verification";
import { DesktopCardHandoff } from "@/components/members/desktop-card-handoff";

function isRateLimit(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /\b429\b/.test(message);
}

type Phase =
  | { kind: "loading" }
  | { kind: "no-number" }
  | { kind: "camera" }
  | { kind: "reading" }
  | { kind: "local"; reason: "wrong_card" | "unreadable" | "health_card" }
  | { kind: "mismatch"; fields: string[] }
  | { kind: "confirm"; body: CardCompareBody; cardFirst: string; cardLast: string }
  | { kind: "verified" }
  | { kind: "unlocked" };

export function MemberVerifyScreen({
  memberId = 0,
  backHref,
  handoffToken = "",
  locale = "en",
}: {
  memberId?: number;
  backHref: string;
  handoffToken?: string;
  locale?: string;
}) {
  const t = useTranslations("Verification");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [layout, setLayout] = useState<"phone" | "desktop" | null>(handoffToken ? "phone" : null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [country, setCountry] = useState<CardCountry>("LU");
  const [cameraNote, setCameraNote] = useState<"" | "denied" | "missing">("");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [keepUsual, setKeepUsual] = useState(true);
  const [reason, setReason] = useState("");
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);

  useEffect(() => {
    if (handoffToken) {
      return;
    }
    const query = window.matchMedia("(max-width: 767px)");
    const apply = () => setLayout(query.matches ? "phone" : "desktop");
    const frame = window.requestAnimationFrame(apply);
    query.addEventListener("change", apply);
    return () => {
      window.cancelAnimationFrame(frame);
      query.removeEventListener("change", apply);
    };
  }, [handoffToken]);

  useEffect(() => {
    if (!handoffToken && layout !== "phone") {
      return;
    }
    let cancelled = false;
    const load = handoffToken
      ? getCardChallenge(handoffToken).then((state) => ({
          country: state.country,
          has_number: state.has_number,
          verified: state.verified,
        }))
      : getMemberVerification(memberId);
    load
      .then((state) => {
        if (cancelled) {
          return;
        }
        if (state.country) {
          setCountry(state.country);
        }
        if (!state.has_number) {
          setPhase({ kind: "no-number" });
          return;
        }
        if (state.verified) {
          const when = "verified_at" in state && typeof state.verified_at === "string" ? state.verified_at : null;
          setVerifiedAt(when);
          setPhase({ kind: "verified" });
          return;
        }
        setPhase({ kind: "camera" });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const code = error instanceof Error ? error.message : "";
        if (code === "expired" || code === "cancelled" || code === "used" || code === "invalid") {
          setRequestError(t(code === "expired" ? "qrExpired" : code === "cancelled" ? "qrCancelled" : code === "used" ? "qrUsed" : "qrInvalid"));
          setPhase({ kind: "no-number" });
          return;
        }
        setRequestError(t(isRateLimit(error) ? "rateLimit" : "requestFailed"));
        setPhase({ kind: "camera" });
      });
    return () => {
      cancelled = true;
    };
  }, [handoffToken, layout, memberId, t]);

  useEffect(() => {
    return () => {
      void releaseCardReader();
    };
  }, []);

  useEffect(() => {
    if (phase.kind !== "camera") {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      return;
    }
    let cancelled = false;
    openCamera({ facing: "environment" })
      .then((stream) => {
        if (cancelled) {
          stopMediaStream(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          void attachCameraPreview(videoRef.current, stream).catch(() => undefined);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setCameraNote(isCameraDenied(error) ? "denied" : "missing");
      });
    return () => {
      cancelled = true;
      stopMediaStream(streamRef.current);
      streamRef.current = null;
    };
  }, [phase.kind]);

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setPhase({ kind: "local", reason: "unreadable" });
      return;
    }
    setPhase({ kind: "reading" });
    setRequestError(null);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      canvas.width = 0;
      canvas.height = 0;
      setPhase({ kind: "local", reason: "unreadable" });
      return;
    }
    context.drawImage(video, 0, 0);
    let read;
    try {
      read = await readCardOnDevice(canvas, country);
    } catch (error) {
      canvas.width = 0;
      canvas.height = 0;
      setRequestError(t(error instanceof CardReaderStartError ? "readerStart" : "unreadable"));
      setPhase({ kind: "camera" });
      return;
    }
    if (!read.ok) {
      setPhase({ kind: "local", reason: read.reason });
      return;
    }
    const body: CardCompareBody = {
      first_names: read.firstNames,
      last_names: read.lastNames,
      number: read.number,
    };
    if (read.dateOfBirth) {
      body.date_of_birth = read.dateOfBirth;
    }
    if (read.sex) {
      body.sex = read.sex;
    }
    try {
      const result = handoffToken
        ? await compareCardChallenge(handoffToken, body)
        : await compareMemberCard(memberId, body);
      if (result.needs_confirmation) {
        setKeepUsual(true);
        setPhase({
          kind: "confirm",
          body,
          cardFirst: result.card_first_name || read.firstNames,
          cardLast: result.card_last_name || read.lastNames,
        });
        return;
      }
      if (result.verified) {
        setPhase({ kind: "verified" });
        return;
      }
      setPhase({ kind: "mismatch", fields: result.fields || ["number"] });
    } catch (error) {
      setRequestError(t(isRateLimit(error) ? "rateLimit" : "requestFailed"));
      setPhase({ kind: "camera" });
    }
  }

  async function confirm(useCardNames: boolean) {
    if (phase.kind !== "confirm") {
      return;
    }
    setRequestError(null);
    try {
      const body = {
        ...phase.body,
        confirm_names: useCardNames,
        keep_usual_name: useCardNames && keepUsual,
      };
      const result = handoffToken
        ? await compareCardChallenge(handoffToken, body)
        : await compareMemberCard(memberId, body);
      setPhase(result.verified ? { kind: "verified" } : { kind: "mismatch", fields: result.fields || [] });
    } catch (error) {
      setRequestError(t(isRateLimit(error) ? "rateLimit" : "requestFailed"));
    }
  }

  async function unlock() {
    const trimmed = reason.trim();
    if (!trimmed) {
      return;
    }
    setRequestError(null);
    try {
      await unlockMemberCard(memberId, trimmed);
      setReason("");
      setPhase({ kind: "unlocked" });
    } catch (error) {
      setRequestError(t(isRateLimit(error) ? "rateLimit" : "requestFailed"));
    }
  }

  const fieldText = (fields: string[]) =>
    fields.map((field) => t(`field_${field}` as "field_number")).join(", ");

  if (!handoffToken && layout === "desktop" && memberId) {
    return <DesktopCardHandoff memberId={memberId} locale={locale} backHref={backHref} />;
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" asChild>
        <Link href={backHref}>{t("back")}</Link>
      </Button>
      <ActionNotices error={requestError} onDismiss={() => setRequestError(null)} />
      {phase.kind === "no-number" || phase.kind === "verified" ? null : (
        <p className="text-sm text-muted">{t("intro")}</p>
      )}

      {phase.kind === "loading" ? <p className="text-sm text-muted">{t("reading")}</p> : null}
      {phase.kind === "no-number" ? (
        <div className="space-y-3">
          <p className="text-sm text-warning">{t("noNumber")}</p>
          {memberId && !handoffToken ? (
            <Button variant="outline" asChild>
              <Link href={`${backHref}?edit=1&focus=ssn`}>
                <Pencil aria-hidden />
                {t("enterNumber")}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {phase.kind === "camera" || phase.kind === "reading" ? (
        <div className="space-y-3">
          <video ref={videoRef} className="aspect-[4/3] w-full rounded-md bg-secondary object-cover" playsInline muted />
          {cameraNote === "denied" ? <p className="text-sm text-warning">{t("cameraDenied")}</p> : null}
          {cameraNote === "missing" ? <p className="text-sm text-warning">{t("noCamera")}</p> : null}
          <Button type="button" onClick={() => void capture()} disabled={phase.kind === "reading" || cameraNote !== ""}>
            {phase.kind === "reading" ? t("reading") : t("capture")}
          </Button>
        </div>
      ) : null}

      {phase.kind === "local" ? (
        <div className="space-y-3">
          <p className="text-sm text-warning">
            {phase.reason === "health_card" ? t("healthCard") : phase.reason === "wrong_card" ? t("wrongCard") : t("unreadable")}
          </p>
          <Button type="button" variant="outline" onClick={() => { setCameraNote(""); setPhase({ kind: "camera" }); }}>
            {t("tryAgain")}
          </Button>
        </div>
      ) : null}

      {phase.kind === "mismatch" ? (
        <div className="space-y-3">
          <p className="text-sm text-warning">{t("mismatch", { fields: fieldText(phase.fields) })}</p>
          <Button type="button" variant="outline" onClick={() => { setCameraNote(""); setPhase({ kind: "camera" }); }}>
            {t("tryAgain")}
          </Button>
        </div>
      ) : null}

      {phase.kind === "confirm" ? (
        <div className="space-y-3">
          <h2 className="text-section text-foreground">{t("confirmTitle")}</h2>
          <p className="text-sm text-foreground">{t("confirmBody", { first: phase.cardFirst, last: phase.cardLast })}</p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={keepUsual} onCheckedChange={(checked) => setKeepUsual(Boolean(checked))} />
            {t("keepUsual")}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void confirm(true)}>
              {t("useCardNames")}
            </Button>
            <Button type="button" variant="outline" onClick={() => void confirm(false)}>
              {t("keepStoredNames")}
            </Button>
          </div>
        </div>
      ) : null}

      {phase.kind === "verified" ? (
        <div className="space-y-3">
          <p className="text-sm text-success">
            {verifiedAt ? t("verifiedOn", { date: formatDisplayDate(verifiedAt) }) : t("verifiedDone")}
          </p>
          {handoffToken ? null : (
          <div className="space-y-2">
            <Label htmlFor="unlock-reason">{t("unlockReason")}</Label>
            <Input id="unlock-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            <Button type="button" variant="outline" onClick={() => void unlock()} disabled={!reason.trim()}>
              {t("unlockSubmit")}
            </Button>
          </div>
          )}
        </div>
      ) : null}

      {phase.kind === "unlocked" ? (
        <div className="space-y-3">
          <p className="text-sm text-foreground">{t("unlocked")}</p>
          <Button type="button" onClick={() => { setCameraNote(""); setPhase({ kind: "camera" }); }}>
            {t("verify")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
