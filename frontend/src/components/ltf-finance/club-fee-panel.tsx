"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidePanel } from "@/components/ui/side-panel";
import type { ClubFeeCadence, ClubFeeType } from "@/lib/ltf-finance-api";

export type ClubFeeDraft = {
  name: string;
  description: string;
  cadence: ClubFeeCadence;
  amount: string;
  isActive: boolean;
};

const EMPTY_DRAFT: ClubFeeDraft = {
  name: "",
  description: "",
  cadence: "one_off",
  amount: "",
  isActive: true,
};

export function draftFromFee(fee: ClubFeeType): ClubFeeDraft {
  return {
    name: fee.name,
    description: fee.description ?? "",
    cadence: fee.cadence,
    amount: fee.current_amount ?? "",
    isActive: fee.is_active,
  };
}

function ClubFeeFormBody({
  fee,
  saving,
  onClose,
  onSubmit,
}: {
  fee: ClubFeeType | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (draft: ClubFeeDraft) => Promise<void>;
}) {
  const t = useTranslations("LtfFinance");
  const common = useTranslations("Common");
  const [draft, setDraft] = useState<ClubFeeDraft>(() => (fee ? draftFromFee(fee) : EMPTY_DRAFT));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const save = async () => {
    if (!draft.name.trim()) {
      setErrorMessage(t("clubFeeNameRequiredError"));
      return;
    }
    setErrorMessage(null);
    await onSubmit({ ...draft, name: draft.name.trim(), description: draft.description.trim() });
  };

  return (
    <SidePanel
      open
      title={fee ? t("clubFeeEditTitle") : t("clubFeeCreateAction")}
      description={fee ? t("clubFeeEditSubtitle") : t("clubFeesSubtitle")}
      closeLabel={common("modalClose")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {common("deleteCancelButton")}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? t("savingAction") : fee ? t("clubFeeSaveAction") : t("clubFeeCreateAction")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
        <div className="space-y-2">
          <Label htmlFor="club-fee-name" required>
            {t("clubFeeNameLabel")}
          </Label>
          <Input
            id="club-fee-name"
            value={draft.name}
            onChange={(event) => setDraft((previous) => ({ ...previous, name: event.target.value }))}
            placeholder={t("clubFeeNameLabel")}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("clubFeeCadenceLabel")}</Label>
          <Select
            value={draft.cadence}
            onValueChange={(value) => setDraft((previous) => ({ ...previous, cadence: value as ClubFeeCadence }))}
          >
            <SelectTrigger aria-label={t("clubFeeCadenceLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one_off">{t("clubFeeCadenceOneOff")}</SelectItem>
              <SelectItem value="annual">{t("clubFeeCadenceAnnual")}</SelectItem>
              <SelectItem value="per_member">{t("clubFeeCadencePerMember")}</SelectItem>
              <SelectItem value="per_event">{t("clubFeeCadencePerEvent")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="club-fee-amount">{t("clubFeeAmountLabel")}</Label>
          <Input
            id="club-fee-amount"
            value={draft.amount}
            onChange={(event) => setDraft((previous) => ({ ...previous, amount: event.target.value }))}
            placeholder="0.00"
            inputMode="decimal"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="club-fee-description">{t("clubFeeDescriptionLabel")}</Label>
          <Input
            id="club-fee-description"
            value={draft.description}
            onChange={(event) => setDraft((previous) => ({ ...previous, description: event.target.value }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="club-fee-active"
            checked={draft.isActive}
            onCheckedChange={(value) => setDraft((previous) => ({ ...previous, isActive: value === true }))}
          />
          <Label htmlFor="club-fee-active">{t("clubFeeActiveLabel")}</Label>
        </div>
      </div>
    </SidePanel>
  );
}

export function ClubFeeFormPanel({
  open,
  fee,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  fee: ClubFeeType | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (draft: ClubFeeDraft) => Promise<void>;
}) {
  if (!open) {
    return null;
  }
  return <ClubFeeFormBody key={fee?.id ?? "new"} fee={fee} saving={saving} onClose={onClose} onSubmit={onSubmit} />;
}
