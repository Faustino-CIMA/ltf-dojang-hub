"use client";

import { useTranslations } from "next-intl";

import type { ShopVariant } from "@/lib/clubmgmt-api";

export function ShopQrStickers({ variants }: { variants: ShopVariant[] }) {
  const t = useTranslations("ClubMgmt");
  const rows = variants.filter((row) => row.is_active);
  if (rows.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 flex flex-wrap gap-3" aria-label={t("shopStickers")}>
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex w-36 flex-col items-center gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-2"
        >
          {row.qr_png ? (
            // QR payloads are data URIs from the shop API, not next/image sources.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.qr_png}
              alt={t("shopQrAlt", { size: row.label })}
              className="size-28"
            />
          ) : (
            <p className="flex size-28 items-center text-center text-xs text-muted">{t("shopQrPreviewEmpty")}</p>
          )}
          <p className="text-sm font-medium text-foreground">{row.label}</p>
        </li>
      ))}
    </ul>
  );
}
