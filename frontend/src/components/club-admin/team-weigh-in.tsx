"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidePanel } from "@/components/ui/side-panel";
import { todayIsoDate } from "@/lib/body-measurements-api";
import { saveTeamWeighIn, type ClubTeam, type TeamMember } from "@/lib/club-teams-api";
import { formatDisplayDate } from "@/lib/date-display";
import { formatFullName } from "@/lib/person-name";

export function TeamWeighInPanel({
  team,
  onClose,
  onSaved,
}: {
  team: ClubTeam;
  onClose: () => void;
  onSaved: (team: ClubTeam) => void;
}) {
  const t = useTranslations("ClubAdmin");
  const members = (team.members ?? []).filter((member) => member.role !== "coach");
  const [measuredOn, setMeasuredOn] = useState(todayIsoDate());
  const [weights, setWeights] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <SidePanel open title={t("teamWeighIn")} description={t("teamWeighInHint")} closeLabel={t("teamsClose")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!measuredOn) {
            setError(t("teamWeighInError"));
            return;
          }
          const entries = members.map((member) => ({ member: member.id, weight_kg: (weights[member.id] ?? "").trim() }));
          const filled = entries.filter((entry) => entry.weight_kg);
          const invalid = filled.some((entry) => {
            if (!/^\d+(\.\d)?$/.test(entry.weight_kg)) return true;
            const value = Number(entry.weight_kg);
            return value < 10 || value > 250;
          });
          if (invalid) {
            setError(t("teamWeighInError"));
            return;
          }
          setBusy(true);
          setError(null);
          void saveTeamWeighIn(team.id, measuredOn, filled)
            .then((payload) => onSaved(payload.team))
            .catch(() => setError(t("teamWeighInError")))
            .finally(() => setBusy(false));
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="weigh-in-date" required>{t("heightWeightDate")}</Label>
          <Input id="weigh-in-date" type="date" value={measuredOn} onChange={(event) => setMeasuredOn(event.target.value)} />
        </div>
        <ul className="space-y-3">
          {members.map((member) => (
            <li key={member.id} className="space-y-2 border-b border-border pb-3">
              <p className="text-sm font-medium text-foreground">{formatFullName(member)}</p>
              <p className="text-xs text-muted">{previousWeight(t, member)}</p>
              <Label htmlFor={`weigh-${member.id}`}>{t("teamWeighInWeight")}</Label>
              <Input
                id={`weigh-${member.id}`}
                inputMode="decimal"
                value={weights[member.id] ?? ""}
                onChange={(event) => setWeights((current) => ({ ...current, [member.id]: event.target.value }))}
              />
            </li>
          ))}
        </ul>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={busy}>{busy ? t("teamWeighInSaving") : t("teamWeighInSave")}</Button>
      </form>
    </SidePanel>
  );
}

function previousWeight(t: (key: string, values?: Record<string, string | number>) => string, member: TeamMember) {
  if (!member.latest_weight_kg) return t("teamWeighInNone");
  const value = t("heightWeightKg", { value: member.latest_weight_kg });
  return member.latest_weight_on ? `${value} · ${formatDisplayDate(member.latest_weight_on)}` : value;
}
