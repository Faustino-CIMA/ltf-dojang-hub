"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";

import { EntityTable } from "@/components/club-admin/entity-table";
import { Button } from "@/components/ui/button";
import { DeleteConfirmModal } from "@/components/ui/delete-confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import { apiRequest } from "@/lib/api";
import {
  createClubClothing,
  deleteClubClothing,
  getClubClothing,
  reorderClubClothing,
  updateClubClothing,
  type ClothingItem,
  type ClothingPreset,
  type ClothingSize,
} from "@/lib/clothing-api";
import type { TableSort } from "@/lib/table-sort";

const PRESET_LABEL = {
  thai_club_tee: "clothingPresetThai",
  generic_tee: "clothingPresetGeneric",
  dobok_height: "clothingPresetDobok",
  jako_shirt: "clothingPresetJakoShirt",
  jako_jacket: "clothingPresetJakoJacket",
  hummel_shirt: "clothingPresetHummelShirt",
  hummel_jacket: "clothingPresetHummelJacket",
} as const;

type PresetKey = (typeof PRESET_LABEL)[keyof typeof PRESET_LABEL];

type SizeDraft = {
  key: string;
  label: string;
  age: string;
  chest_cm: string;
  length_cm: string;
  height_min_cm: string;
  height_max_cm: string;
};

type ItemDraft = {
  id: number | null;
  name: string;
  note: string;
  preset: string;
  sizes: SizeDraft[];
};

function presetLabel(t: (key: PresetKey) => string, id: string) {
  const key = PRESET_LABEL[id as keyof typeof PRESET_LABEL];
  return key ? t(key) : id;
}

function blankSize(key: string): SizeDraft {
  return { key, label: "", age: "", chest_cm: "", length_cm: "", height_min_cm: "", height_max_cm: "" };
}

function sizeToDraft(size: ClothingSize, key: string): SizeDraft {
  return {
    key,
    label: size.label,
    age: size.age,
    chest_cm: size.chest_cm == null ? "" : String(size.chest_cm),
    length_cm: size.length_cm == null ? "" : String(size.length_cm),
    height_min_cm: size.height_min_cm == null ? "" : String(size.height_min_cm),
    height_max_cm: size.height_max_cm == null ? "" : String(size.height_max_cm),
  };
}

function measurement(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) return Number.NaN;
  const number = Number(text);
  if (number < 1 || number > 400) return Number.NaN;
  return number;
}

