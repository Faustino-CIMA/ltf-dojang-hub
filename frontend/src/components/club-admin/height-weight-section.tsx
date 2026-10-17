"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable, type EntityTableColumn } from "@/components/club-admin/entity-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import {
  deleteBodyMeasurement,
  getBodyMeasurements,
  measurementKind,
  saveBodyMeasurement,
  todayIsoDate,
  type BodyMeasurement,
  type MeasurementKind,
  type WeightSuggestion,
} from "@/lib/body-measurements-api";
import { formatDisplayDate } from "@/lib/date-display";
import { formatAgeClassLabel } from "@/lib/age-class";
import { type TableSort } from "@/lib/table-sort";

type MeasuredMember = {
  id: number;
  latest_weight_kg?: string | null;
  latest_weight_on?: string | null;
  latest_height_cm?: number | null;
  latest_height_on?: string | null;
};

export function latestMeasurementColumns(
  t: (key: string, values?: Record<string, string | number>) => string
): Array<EntityTableColumn<MeasuredMember>> {
  return [
    {
      key: "latest_weight",
      header: t("heightWeightLatestWeight"),
      sortable: true,
      render: (member) =>
        member.latest_weight_kg ? (
          <span className="block">
            <span className="block text-foreground">{t("heightWeightKg", { value: member.latest_weight_kg })}</span>
            <span className="block text-xs text-muted">{formatDisplayDate(member.latest_weight_on)}</span>
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "latest_height",
      header: t("heightWeightLatestHeight"),
      sortable: true,
      render: (member) =>
        member.latest_height_cm ? (
          <span className="block">
            <span className="block text-foreground">{t("heightWeightCm", { value: member.latest_height_cm })}</span>
            <span className="block text-xs text-muted">{formatDisplayDate(member.latest_height_on)}</span>
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];
}

function TrendChart({
  label,
  empty,
  unit,
  points,
}: {
  label: string;
  empty: string;
  unit: string;
  points: { measured_on: string; value: number }[];
}) {
  const width = 320;
  const height = 112;
  const pad = 10;
  const values = points.map((point) => point.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const span = max - min || 1;
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : pad + (index / (points.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (point.value - min) / span) * (height - pad * 2);
    return { x, y };
  });
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <p className="text-sm font-medium text-foreground">{label}</p>
      {points.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-28 w-full text-primary" role="img" aria-label={label}>
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              points={coords.map((point) => `${point.x},${point.y}`).join(" ")}
            />
            {coords.map((point) => (
              <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="3" fill="currentColor" />
            ))}
          </svg>
          <p className="text-xs text-muted">
            {min}–{max} {unit}
          </p>
        </>
      )}
    </div>
  );
}

function MeasurementForm({
  memberId,
  row,
  busy,
  onClose,
  onSaved,
}: {
  memberId: number;
  row: BodyMeasurement | null;
  busy: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("ClubAdmin");
  const [kind, setKind] = useState<MeasurementKind>(row ? measurementKind(row) : "weight");
  const [measuredOn, setMeasuredOn] = useState(row?.measured_on || todayIsoDate());
  const [weight, setWeight] = useState(row?.weight_kg ?? "");
  const [height, setHeight] = useState(row?.height_cm ? String(row.height_cm) : "");
  const [note, setNote] = useState(row?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const showWeight = kind === "weight" || kind === "both";
  const showHeight = kind === "height" || kind === "both";

  function validate(): string | null {
    if (!measuredOn) return t("heightWeightRequired");
    if (showWeight) {
      const text = weight.trim();
      if (!text) return t("heightWeightRequired");
      if (!/^\d+(\.\d)?$/.test(text)) return t("heightWeightRangeError");
      const value = Number(text);
      if (value < 10 || value > 250) return t("heightWeightRangeError");
    }
    if (showHeight) {
      const text = height.trim();
      if (!text) return t("heightWeightRequired");
      if (!/^\d+$/.test(text)) return t("heightWeightRangeError");
      const value = Number(text);
      if (value < 80 || value > 230) return t("heightWeightRangeError");
    }
    return null;
  }

  return (
    <SidePanel
      open
      title={row ? t("heightWeightEdit") : t("heightWeightAdd")}
      description={t("heightWeightHint")}
      closeLabel={t("heightWeightClose")}
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const problem = validate();
          if (problem) {
            setError(problem);
            return;
          }
          setError(null);
          void saveBodyMeasurement(row?.id ?? null, {
            member: memberId,
            measured_on: measuredOn,
            weight_kg: showWeight ? weight.trim() : null,
            height_cm: showHeight ? Number(height) : null,
            note,
          })
            .then(() => onSaved())
            .catch((reason: unknown) => {
              const message = reason instanceof Error ? reason.message : "";
              setError(message.includes("out_of_range") ? t("heightWeightRangeError") : t("heightWeightRequired"));
            });
        }}
      >
        <div className="space-y-2">
          <Label required>{t("heightWeightKind")}</Label>
          <PopoverSelect
            className="w-full"
            ariaLabel={t("heightWeightKind")}
            value={kind}
            onValueChange={(value) => setKind(value as MeasurementKind)}
            options={[
              { value: "weight", label: t("heightWeightKindWeight") },
              { value: "height", label: t("heightWeightKindHeight") },
              { value: "both", label: t("heightWeightKindBoth") },
            ]}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="measurement-date" required>
            {t("heightWeightDate")}
          </Label>
          <Input id="measurement-date" type="date" value={measuredOn} onChange={(event) => setMeasuredOn(event.target.value)} />
        </div>
        {showWeight ? (
          <div className="space-y-2">
            <Label htmlFor="measurement-weight" required>
              {t("heightWeightWeight")}
            </Label>
            <Input id="measurement-weight" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} />
          </div>
        ) : null}
        {showHeight ? (
          <div className="space-y-2">
            <Label htmlFor="measurement-height" required>
              {t("heightWeightHeight")}
            </Label>
            <Input id="measurement-height" inputMode="numeric" value={height} onChange={(event) => setHeight(event.target.value)} />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="measurement-note">{t("heightWeightNote")}</Label>
          <Input id="measurement-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={busy}>
          {busy ? t("heightWeightSaving") : t("heightWeightSave")}
        </Button>
      </form>
    </SidePanel>
  );
}

export function HeightWeightSection({ memberId }: { memberId: number }) {
  const t = useTranslations("ClubAdmin");
  const [rows, setRows] = useState<BodyMeasurement[]>([]);
  const [suggestion, setSuggestion] = useState<WeightSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<BodyMeasurement | null>(null);
  const [panel, setPanel] = useState<"add" | "edit" | null>(null);
  const [sort, setSort] = useState<TableSort>({ key: "measured_on", direction: "desc" });

  function load() {
    setLoading(true);
    return getBodyMeasurements(memberId)
      .then((payload) => {
        setRows(payload.results);
        setSuggestion(payload.suggestion);
      })
      .catch(() => {
        setRows([]);
        setSuggestion(null);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    void getBodyMeasurements(memberId)
      .then((payload) => {
        if (cancelled) return;
        setRows(payload.results);
        setSuggestion(payload.suggestion);
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setSuggestion(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const weightPoints = useMemo(
    () =>
      rows
        .filter((row) => row.weight_kg)
        .map((row) => ({ measured_on: row.measured_on, value: Number(row.weight_kg) }))
        .sort((left, right) => left.measured_on.localeCompare(right.measured_on)),
    [rows]
  );
  const heightPoints = useMemo(
    () =>
      rows
        .filter((row) => row.height_cm)
        .map((row) => ({ measured_on: row.measured_on, value: Number(row.height_cm) }))
        .sort((left, right) => left.measured_on.localeCompare(right.measured_on)),
    [rows]
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-section text-foreground">{t("heightWeightTitle")}</h2>
          <p className="text-sm text-muted">{t("heightWeightHint")}</p>
        </div>
        <Button type="button" onClick={() => { setEditing(null); setPanel("add"); }}>
          {t("heightWeightAdd")}
        </Button>
      </div>
      {suggestion ? (
        <p className="text-sm text-foreground">
          {t("heightWeightSuggestion", {
            category: suggestion.category,
            ageClass: formatAgeClassLabel(t, suggestion.age_class),
          })}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <TrendChart label={t("heightWeightWeightChart")} empty={t("heightWeightChartEmpty")} unit="kg" points={weightPoints} />
        <TrendChart label={t("heightWeightHeightChart")} empty={t("heightWeightChartEmpty")} unit="cm" points={heightPoints} />
      </div>
      {loading ? (
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      ) : rows.length === 0 ? (
        <EmptyState title={t("heightWeightEmptyTitle")} description={t("heightWeightEmptySubtitle")} />
      ) : (
        <EntityTable
          columns={[
            {
              key: "measured_on",
              header: t("heightWeightDateColumn"),
              sortable: true,
              sortValue: (row: BodyMeasurement) => row.measured_on,
              render: (row) => formatDisplayDate(row.measured_on),
            },
            {
              key: "weight_kg",
              header: t("heightWeightWeightColumn"),
              sortable: true,
              sortValue: (row: BodyMeasurement) => (row.weight_kg ? Number(row.weight_kg) : null),
              render: (row) => (row.weight_kg ? t("heightWeightKg", { value: row.weight_kg }) : "—"),
            },
            {
              key: "height_cm",
              header: t("heightWeightHeightColumn"),
              sortable: true,
              sortValue: (row: BodyMeasurement) => row.height_cm,
              render: (row) => (row.height_cm ? t("heightWeightCm", { value: row.height_cm }) : "—"),
            },
            {
              key: "note",
              header: t("heightWeightNoteColumn"),
              render: (row) => row.note || "—",
            },
            {
              key: "actions",
              header: t("heightWeightActions"),
              render: (row) => (
                <RowActionMenu
                  label={t("heightWeightActions")}
                  actions={[
                    { key: "edit", label: t("heightWeightEditAction"), onSelect: () => { setEditing(row); setPanel("edit"); } },
                    {
                      key: "delete",
                      label: t("heightWeightDeleteAction"),
                      destructive: true,
                      onSelect: () => {
                        setBusy(true);
                        void deleteBodyMeasurement(row.id)
                          .then(() => load())
                          .finally(() => setBusy(false));
                      },
                    },
                  ]}
                />
              ),
            },
          ]}
          rows={rows}
          sort={sort}
          onSortChange={setSort}
          clientSort
        />
      )}
      {panel ? (
        <MeasurementForm
          memberId={memberId}
          row={panel === "edit" ? editing : null}
          busy={busy}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            setBusy(true);
            void load().finally(() => setBusy(false));
          }}
        />
      ) : null}
    </section>
  );
}
