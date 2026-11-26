"use client";

import { useTranslations } from "next-intl";

import type { ShopVariant } from "@/lib/clubmgmt-api";

function stickerPrice(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return `${value} EUR`;
  }
  return `${amount.toFixed(2)} EUR`;
}

function stickerSize(label: string) {
  const trimmed = label.trim();
  if (!trimmed || trimmed === "Standard") {
    return "";
  }
  return trimmed;
}

export function ShopQrStickers({ name, variants }: { name: string; variants: ShopVariant[] }) {
  const t = useTranslations("ClubMgmt");
  const rows = variants.filter((row) => row.is_active);
  if (rows.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 flex flex-wrap items-stretch gap-3" aria-label={t("shopStickers")}>
      {rows.map((row) => {
        const size = stickerSize(row.label);
        return (
          <li
            key={row.id}
            className="flex w-36 flex-col items-center gap-1 rounded-[var(--radius-card)] border border-border bg-surface p-2 text-center"
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
            <p className="line-clamp-2 w-full break-words text-sm font-medium leading-snug text-foreground">{name}</p>
            {size ? <p className="text-xs text-muted">{size}</p> : null}
            <p className="mt-auto text-sm font-medium text-foreground">{stickerPrice(row.sale_price)}</p>
          </li>
        );
      })}
    </ul>
  );
}