export function ClothingSizesDesk({ clubId }: { clubId: number }) {
  const t = useTranslations("ClubAdmin");
  const keyRef = useRef(0);
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [presets, setPresets] = useState<ClothingPreset[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ClothingItem | null>(null);
  const [sort, setSort] = useState<TableSort | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function nextKey() {
    keyRef.current += 1;
    return `size-${keyRef.current}`;
  }

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ role: string }>("/api/auth/me/")
      .then((me) => {
        if (!cancelled) setCanEdit(me.role === "club_admin");
      })
      .catch(() => {
        if (!cancelled) setCanEdit(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    getClubClothing(clubId)
      .then((payload) => {
        if (cancelled) return;
        setItems(payload.items);
        setPresets(payload.presets);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("invalid");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  function openItem(item?: ClothingItem) {
    setError(null);
    setDraft(
      item
        ? {
            id: item.id,
            name: item.name,
            note: item.note,
            preset: "",
            sizes: item.sizes.map((size) => sizeToDraft(size, nextKey())),
          }
        : { id: null, name: "", note: "", preset: "", sizes: [] },
    );
  }

  function applyPreset(id: string) {
    setDraft((current) => {
      if (!current) return current;
      if (!id) return { ...current, preset: "" };
      const preset = presets.find((item) => item.id === id);
      if (!preset) return { ...current, preset: id };
      const brand = id.startsWith("jako") ? "Jako" : id.startsWith("hummel") ? "Hummel" : "";
      return {
        ...current,
        preset: id,
        name: current.name.trim() ? current.name : presetLabel(t, id),
        note: current.note.trim() ? current.note : brand,
        sizes: preset.sizes.map((size) => sizeToDraft(size, nextKey())),
      };
    });
  }

  function moveSize(index: number, direction: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const next = index + direction;
      if (next < 0 || next >= current.sizes.length) return current;
      const sizes = [...current.sizes];
      const [row] = sizes.splice(index, 1);
      sizes.splice(next, 0, row);
      return { ...current, sizes };
    });
  }

  function updateSize(index: number, patch: Partial<SizeDraft>) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        sizes: current.sizes.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
      };
    });
  }

  async function saveDraft() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError(t("clothingInvalid"));
      return;
    }
    const sizes: ClothingSize[] = [];
    for (const row of draft.sizes) {
      const label = row.label.trim();
      const touched = label || row.age.trim() || row.chest_cm.trim() || row.length_cm.trim() || row.height_min_cm.trim() || row.height_max_cm.trim();
      if (!touched) continue;
      const chest = measurement(row.chest_cm);
      const length = measurement(row.length_cm);
      const heightMin = measurement(row.height_min_cm);
      const heightMax = measurement(row.height_max_cm);
      if (!label || [chest, length, heightMin, heightMax].some((value) => Number.isNaN(value))) {
        setError(t("clothingInvalid"));
        return;
      }
      sizes.push({
        label,
        age: row.age.trim(),
        chest_cm: chest,
        length_cm: length,
        height_min_cm: heightMin,
        height_max_cm: heightMax,
      });
    }
    setBusy(true);
    setError(null);
    try {
      const body = { name, note: draft.note.trim(), sizes };
      if (draft.id == null) await createClubClothing(clubId, body);
      else await updateClubClothing(draft.id, body);
      const payload = await getClubClothing(clubId);
      setItems(payload.items);
      setDraft(null);
    } catch {
      setError(t("clothingInvalid"));
    } finally {
      setBusy(false);
    }
  }

  async function moveItem(item: ClothingItem, direction: -1 | 1) {
    const index = items.findIndex((row) => row.id === item.id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= items.length) return;
    const order = items.map((row) => row.id);
    const [id] = order.splice(index, 1);
    order.splice(next, 0, id);
    try {
      const payload = await reorderClubClothing(clubId, order);
      setItems(payload.items);
    } catch {
      setError(t("clothingInvalid"));
    }
  }

  const deleteDescription = pendingDelete
    ? `${t("clothingDeleteHint", { name: pendingDelete.name })}${
        pendingDelete.member_count > 0 ? ` ${t("clothingDeleteCount", { count: pendingDelete.member_count })}` : ""
      }`
    : "";

  return (
    <section className="space-y-3" aria-labelledby="clothing-sizes-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="clothing-sizes-title" className="text-section text-foreground">{t("clothingSizesTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("clothingSizesHint")}</p>
        </div>
        {canEdit ? (
          <Button type="button" onClick={() => openItem()}>{t("clothingAdd")}</Button>
        ) : null}
      </div>
      {error && !draft ? <p className="text-sm text-destructive">{t("clothingInvalid")}</p> : null}
      {!loaded ? <p className="text-sm text-muted">{t("loadingTitle")}</p> : null}
      {loaded && items.length === 0 ? <p className="text-sm text-muted">{t("clothingEmpty")}</p> : null}
      {loaded && items.length > 0 ? (
        <EntityTable
          rows={items}
          clientSort
          sort={sort}
          onSortChange={setSort}
          onRowClick={canEdit ? (row) => openItem(row) : undefined}
          columns={[
            {
              key: "name",
              header: t("clothingColumnName"),
              sortable: true,
              sortValue: (row) => row.name,
              render: (row) => row.name,
            },
            {
              key: "note",
              header: t("clothingColumnNote"),
              sortable: true,
              sortValue: (row) => row.note,
              render: (row) => row.note || t("gearNone"),
            },
            {
              key: "sizes",
              header: t("clothingColumnSizes"),
              sortable: true,
              sortValue: (row) => row.sizes.length,
              render: (row) => String(row.sizes.length),
            },
            {
              key: "actions",
              header: <span className="sr-only">{t("clothingRowActions", { name: "" })}</span>,
              cellClassName: "w-12 text-right",
              render: (row) =>
                canEdit ? (
                  <RowActionMenu
                    label={t("clothingRowActions", { name: row.name })}
                    actions={[
                      {
                        key: "up",
                        label: t("clothingMoveUp"),
                        icon: <ChevronUp aria-hidden />,
                        disabled: items[0]?.id === row.id,
                        onSelect: () => void moveItem(row, -1),
                      },
                      {
                        key: "down",
                        label: t("clothingMoveDown"),
                        icon: <ChevronDown aria-hidden />,
                        disabled: items[items.length - 1]?.id === row.id,
                        onSelect: () => void moveItem(row, 1),
                      },
                      {
                        key: "delete",
                        label: t("clothingDelete"),
                        icon: <Trash2 aria-hidden />,
                        destructive: true,
                        onSelect: () => setPendingDelete(row),
                      },
                    ]}
                  />
                ) : null,
            },
          ]}
        />
      ) : null}
      {draft ? (
        <SidePanel
          open
          wide
          title={draft.id == null ? t("clothingNew") : t("clothingEdit")}
          description={t("clothingPresetHint")}
          closeLabel={t("teamsClose")}
          onClose={() => setDraft(null)}
          footer={
            <Button type="submit" form="clothing-item-form" disabled={busy}>
              {busy ? t("clothingSaving") : t("clothingSave")}
            </Button>
          }
        >
          <form
            id="clothing-item-form"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveDraft();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="clothing-item-name" required>{t("clothingName")}</Label>
              <Input
                id="clothing-item-name"
                required
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clothing-item-note">{t("clothingNote")}</Label>
              <Input
                id="clothing-item-note"
                value={draft.note}
                onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("clothingPreset")}</Label>
              <PopoverSelect
                className="w-full"
                ariaLabel={t("clothingPreset")}
                value={draft.preset}
                onValueChange={applyPreset}
                options={[
                  { value: "", label: t("clothingPresetNone") },
                  ...presets.map((preset) => ({ value: preset.id, label: presetLabel(t, preset.id) })),
                ]}
              />
              <p className="text-sm text-muted">{t("clothingPresetHint")}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-foreground">{t("clothingSizes")}</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft({ ...draft, sizes: [...draft.sizes, blankSize(nextKey())] })}
                >
                  {t("clothingAddSize")}
                </Button>
              </div>
              {draft.sizes.map((row, index) => (
                <div key={row.key} data-size-row="" className="space-y-2 rounded-[var(--radius-form)] border border-border p-2">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Button type="button" variant="outline" size="sm" aria-label={`${t("clothingSizeUp")} ${row.label}`} disabled={index === 0} onClick={() => moveSize(index, -1)}>
                      <ChevronUp aria-hidden />
                    </Button>
                    <Button type="button" variant="outline" size="sm" aria-label={`${t("clothingSizeDown")} ${row.label}`} disabled={index === draft.sizes.length - 1} onClick={() => moveSize(index, 1)}>
                      <ChevronDown aria-hidden />
                    </Button>
                    <Button type="button" variant="outline" size="sm" aria-label={`${t("clothingRemoveSize")} ${row.label}`} onClick={() => setDraft({ ...draft, sizes: draft.sizes.filter((item) => item.key !== row.key) })}>
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor={`${row.key}-label`} required>{t("clothingSizeLabel")}</Label>
                      <Input id={`${row.key}-label`} value={row.label} onChange={(event) => updateSize(index, { label: event.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${row.key}-age`}>{t("clothingAgeField")}</Label>
                      <Input id={`${row.key}-age`} value={row.age} onChange={(event) => updateSize(index, { age: event.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${row.key}-chest`}>{t("clothingChestField")}</Label>
                      <Input id={`${row.key}-chest`} inputMode="numeric" value={row.chest_cm} onChange={(event) => updateSize(index, { chest_cm: event.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${row.key}-length`}>{t("clothingLengthField")}</Label>
                      <Input id={`${row.key}-length`} inputMode="numeric" value={row.length_cm} onChange={(event) => updateSize(index, { length_cm: event.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${row.key}-height-min`}>{t("clothingHeightMin")}</Label>
                      <Input id={`${row.key}-height-min`} inputMode="numeric" value={row.height_min_cm} onChange={(event) => updateSize(index, { height_min_cm: event.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${row.key}-height-max`}>{t("clothingHeightMax")}</Label>
                      <Input id={`${row.key}-height-max`} inputMode="numeric" value={row.height_max_cm} onChange={(event) => updateSize(index, { height_max_cm: event.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </form>
        </SidePanel>
      ) : null}
      <DeleteConfirmModal
        isOpen={pendingDelete !== null}
        title={t("clothingDeleteTitle")}
        description={deleteDescription}
        confirmLabel={t("clothingDelete")}
        cancelLabel={t("clothingCancel")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          const item = pendingDelete;
          setPendingDelete(null);
          void deleteClubClothing(item.id)
            .then(() => getClubClothing(clubId))
            .then((payload) => setItems(payload.items))
            .catch(() => setError(t("clothingInvalid")));
        }}
      />
    </section>
  );
}
