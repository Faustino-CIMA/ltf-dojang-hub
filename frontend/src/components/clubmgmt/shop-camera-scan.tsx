"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

type ShopCameraScanProps = {
  onCode: (code: string) => void;
  onClose: () => void;
};

type DetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

async function detectFromCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const Detector = (window as Window & { BarcodeDetector?: new (options: { formats: string[] }) => DetectorLike })
    .BarcodeDetector;
  if (typeof Detector === "function") {
    try {
      const detector = new Detector({ formats: ["qr_code"] });
      const codes = await detector.detect(canvas);
      const value = codes[0]?.rawValue?.trim();
      if (value) return value;
    } catch {
      /* try zxing next */
    }
  }
  try {
    const zxing = await import("@zxing/browser");
    const reader = new zxing.BrowserQRCodeReader();
    const result = reader.decodeFromCanvas(canvas);
    const text = result?.getText()?.trim();
    return text || null;
  } catch {
    return null;
  }
}

export function ShopCameraScan({ onCode, onClose }: ShopCameraScanProps) {
  const t = useTranslations("ClubMgmt");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastCode = useRef("");
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const stop = () => {
      if (timer) window.clearTimeout(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    const tick = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (cancelled || !video || !canvas || video.readyState < 2) {
        timer = window.setTimeout(() => void tick(), 250);
        return;
      }
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width && height) {
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, width, height);
          const code = await detectFromCanvas(canvas);
          if (code && code !== lastCode.current) {
            lastCode.current = code;
            onCodeRef.current(code);
            window.setTimeout(() => {
              if (lastCode.current === code) lastCode.current = "";
            }, 1500);
          }
        }
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), 250);
    };

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        void tick();
      } catch {
        setErrorMessage(t("shopScanCameraDenied"));
      }
    };

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [t]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4 text-white">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{t("shopScanCameraHint")}</p>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          <X className="size-4" aria-hidden />
          {t("shopScanClose")}
        </Button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[var(--radius-card)] bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-48 w-48 rounded-lg border-2 border-white/80" />
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
      {errorMessage ? <p className="mt-3 text-sm text-red-200">{errorMessage}</p> : null}
    </div>
  );
}
