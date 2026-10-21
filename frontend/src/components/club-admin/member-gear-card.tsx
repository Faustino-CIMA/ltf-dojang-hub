"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import { SidePanel } from "@/components/ui/side-panel";
import { formatDisplayDate } from "@/lib/date-display";
import {
  DAEDO_HEAD,
  DAEDO_HOGU,
  DAEDO_SOCK,
  DOBOK,
  GENERIC_SIZE,
  KPNP_GLOVE,
  KPNP_HEAD,
  KPNP_HOGU,
  KPNP_SOCK,
  MOUTHGUARD,
  TSHIRT,
  blankGear,
  getMemberGear,
  saveMemberGear,
  type GearKey,
  type MemberGear,
} from "@/lib/member-gear-api";

type Translator = (key: string, values?: Record<string, string | number>) => string;

const GROUPS: Array<{ title: string; fields: Array<{ key: GearKey; label: string; scale: readonly string[]; hint?: string }> }> = [
  {
    title: "gearDaedo",
    fields: [
      { key: "daedo_sock", label: "gearSock", scale: DAEDO_SOCK, hint: "gearSockHint" },
      { key: "daedo_glove", label: "gearGlove", scale: DAEDO_SOCK },
      { key: "daedo_hogu", label: "gearHogu", scale: DAEDO_HOGU },
      { key: "daedo_head", label: "gearHead", scale: DAEDO_HEAD },
    ],
  },
  {
    title: "gearKpnp",
    fields: [
      { key: "kpnp_sock", label: "gearSock", scale: KPNP_SOCK },
      { key: "kpnp_glove", label: "gearGlove", scale: KPNP_GLOVE },
      { key: "kpnp_hogu", label: "gearHogu", scale: KPNP_HOGU },
      { key: "kpnp_head", label: "gearHead", scale: KPNP_HEAD },
    ],
  },
  {
    title: "gearOther",
    fields: [
      { key: "shin", label: "gearShin", scale: GENERIC_SIZE },
      { key: "forearm", label: "gearForearm", scale: GENERIC_SIZE },
      { key: "groin", label: "gearGroin", scale: GENERIC_SIZE },
      { key: "mouthguard", label: "gearMouthguard", scale: MOUTHGUARD },
    ],
  },
  {
    title: "gearClothing",
    fields: [
      { key: "dobok", label: "gearDobok", scale: DOBOK },
      { key: "tshirt", label: "gearTshirt", scale: TSHIRT },
    ],
  },
];

export function gearLabel(t: Translator, key: GearKey, value: string) {
  if (!value) return t("gearNone");
  if (key === "dobok") return t("gearDobokCm", { size: value });
  if (key === "mouthguard") return value === "adult" ? t("gearMouthAdult") : t("gearMouthYouth");
  return value;
}

function optionLabel(t: Translator, key: GearKey, value: string) {
  return gearLabel(t, key, value);
}

export function GearSizePanel({
  gear,
  onClose,
  onSaved,
}: {
  gear: MemberGear;
  onClose: () => void;
  onSaved: (gear: MemberGear) => void;
}) {
  const t = useTranslations("ClubAdmin");
  const [draft, setDraft] = useState<MemberGear>(gear);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <SidePanel open wide title={t("gearEdit")} description={t("gearHint")} closeLabel={t("teamsClose")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          void saveMemberGear(draft)
            .then((saved) => onSaved(saved))
            .catch(() => setError(t("gearInvalid")))
            .finally(() => setBusy(false));
        }}
      >
        {GROUPS.map((group) => (
          <section key={group.title} className="space-y-3" aria-labelledby={`gear-group-${group.title}`}>
            <h3 id={`gear-group-${group.title}`} className="text-sm font-medium text-foreground">{t(group.title)}</h3>
            {group.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label>{t(field.label)}</Label>
                <PopoverSelect
                  className="w-full"
                  ariaLabel={`${t(group.title)} ${t(field.label)}`}
                  value={draft[field.key]}
                  onValueChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
                  options={[
                    { value: "", label: t("gearNone") },
                    ...field.scale.map((value) => ({ value, label: optionLabel(t, field.key, value) })),
                  ]}
                />
                {field.hint ? <p className="text-sm text-muted">{t(field.hint)}</p> : null}
              </div>
            ))}
          </section>
        ))}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={busy}>{busy ? t("gearSaving") : t("gearSave")}</Button>
      </form>
    </SidePanel>
  );
}

export function MemberGearCard({ memberId, preview }: { memberId: number; preview?: MemberGear }) {
  const t = useTranslations("ClubAdmin");
  const [gear, setGear] = useState<MemberGear | null>(preview ?? null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (preview !== undefined) {
      setGear(preview);
      return;
    }
    let cancelled = false;
    void getMemberGear(memberId)
      .then((payload) => {
        if (!cancelled) setGear(payload);
      })
      .catch(() => {
        if (!cancelled) setGear(blankGear(memberId));
      });
    return () => {
      cancelled = true;
    };
  }, [memberId, preview]);

  const shown = gear ?? blankGear(memberId);
  return (
    <section className="app-panel p-3" aria-labelledby="member-gear-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="member-gear-title" className="text-section text-foreground">{t("gearTitle")}</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-[var(--control-height)] min-h-[var(--control-height)] shrink-0"
          onClick={() => setOpen(true)}
        >
          {t("gearEdit")}
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted">{t("gearHint")}</p>
      {shown.updated_at ? (
        <p className="mt-1 text-sm text-muted">{t("gearUpdated", { date: formatDisplayDate(shown.updated_at) })}</p>
      ) : null}
      <div className="mt-4 space-y-4">
        {GROUPS.map((group) => (
          <section key={group.title} aria-labelledby={`gear-card-${group.title}`}>
            <h3 id={`gear-card-${group.title}`} className="text-sm font-medium text-foreground">{t(group.title)}</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
              {group.fields.map((field) => (
                <div key={field.key}>
                  <dt className="text-xs text-muted">{t(field.label)}</dt>
                  <dd className="text-sm text-foreground">{gearLabel(t, field.key, shown[field.key])}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      {open ? (
        <GearSizePanel
          gear={shown}
          onClose={() => setOpen(false)}
          onSaved={(saved) => {
            setGear(saved);
            setOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}
