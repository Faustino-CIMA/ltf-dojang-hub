"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import { SidePanel } from "@/components/ui/side-panel";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { formatDisplayDate } from "@/lib/date-display";
import {
  DAEDO_HEAD,
  DAEDO_HOGU,
  DAEDO_SOCK,
  GENERIC_SIZE,
  KPNP_GLOVE,
  KPNP_HEAD,
  KPNP_HOGU,
  KPNP_SOCK,
  MOUTHGUARD,
  REGULAR_SIZE,
  blankGear,
  getMemberGear,
  saveMemberGear,
  type ClothingChoice,
  type GearKey,
  type MemberGear,
} from "@/lib/member-gear-api";

type Translator = (key: string, values?: Record<string, string | number>) => string;

export type GearTabId = "protectors" | "egear" | "clothing";

type GearField = {
  key: GearKey;
  label: string;
  scale: readonly string[];
  hint?: string;
};

type GearSection = {
  id: string;
  title?: string;
  fields: GearField[];
};

export const GEAR_TABS: Array<{ id: GearTabId; label: string; sections: GearSection[] }> = [
  {
    id: "protectors",
    label: "gearProtectors",
    sections: [
      {
        id: "protectors",
        fields: [
          { key: "chest", label: "gearHogu", scale: REGULAR_SIZE },
          { key: "headgear", label: "gearHead", scale: REGULAR_SIZE },
          { key: "shin", label: "gearShin", scale: GENERIC_SIZE },
          { key: "forearm", label: "gearForearm", scale: GENERIC_SIZE },
          { key: "groin", label: "gearGroin", scale: GENERIC_SIZE },
          { key: "mouthguard", label: "gearMouthguard", scale: MOUTHGUARD },
        ],
      },
    ],
  },
  {
    id: "egear",
    label: "gearEgear",
    sections: [
      {
        id: "daedo",
        title: "gearDaedo",
        fields: [
          { key: "daedo_sock", label: "gearSock", scale: DAEDO_SOCK, hint: "gearSockHint" },
          { key: "daedo_glove", label: "gearGlove", scale: DAEDO_SOCK },
          { key: "daedo_hogu", label: "gearHogu", scale: DAEDO_HOGU },
          { key: "daedo_head", label: "gearHead", scale: DAEDO_HEAD },
        ],
      },
      {
        id: "kpnp",
        title: "gearKpnp",
        fields: [
          { key: "kpnp_sock", label: "gearSock", scale: KPNP_SOCK },
          { key: "kpnp_glove", label: "gearGlove", scale: KPNP_GLOVE },
          { key: "kpnp_hogu", label: "gearHogu", scale: KPNP_HOGU },
          { key: "kpnp_head", label: "gearHead", scale: KPNP_HEAD },
        ],
      },
    ],
  },
];

const GEAR_TAB_OPTIONS: Array<{ id: GearTabId; label: string }> = [
  ...GEAR_TABS.map((tab) => ({ id: tab.id, label: tab.label })),
  { id: "clothing", label: "gearClothingOther" },
];

export function gearTabCount(gear: MemberGear, tabId: GearTabId) {
  if (tabId === "clothing") return (gear.clothing ?? []).filter((row) => Boolean(row.label)).length;
  const tab = GEAR_TABS.find((item) => item.id === tabId);
  if (!tab) return 0;
  return tab.sections.reduce(
    (total, section) => total + section.fields.filter((field) => Boolean(gear[field.key])).length,
    0,
  );
}

export function gearLabel(t: Translator, key: GearKey, value: string) {
  if (!value) return t("gearNone");
  if (key === "mouthguard") return value === "adult" ? t("gearMouthAdult") : t("gearMouthYouth");
  return value;
}

export function clothingValueText(t: Translator, row: ClothingChoice) {
  if (!row.label) return t("gearNone");
  if (!row.offered) return t("clothingRetired", { label: row.label });
  return row.label;
}

