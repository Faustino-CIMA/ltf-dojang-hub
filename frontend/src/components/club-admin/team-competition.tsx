"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import { SidePanel } from "@/components/ui/side-panel";
import { removeTeamCompetition, saveTeamCompetition, type ClubTeam, type CustomBand } from "@/lib/club-teams-api";

const SET_CODES = ["wt", "be", "nl", "de", "fr", "at", "custom"] as const;

const SET_KEYS: Record<string, string> = {
  wt: "teamCategorySetWt",
  be: "teamCategorySetBe",
  nl: "teamCategorySetNl",
  de: "teamCategorySetDe",
  fr: "teamCategorySetFr",
  at: "teamCategorySetAt",
  custom: "teamCategorySetCustom",
};

const SOURCE_KEYS: Record<string, string> = {
  wt: "teamCategorySourceWt",
  be: "teamCategorySourceBe",
  nl: "teamCategorySourceNl",
  de: "teamCategorySourceDe",
  fr: "teamCategorySourceFr",
  at: "teamCategorySourceAt",
};

type BandDraft = {
  label: string;
  age_min: string;
  age_max: string;
  sex: "X" | "M" | "F";
  limits: string;
};

function emptyBand(): BandDraft {
  return { label: "", age_min: "", age_max: "", sex: "X", limits: "" };
}

function draftsFrom(team: ClubTeam): BandDraft[] {
  if (!team.custom_bands?.length) return [emptyBand()];
  return team.custom_bands.map((band) => ({
    label: band.label,
    age_min: String(band.age_min),
    age_max: String(band.age_max),
    sex: band.sex,
    limits: band.ceilings.join(","),
  }));
}

function parseLimits(value: string): number[] | null {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0 || parts.some((part) => !/^\d+(\.\d)?$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.some((number) => number <= 0 || number > 250)) return null;
  if (numbers.some((number, index) => index > 0 && numbers[index - 1] >= number)) return null;
  return numbers;
}

function parseBands(rows: BandDraft[]): CustomBand[] | null {
  if (rows.length === 0) return null;
  const parsed: CustomBand[] = [];
  for (const row of rows) {
    if (!/^\d+$/.test(row.age_min) || !/^\d+$/.test(row.age_max)) return null;
    const ageMin = Number(row.age_min);
    const ageMax = Number(row.age_max);
    if (ageMin > 99 || ageMax > 99 || ageMin > ageMax) return null;
    const ceilings = parseLimits(row.limits);
    if (!ceilings || (row.sex !== "M" && row.sex !== "F" && row.sex !== "X")) return null;
    parsed.push({ label: row.label.trim(), age_min: ageMin, age_max: ageMax, sex: row.sex, ceilings });
  }
  return parsed;
}

