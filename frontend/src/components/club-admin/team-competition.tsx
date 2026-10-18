"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidePanel } from "@/components/ui/side-panel";
import { saveTeamCompetition, type ClubTeam } from "@/lib/club-teams-api";

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
  const [competitionOn, setCompetitionOn] = useState(team.competition_on ?? "");
  const [competitionName, setCompetitionName] = useState(team.competition_name ?? "");
  const [margin, setMargin] = useState(team.weight_margin_kg ?? "1.0");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <SidePanel open title={t("teamCompetition")} description={t("teamCompetitionHint")} closeLabel={t("teamsClose")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = margin.trim();
          if (trimmed && (!/^\d+(\.\d)?$/.test(trimmed) || Number(trimmed) > 20)) {
            setError(t("teamMarginError"));
            return;
          }
          setBusy(true);
          setError(null);
          void saveTeamCompetition(team.id, {
            competition_on: competitionOn || null,
            competition_name: competitionName.trim(),
            weight_margin_kg: trimmed || "1.0",
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
        <div className="space-y-2">
          <Label htmlFor="weight-margin">{t("teamWeightMargin")}</Label>
          <Input id="weight-margin" inputMode="decimal" value={margin} onChange={(event) => setMargin(event.target.value)} />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={busy}>{busy ? t("teamsSaving") : t("teamsSave")}</Button>
      </form>
    </SidePanel>
  );
}