export function clothingHint(t: Translator, row: ClothingChoice) {
  if (!row.label || !row.offered) return "";
  const size = row.sizes.find((item) => item.label === row.label);
  if (!size) return "";
  const parts: string[] = [];
  if (size.age) parts.push(t("clothingAge", { age: size.age }));
  if (size.chest_cm) parts.push(t("clothingChest", { chest: size.chest_cm }));
  if (size.length_cm) parts.push(t("clothingLength", { length: size.length_cm }));
  if (size.height_min_cm && size.height_max_cm && size.height_min_cm !== size.height_max_cm) {
    parts.push(t("clothingHeightRange", { min: size.height_min_cm, max: size.height_max_cm }));
  } else if (size.height_min_cm || size.height_max_cm) {
    parts.push(t("clothingHeight", { min: (size.height_min_cm || size.height_max_cm) as number }));
  }
  return parts.join(" · ");
}

function clothingOptions(t: Translator, row: ClothingChoice) {
  const options = [
    { value: "", label: t("gearNone") },
    ...row.sizes.map((size) => ({ value: size.label, label: size.label })),
  ];
  if (row.label && !row.sizes.some((size) => size.label === row.label)) {
    options.push({ value: row.label, label: t("clothingRetired", { label: row.label }) });
  }
  return options;
}