export function TeamCompetitionPanel({
  team,
  onClose,
  onSaved,
}: {
  team: ClubTeam;
  onClose: () => void;
  onSaved: (team: ClubTeam) => void;
}) {
  const t = useTranslations("ClubAdmin");
  const kyorugi = team.discipline === "kyorugi";
  const [competitionOn, setCompetitionOn] = useState(team.competition_on ?? "");
  const [competitionName, setCompetitionName] = useState(team.competition_name ?? "");
  const [margin, setMargin] = useState(team.weight_margin_kg ?? "1.0");
  const [setCode, setSetCode] = useState<string>(team.category_set ?? "wt");
  const [bands, setBands] = useState<BandDraft[]>(() => draftsFrom(team));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const sourceKey = SOURCE_KEYS[setCode];
  const hasCompetition = Boolean(
    team.competition_on ||
      team.competition_name ||
      (kyorugi && (team.category_set ?? "wt") !== "wt") ||
      (team.custom_bands?.length ?? 0) > 0,
  );

  function updateBand(index: number, patch: Partial<BandDraft>) {
    setBands((current) => current.map((row, item) => (item === index ? { ...row, ...patch } : row)));
  }

  return (
    <SidePanel open title={t("teamCompetition")} description={t("teamCompetitionHint")} closeLabel={t("teamsClose")} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = margin.trim();
          if (trimmed && (!/^\d+(\.\d)?$/.test(trimmed) || Number(trimmed) > 20)) {
            setError(t("teamMarginError"));
            return;
          }
          const custom = setCode === "custom" ? parseBands(bands) : null;
          if (kyorugi && setCode === "custom" && !custom) {
            setError(t("teamCustomError"));
            return;
          }
          setBusy(true);
          setError(null);
          void saveTeamCompetition(team.id, {
            competition_on: competitionOn || null,
            competition_name: competitionName.trim(),
            weight_margin_kg: trimmed || "1.0",
            ...(kyorugi
              ? {
                  category_set: setCode,
                  ...(custom ? { custom_bands: custom } : {}),
                }
              : {}),
          })
            .then(onSaved)
            .catch(() => setError(t("teamMarginError")))
            .finally(() => setBusy(false));
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="competition-date">{t("teamCompetitionDate")}</Label>
          <Input id="competition-date" type="date" value={competitionOn} onChange={(event) => setCompetitionOn(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="competition-name">{t("teamCompetitionName")}</Label>
          <Input id="competition-name" value={competitionName} onChange={(event) => setCompetitionName(event.target.value)} />
        </div>
        {kyorugi ? (
          <div className="space-y-2">
            <Label>{t("teamCategorySet")}</Label>
            <PopoverSelect
              className="w-full"
              ariaLabel={t("teamCategorySet")}
              value={setCode}
              onValueChange={setSetCode}
              options={SET_CODES.map((code) => ({ value: code, label: t(SET_KEYS[code]) }))}
            />
            {setCode === "custom" ? (
              <p className="text-xs text-muted">{t("teamCustomHint")}</p>
            ) : sourceKey ? (
              <p className="text-xs text-muted">{t(sourceKey)}</p>
            ) : null}
          </div>
        ) : null}
        {kyorugi && setCode === "custom" ? (
          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-medium text-foreground">{t("teamCustomTitle")}</h3>
            {bands.map((band, index) => (
              <div key={index} className="space-y-3 border-b border-border pb-4">
                <div className="space-y-2">
                  <Label htmlFor={`band-label-${index}`}>{t("teamCustomBandLabel")}</Label>
                  <Input
                    id={`band-label-${index}`}
                    value={band.label}
                    onChange={(event) => updateBand(index, { label: event.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor={`band-from-${index}`} required>{t("teamCustomAgeFrom")}</Label>
                    <Input
                      id={`band-from-${index}`}
                      inputMode="numeric"
                      value={band.age_min}
                      onChange={(event) => updateBand(index, { age_min: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`band-to-${index}`} required>{t("teamCustomAgeTo")}</Label>
                    <Input
                      id={`band-to-${index}`}
                      inputMode="numeric"
                      value={band.age_max}
                      onChange={(event) => updateBand(index, { age_max: event.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("teamCustomSex")}</Label>
                  <PopoverSelect
                    className="w-full"
                    ariaLabel={t("teamCustomSex")}
                    value={band.sex}
                    onValueChange={(value) => updateBand(index, { sex: value as BandDraft["sex"] })}
                    options={[
                      { value: "X", label: t("teamCustomSexMixed") },
                      { value: "M", label: t("teamCustomSexMale") },
                      { value: "F", label: t("teamCustomSexFemale") },
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`band-limits-${index}`} required>{t("teamCustomLimits")}</Label>
                  <Input
                    id={`band-limits-${index}`}
                    value={band.limits}
                    onChange={(event) => updateBand(index, { limits: event.target.value })}
                  />
                  <p className="text-xs text-muted">{t("teamCustomLimitsHint")}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setBands((current) => current.filter((_, item) => item !== index))}>
                  {t("teamCustomRemoveBand")}
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setBands((current) => [...current, emptyBand()])}>
              {t("teamCustomAddBand")}
            </Button>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="weight-margin">{t("teamWeightMargin")}</Label>
          <Input id="weight-margin" inputMode="decimal" value={margin} onChange={(event) => setMargin(event.target.value)} />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={busy}>{busy ? t("teamsSaving") : t("teamsSave")}</Button>
        {hasCompetition ? (
          confirmRemove ? (
            <div className="space-y-2">
              <p className="text-sm text-foreground">{t("teamCompetitionRemovePrompt")}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setError(null);
                    void removeTeamCompetition(team.id)
                      .then(onSaved)
                      .catch(() => setError(t("teamMarginError")))
                      .finally(() => setBusy(false));
                  }}
                >
                  {t("teamCompetitionRemove")}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmRemove(false)}>
                  {t("teamsClose")}
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="destructive" disabled={busy} onClick={() => setConfirmRemove(true)}>
              {t("teamCompetitionRemove")}
            </Button>
          )
        ) : null}
      </form>
    </SidePanel>
  );
}
