"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addClubRulesVersion,
  getClubOnboarding,
  openClubRulesFile,
  saveClubOnboarding,
  type ClubOnboardingSettings,
  type OnboardingRequirement,
} from "@/lib/clubmgmt-api";
import { formatDisplayDate } from "@/lib/date-display";

const REQUIREMENTS: OnboardingRequirement[] = ["hidden", "optional", "required"];

const emptySettings: ClubOnboardingSettings = {
  public_link_enabled: false,
  invites_enabled: false,
  equipment_note: "",
  photo_requirement: "optional",
  medico_requirement: "optional",
  rules: [],
};

export function ClubOnboardingSettings({
  clubId,
  onError,
  onSuccess,
}: {
  clubId: number;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const t = useTranslations("ClubAdmin");
  const [settings, setSettings] = useState<ClubOnboardingSettings>(emptySettings);
  const [effectiveOn, setEffectiveOn] = useState("");
  const [rulesUrl, setRulesUrl] = useState("");
  const [rulesFile, setRulesFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getClubOnboarding(clubId)
      .then((row) => {
        if (!cancelled) setSettings(row);
      })
      .catch((error: unknown) => {
        if (!cancelled) onError(error instanceof Error ? error.message : t("onboardingLoadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [clubId, onError, t]);

  const requirementLabel = (value: OnboardingRequirement) =>
    value === "hidden" ? t("onboardingRequirementHidden") : value === "required" ? t("onboardingRequirementRequired") : t("onboardingRequirementOptional");

  async function saveSettings() {
    setSaving(true);
    try {
      const saved = await saveClubOnboarding(clubId, {
        public_link_enabled: settings.public_link_enabled,
        invites_enabled: settings.invites_enabled,
        equipment_note: settings.equipment_note,
        photo_requirement: settings.photo_requirement,
        medico_requirement: settings.medico_requirement,
      });
      setSettings(saved);
      onSuccess(t("onboardingSettingsSaved"));
    } catch (error) {
      onError(error instanceof Error ? error.message : t("onboardingLoadError"));
    } finally {
      setSaving(false);
    }
  }

  async function addVersion() {
    if (!effectiveOn || Boolean(rulesFile) === Boolean(rulesUrl.trim())) {
      onError(t("onboardingRulesNeedOne"));
      return;
    }
    setSaving(true);
    try {
      await addClubRulesVersion(
        clubId,
        effectiveOn,
        rulesFile ? { file: rulesFile } : { url: rulesUrl.trim() },
      );
      const saved = await getClubOnboarding(clubId);
      setSettings(saved);
      setRulesFile(null);
      setRulesUrl("");
      onSuccess(t("onboardingRulesSaved"));
    } catch (error) {
      onError(error instanceof Error ? error.message : t("onboardingLoadError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6 rounded-[var(--radius-card)] border border-border bg-card p-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("onboardingTitle")}</h2>
        <p className="mt-2 text-sm text-muted">{t("onboardingHint")}</p>
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-2 text-sm text-foreground">
          <Checkbox
            checked={settings.public_link_enabled}
            onCheckedChange={(checked) => setSettings((current) => ({ ...current, public_link_enabled: checked === true }))}
            aria-label={t("onboardingPublicLink")}
          />
          <span>
            <span className="font-medium">{t("onboardingPublicLink")}</span>
            <span className="mt-1 block text-muted">{t("onboardingPublicLinkHint")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <Checkbox
            checked={settings.invites_enabled}
            onCheckedChange={(checked) => setSettings((current) => ({ ...current, invites_enabled: checked === true }))}
            aria-label={t("onboardingInvites")}
          />
          <span>
            <span className="font-medium">{t("onboardingInvites")}</span>
            <span className="mt-1 block text-muted">{t("onboardingInvitesHint")}</span>
          </span>
        </label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="onboarding-equipment">{t("onboardingEquipment")}</Label>
        <p className="text-xs text-muted">{t("onboardingEquipmentHint")}</p>
        <textarea
          id="onboarding-equipment"
          className="min-h-24 w-full rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 py-2 text-sm text-[var(--field-foreground)]"
          value={settings.equipment_note}
          maxLength={1000}
          onChange={(event) => setSettings((current) => ({ ...current, equipment_note: event.target.value }))}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RequirementField
          id="onboarding-photo"
          label={t("onboardingPhoto")}
          value={settings.photo_requirement}
          onChange={(photo_requirement) => setSettings((current) => ({ ...current, photo_requirement }))}
          requirementLabel={requirementLabel}
        />
        <RequirementField
          id="onboarding-medico"
          label={t("onboardingMedico")}
          value={settings.medico_requirement}
          onChange={(medico_requirement) => setSettings((current) => ({ ...current, medico_requirement }))}
          requirementLabel={requirementLabel}
        />
      </div>

      <Button type="button" onClick={() => void saveSettings()} disabled={saving}>
        {t("onboardingSave")}
      </Button>

      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="text-base font-semibold text-foreground">{t("onboardingRulesTitle")}</h3>
        <p className="text-sm text-muted">{t("onboardingRulesHint")}</p>
        {settings.rules.length === 0 ? <p className="text-sm text-muted">{t("onboardingRulesEmpty")}</p> : null}
        <ul className="space-y-2">
          {settings.rules.map((row) => (
            <li key={row.id} className="rounded-[var(--radius-form)] border border-border bg-surface px-3 py-2 text-sm text-foreground">
              <p className="font-medium">
                {t("onboardingRulesVersion", { version: row.version })}
                {row.is_current ? ` · ${t("onboardingRulesCurrent")}` : ""}
              </p>
              <p className="text-muted">{formatDisplayDate(row.effective_on)}</p>
              <p className="break-all text-xs text-muted">{t("onboardingRulesHash", { hash: row.sha256 })}</p>
              {row.kind === "url" ? (
                <a className="text-sm text-link" href={row.url} target="_blank" rel="noreferrer">
                  {row.url}
                </a>
              ) : (
                <button type="button" className="text-sm text-link" onClick={() => void openClubRulesFile(clubId, row.id).catch((error: unknown) => onError(error instanceof Error ? error.message : t("onboardingLoadError")))}>
                  {row.filename}
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="onboarding-rules-date" required>{t("onboardingRulesDate")}</Label>
            <Input id="onboarding-rules-date" type="date" value={effectiveOn} onChange={(event) => setEffectiveOn(event.target.value)} />
            {effectiveOn ? <p className="text-xs text-muted">{formatDisplayDate(effectiveOn)}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="onboarding-rules-file">{t("onboardingRulesFile")}</Label>
            <Input
              id="onboarding-rules-file"
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain"
              onChange={(event) => setRulesFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="onboarding-rules-url">{t("onboardingRulesLink")}</Label>
            <Input id="onboarding-rules-url" value={rulesUrl} onChange={(event) => setRulesUrl(event.target.value)} />
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => void addVersion()} disabled={saving}>
          {t("onboardingRulesAdd")}
        </Button>
      </div>
    </section>
  );
}

function RequirementField({
  id,
  label,
  value,
  onChange,
  requirementLabel,
}: {
  id: string;
  label: string;
  value: OnboardingRequirement;
  onChange: (value: OnboardingRequirement) => void;
  requirementLabel: (value: OnboardingRequirement) => string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="h-[var(--control-height)] w-full rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 text-sm text-[var(--field-foreground)]"
        value={value}
        onChange={(event) => onChange(event.target.value as OnboardingRequirement)}
      >
        {REQUIREMENTS.map((choice) => (
          <option key={choice} value={choice}>
            {requirementLabel(choice)}
          </option>
        ))}
      </select>
    </div>
  );
}