function ClothingList({ rows, idPrefix }: { rows: ClothingChoice[]; idPrefix: string }) {
  const t = useTranslations("ClubAdmin");
  return (
    <div id={`${idPrefix}-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-clothing`}>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {rows.map((row) => {
          const hint = clothingHint(t, row);
          return (
            <div key={row.item ?? `retired-${row.value}`}>
              <dt className="text-xs text-muted">{row.name}</dt>
              {row.note ? <p className="text-xs text-muted">{row.note}</p> : null}
              <dd className="text-sm text-foreground">{clothingValueText(t, row)}</dd>
              {hint ? <p className="text-xs text-muted">{hint}</p> : null}
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function optionLabel(t: Translator, key: GearKey, value: string) {
  return gearLabel(t, key, value);
}

function GearReadout({
  gear,
  tabId,
  idPrefix,
}: {
  gear: MemberGear;
  tabId: GearTabId;
  idPrefix: string;
}) {
  const t = useTranslations("ClubAdmin");
  if (tabId === "clothing") return <ClothingList rows={gear.clothing ?? []} idPrefix={idPrefix} />;
  const tab = GEAR_TABS.find((item) => item.id === tabId) ?? GEAR_TABS[0];
  return (
    <div id={`${idPrefix}-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-${tab.id}`} className="space-y-4">
      {tab.sections.map((section) => (
        <section key={section.id} aria-labelledby={section.title ? `${idPrefix}-${section.id}` : undefined}>
          {section.title ? (
            <h3 id={`${idPrefix}-${section.id}`} className="text-sm font-medium text-foreground">{t(section.title)}</h3>
          ) : null}
          <dl className={section.title ? "mt-2 grid grid-cols-2 gap-x-3 gap-y-2" : "grid grid-cols-2 gap-x-3 gap-y-2"}>
            {section.fields.map((field) => (
              <div key={field.key}>
                <dt className="text-xs text-muted">{t(field.label)}</dt>
                <dd className="text-sm text-foreground">{gearLabel(t, field.key, gear[field.key])}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function GearSizePanel({
  gear,
  initialTab = "protectors",
  onClose,
  onSaved,
}: {
  gear: MemberGear;
  initialTab?: GearTabId;
  onClose: () => void;
  onSaved: (gear: MemberGear) => void;
}) {
  const t = useTranslations("ClubAdmin");
  const [draft, setDraft] = useState<MemberGear>(gear);
  const [tab, setTab] = useState<GearTabId>(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = GEAR_TABS.find((item) => item.id === tab);

  function setClothingLabel(index: number, label: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      clothing: (currentDraft.clothing ?? []).map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        return { ...row, label, offered: label === "" || row.sizes.some((size) => size.label === label) };
      }),
    }));
  }

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
        <UnderlineTabs
          idPrefix="gear-edit"
          ariaLabel={t("gearTitle")}
          value={tab}
          onChange={setTab}
          options={GEAR_TAB_OPTIONS.map((item) => ({
            value: item.id,
            label: t(item.label),
            count: gearTabCount(draft, item.id),
          }))}
        />
        {tab === "clothing" ? (
          <div id="gear-edit-panel" role="tabpanel" aria-labelledby="gear-edit-clothing" className="space-y-4">
            {(draft.clothing ?? []).map((row, index) => {
              const hint = clothingHint(t, row);
              return (
                <div key={row.item ?? `retired-${row.value}`} className="space-y-2">
                  <Label>{row.name}</Label>
                  {row.note ? <p className="text-xs text-muted">{row.note}</p> : null}
                  <PopoverSelect
                    className="w-full"
                    ariaLabel={row.name}
                    value={row.label}
                    onValueChange={(value) => setClothingLabel(index, value)}
                    options={clothingOptions(t, row)}
                  />
                  {hint ? <p className="text-sm text-muted">{hint}</p> : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {current ? (
        <div id="gear-edit-panel" role="tabpanel" aria-labelledby={`gear-edit-${current.id}`} className="space-y-4">
          {current.sections.map((section) => (
            <section key={section.id} className="space-y-3" aria-labelledby={section.title ? `gear-edit-${section.id}` : undefined}>
              {section.title ? (
                <h3 id={`gear-edit-${section.id}`} className="text-sm font-medium text-foreground">{t(section.title)}</h3>
              ) : null}
              {section.fields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label>{t(field.label)}</Label>
                  <PopoverSelect
                    className="w-full"
                    ariaLabel={`${t(section.title ?? current.label)} ${t(field.label)}`}
                    value={draft[field.key]}
                    onValueChange={(value) => setDraft((currentDraft) => ({ ...currentDraft, [field.key]: value }))}
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
        </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={busy}>{busy ? t("gearSaving") : t("gearSave")}</Button>
      </form>
    </SidePanel>
  );
}

export function MemberGearCard({ memberId, preview }: { memberId: number; preview?: MemberGear }) {
  const t = useTranslations("ClubAdmin");
  const [gear, setGear] = useState<MemberGear | null>(preview ?? null);
  const [tab, setTab] = useState<GearTabId>("protectors");
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
      <div className="mt-4 space-y-3">
        <UnderlineTabs
          idPrefix="member-gear"
          ariaLabel={t("gearTitle")}
          value={tab}
          onChange={setTab}
          options={GEAR_TAB_OPTIONS.map((item) => ({
            value: item.id,
            label: t(item.label),
            count: gearTabCount(shown, item.id),
          }))}
        />
        <GearReadout gear={shown} tabId={tab} idPrefix="member-gear" />
      </div>
      {open ? (
        <GearSizePanel
          gear={shown}
          initialTab={tab}
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

export function MemberGearSummary({
  memberId,
  gear,
  onSaved,
}: {
  memberId: number;
  gear?: Partial<MemberGear> | null;
  onSaved?: (gear: MemberGear) => void;
}) {
  const t = useTranslations("ClubAdmin");
  const shown: MemberGear = { ...blankGear(memberId), ...gear, member: memberId, clothing: gear?.clothing ?? [] };
  const [open, setOpen] = useState(false);
  return (
    <section className="min-w-0 space-y-2" aria-labelledby={`gear-summary-${memberId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`gear-summary-${memberId}`} className="text-sm font-medium text-foreground">{t("gearTitle")}</h3>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>{t("gearEdit")}</Button>
      </div>
      {GEAR_TABS.map((tab) => (
        <div key={tab.id} className="space-y-2">
          <p className="text-xs text-muted">{t(tab.label)}</p>
          {tab.sections.map((section) => (
            <div key={section.id}>
              {section.title ? <p className="text-xs text-muted">{t(section.title)}</p> : null}
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                {section.fields.map((field) => (
                  <div key={field.key}>
                    <dt className="text-xs text-muted">{t(field.label)}</dt>
                    <dd className="text-sm text-foreground">{gearLabel(t, field.key, shown[field.key])}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      ))}
      <div className="space-y-1">
        <p className="text-xs text-muted">{t("gearClothingOther")}</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          {shown.clothing.map((row) => {
            const hint = clothingHint(t, row);
            return (
              <div key={row.item ?? `retired-${row.value}`}>
                <dt className="text-xs text-muted">{row.name}</dt>
                <dd className="text-sm text-foreground">{clothingValueText(t, row)}</dd>
                {hint ? <p className="text-xs text-muted">{hint}</p> : null}
              </div>
            );
          })}
        </dl>
      </div>
      {open ? (
        <GearSizePanel
          gear={shown}
          onClose={() => setOpen(false)}
          onSaved={(saved) => {
            onSaved?.(saved);
            setOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}
