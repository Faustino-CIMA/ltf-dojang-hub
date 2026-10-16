"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { SidePanel } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopoverSelect } from "@/components/ui/popover-select";
import { todayIso } from "@/lib/committee-terms";

import type { CommitteeMandateRow } from "./committee-history-table";

export type CommitteePanelState =
  | { mode: "edit"; mandate: CommitteeMandateRow }
  | { mode: "replace"; mandate: CommitteeMandateRow; memberId?: number }
  | { mode: "end"; mandate: CommitteeMandateRow }
  | { mode: "delete"; mandate: CommitteeMandateRow }
  | { mode: "past"; committeeId: number };

const FIELD_CLASS =
  "min-h-24 w-full rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 py-2 text-sm text-[var(--field-foreground)] shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function CommitteeTermPanel({
  panel,
  members,
  roles,
  busy,
  onClose,
  onEdit,
  onReplace,
  onEnd,
  onCreatePast,
  onDelete,
}: {
  panel: CommitteePanelState | null;
  members: Array<{ id: number; name: string }>;
  roles: Array<{ value: string; label: string; disabled?: boolean }>;
  busy: boolean;
  onClose: () => void;
  onEdit: (mandate: CommitteeMandateRow, values: TermFormValues) => void;
  onReplace: (mandate: CommitteeMandateRow, values: { member: number; started_on: string }) => void;
  onEnd: (mandate: CommitteeMandateRow, endedOn: string) => void;
  onCreatePast: (values: TermFormValues) => void;
  onDelete: (mandate: CommitteeMandateRow) => void;
}) {
  const t = useTranslations("ClubMgmt");
  const [role, setRole] = useState("president");
  const [title, setTitle] = useState("");
  const [memberId, setMemberId] = useState("");
  const [startedOn, setStartedOn] = useState("");
  const [endedOn, setEndedOn] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!panel) {
      return;
    }
    setFormError(null);
    if (panel.mode === "past") {
      setRole("president");
      setTitle("");
      setMemberId(members[0] ? String(members[0].id) : "");
      setStartedOn("");
      setEndedOn("");
      setNotes("");
      return;
    }
    const mandate = panel.mandate;
    setRole(mandate.role);
    setTitle(mandate.title || "");
    setMemberId(
      panel.mode === "replace"
        ? String(panel.memberId ?? mandate.member ?? members[0]?.id ?? "")
        : String(mandate.member ?? ""),
    );
    setStartedOn(panel.mode === "replace" ? todayIso() : mandate.started_on);
    setEndedOn(panel.mode === "end" ? todayIso() : mandate.ended_on ?? "");
    setNotes(mandate.notes ?? "");
  }, [members, panel]);

  if (!panel) {
    return null;
  }

  const titleByMode = {
    edit: t("committeeEditTitle"),
    replace: t("committeeReplaceTitle"),
    end: t("committeeEndTitle"),
    delete: t("committeeDeletePanelTitle"),
    past: t("committeePastTitle"),
  }[panel.mode];
  const hintByMode = {
    edit: t("committeeEditHint"),
    replace: t("committeeReplaceHint"),
    end: t("committeeEndHint"),
    delete: t("committeeDeleteDescription"),
    past: t("committeePastHint"),
  }[panel.mode];

  const memberOptions = members.map((member) => ({ value: String(member.id), label: member.name, searchText: member.name }));
  const showRole = panel.mode === "edit" || panel.mode === "past";
  const showMember = panel.mode === "edit" || panel.mode === "replace" || panel.mode === "past";
  const showStart = panel.mode === "edit" || panel.mode === "replace" || panel.mode === "past";
  const showEnd = panel.mode === "edit" || panel.mode === "end" || panel.mode === "past";
  const showNotes = panel.mode === "edit" || panel.mode === "past";

  const submit = () => {
    if (panel.mode === "delete") {
      onDelete(panel.mandate);
      return;
    }
    if ((showMember && panel.mode !== "edit" && !memberId) || (panel.mode === "past" && !memberId)) {
      setFormError(t("committeeNeedMember"));
      return;
    }
    if (showStart && !startedOn) {
      setFormError(t("committeeNeedStart"));
      return;
    }
    if ((panel.mode === "end" || panel.mode === "past") && !endedOn) {
      setFormError(t("committeeNeedEnd"));
      return;
    }
    if (endedOn && startedOn && endedOn < startedOn) {
      setFormError(t("committeeEndBeforeStart"));
      return;
    }
    if (showRole && role === "other" && !title.trim()) {
      setFormError(t("committeeNeedTitle"));
      return;
    }
    const values: TermFormValues = {
      role,
      title: role === "other" ? title.trim() : "",
      member: memberId ? Number(memberId) : null,
      started_on: startedOn,
      ended_on: endedOn || null,
      notes: notes.trim(),
    };
    if (panel.mode === "replace") {
      onReplace(panel.mandate, { member: Number(memberId), started_on: startedOn });
      return;
    }
    if (panel.mode === "end") {
      onEnd(panel.mandate, endedOn);
      return;
    }
    if (panel.mode === "past") {
      onCreatePast(values);
      return;
    }
    onEdit(panel.mandate, values);
  };

  return (
    <SidePanel
      open
      title={titleByMode}
      description={hintByMode}
      closeLabel={t("cancel")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant={panel.mode === "delete" ? "destructive" : "primary"}
            onClick={submit}
            disabled={busy}
          >
            {panel.mode === "delete"
              ? t("committeeDeleteTerm")
              : panel.mode === "replace"
                ? t("committeeReplaceTerm")
                : panel.mode === "end"
                  ? t("committeeEndTerm")
                  : t("committeeSaveTerm")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        {showRole ? (
          <div className="space-y-2">
            <Label>{t("committeeColumnRole")}</Label>
            <PopoverSelect
              ariaLabel={t("committeeColumnRole")}
              value={role}
              onValueChange={setRole}
              options={roles}
            />
          </div>
        ) : null}
        {showRole && role === "other" ? (
          <div className="space-y-2">
            <Label htmlFor="committee-term-title">{t("titleOptional")}</Label>
            <Input id="committee-term-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
        ) : null}
        {showMember ? (
          <div className="space-y-2">
            <Label>{panel.mode === "replace" ? t("committeeNewMember") : t("committeeColumnPerson")}</Label>
            <PopoverSelect
              ariaLabel={t("committeeColumnPerson")}
              value={memberId}
              onValueChange={setMemberId}
              options={memberOptions}
              searchable
              searchPlaceholder={t("committeeSearchMembers")}
              emptyMessage={t("committeeNoAdults")}
              placeholder={t("committeeNeedMember")}
            />
          </div>
        ) : null}
        {showStart ? (
          <div className="space-y-2">
            <Label htmlFor="committee-term-start">{t("committeeColumnStart")}</Label>
            <Input
              id="committee-term-start"
              type="date"
              value={startedOn}
              onChange={(event) => setStartedOn(event.target.value)}
            />
          </div>
        ) : null}
        {showEnd ? (
          <div className="space-y-2">
            <Label htmlFor="committee-term-end">{t("committeeEndDate")}</Label>
            <Input id="committee-term-end" type="date" value={endedOn} onChange={(event) => setEndedOn(event.target.value)} />
          </div>
        ) : null}
        {showNotes ? (
          <div className="space-y-2">
            <Label htmlFor="committee-term-notes">{t("committeeNotes")}</Label>
            <textarea
              id="committee-term-notes"
              className={FIELD_CLASS}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        ) : null}
      </div>
    </SidePanel>
  );
}

export type TermFormValues = {
  role: string;
  title: string;
  member: number | null;
  started_on: string;
  ended_on: string | null;
  notes: string;
};
