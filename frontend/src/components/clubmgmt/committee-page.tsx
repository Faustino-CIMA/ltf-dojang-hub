"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useClubSelection } from "@/components/club-selection-provider";
import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import { Button } from "@/components/ui/button";
import { DeleteConfirmModal } from "@/components/ui/delete-confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Member, getMembersList, getMembersPage } from "@/lib/club-admin-api";
import { createCommittee, createMandate, deleteMandate, listCommittees, updateMandate } from "@/lib/clubmgmt-api";
import { formatDisplayDate } from "@/lib/date-display";
import { cn } from "@/lib/utils";

const ROLES = [
  "president",
  "vice_president",
  "secretary_general",
  "treasurer",
  "secretary",
  "committee_member",
  "cashier_auditor",
  "other",
] as const;

type Role = (typeof ROLES)[number];

type Mandate = {
  id: number;
  role: string;
  title: string;
  member: number | null;
  member_name: string;
  person: number | null;
  person_name: string;
  started_on: string;
  ended_on: string | null;
};

const UNIQUE_ROLES = new Set<Role>([
  "president",
  "vice_president",
  "secretary_general",
  "treasurer",
  "secretary",
]);

function isCurrent(mandate: Mandate) {
  return !mandate.ended_on;
}

function roleIsTaken(mandates: Mandate[], role: Role, title = "") {
  if (!UNIQUE_ROLES.has(role) && role !== "other") {
    return false;
  }
  return mandates.some((mandate) => {
    if (!isCurrent(mandate) || mandate.role !== role) {
      return false;
    }
    if (role === "other") {
      return (mandate.title || "") === title.trim();
    }
    return true;
  });
}

function firstOpenRole(mandates: Mandate[]): Role {
  return (
    ROLES.find(
      (role) => role === "committee_member" || role === "cashier_auditor" || !roleIsTaken(mandates, role),
    ) ?? "committee_member"
  );
}

type CommitteeRow = {
  id: number;
  name: string;
  scope: string;
  mandates: Mandate[];
};

type Point = { x: number; y: number };

const CARD_BASE =
  "w-full rounded-[var(--radius-card)] border-2 bg-[var(--surface)] px-3 py-3 text-left transition-colors";
const CARD_SELECTED = "border-primary";
const CARD_IDLE = "border-border hover:border-primary/50";
const CARD_VACANT = "border-dashed border-primary/50 bg-[color-mix(in_oklab,var(--primary)_6%,white)]";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function displayMemberName(member: Member) {
  return `${member.first_name} ${member.last_name}`.trim();
}

function memberIsAdult(member: Member, asOf = new Date()): boolean {
  if (!member.date_of_birth) {
    return false;
  }
  const dob = new Date(`${member.date_of_birth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) {
    return false;
  }
  let years = asOf.getFullYear() - dob.getFullYear();
  const hadBirthday =
    asOf.getMonth() > dob.getMonth() ||
    (asOf.getMonth() === dob.getMonth() && asOf.getDate() >= dob.getDate());
  if (!hadBirthday) {
    years -= 1;
  }
  return years >= 18;
}

function relativePoint(box: DOMRect, container: HTMLElement, x: number, y: number): Point {
  const origin = container.getBoundingClientRect();
  return { x: x - origin.left, y: y - origin.top };
}

function cardCenter(element: HTMLElement, container: HTMLElement): Point {
  const box = element.getBoundingClientRect();
  return relativePoint(box, container, box.left + box.width / 2, box.top + box.height / 2);
}

function facingAnchor(element: HTMLElement, container: HTMLElement, toward: Point): Point {
  const box = element.getBoundingClientRect();
  const center = cardCenter(element, container);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return relativePoint(box, container, dx >= 0 ? box.right : box.left, box.top + box.height / 2);
  }
  return relativePoint(box, container, box.left + box.width / 2, dy >= 0 ? box.bottom : box.top);
}

function curvePath(from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const delta = Math.max(48, Math.abs(dx) / 2);
    const sign = dx >= 0 ? 1 : -1;
    return `M ${from.x} ${from.y} C ${from.x + sign * delta} ${from.y}, ${to.x - sign * delta} ${to.y}, ${to.x} ${to.y}`;
  }
  const delta = Math.max(48, Math.abs(dy) / 2);
  const sign = dy >= 0 ? 1 : -1;
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + sign * delta}, ${to.x} ${to.y - sign * delta}, ${to.x} ${to.y}`;
}

function isVacant(mandate: Mandate) {
  return !mandate.member && !mandate.person;
}

function holderName(mandate: Mandate) {
  return mandate.member_name || mandate.person_name;
}

type Props = { variant: "club" | "ltf"; embed?: boolean };

export function CommitteePage({ variant, embed = false }: Props) {
  const t = useTranslations("ClubMgmt");
  const common = useTranslations("Common");
  const { selectedClubId } = useClubSelection();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [committees, setCommittees] = useState<CommitteeRow[]>([]);
  const [name, setName] = useState(variant === "ltf" ? "LTF Committee" : "Club committee");
  const [drafts, setDrafts] = useState<Record<number, { role: Role; started_on: string; title: string }>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [mandateToDelete, setMandateToDelete] = useState<Mandate | null>(null);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const mandateRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const memberRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const [connectFrom, setConnectFrom] = useState<"mandate" | "member" | null>(null);
  const [selectedMandateId, setSelectedMandateId] = useState<number | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [hoverMandateId, setHoverMandateId] = useState<number | null>(null);
  const [hoverMemberId, setHoverMemberId] = useState<number | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [lineFrom, setLineFrom] = useState<Point | null>(null);
  const [lineTo, setLineTo] = useState<Point | null>(null);

  const load = useCallback(async () => {
    setErrorMessage(null);
    try {
      const rows = await listCommittees({
        scope: variant === "ltf" ? "federation" : "club",
        club: variant === "club" ? selectedClubId ?? undefined : undefined,
      });
      setCommittees(rows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    }
  }, [selectedClubId, t, variant]);

  const loadMembers = useCallback(async () => {
    try {
      if (variant === "ltf") {
        const page = await getMembersPage({
          q: memberQuery.trim() || undefined,
          isActive: true,
          page: 1,
          pageSize: 40,
        });
        setMembers(page.results);
        return;
      }
      const list = await getMembersList({
        q: memberQuery.trim() || undefined,
        clubId: selectedClubId ?? undefined,
        isActive: true,
      });
      setMembers(list);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    }
  }, [memberQuery, selectedClubId, t, variant]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const dropRubberBand = useCallback(() => {
    setConnectFrom(null);
    setSelectedMandateId(null);
    setSelectedMemberId(null);
    setHoverMandateId(null);
    setHoverMemberId(null);
    setPointer(null);
    setLineFrom(null);
    setLineTo(null);
  }, []);

  const updateLine = useCallback(() => {
    const container = boardRef.current;
    const originEl =
      connectFrom === "mandate" && selectedMandateId
        ? mandateRefs.current[selectedMandateId]
        : connectFrom === "member" && selectedMemberId
          ? memberRefs.current[selectedMemberId]
          : null;
    if (!container || !originEl) {
      setLineFrom(null);
      setLineTo(null);
      return;
    }
    const targetEl =
      connectFrom === "mandate" && hoverMemberId
        ? memberRefs.current[hoverMemberId]
        : connectFrom === "member" && hoverMandateId
          ? mandateRefs.current[hoverMandateId]
          : null;
    const toward = targetEl ? cardCenter(targetEl, container) : pointer;
    if (!toward) {
      setLineFrom(null);
      setLineTo(null);
      return;
    }
    const from = facingAnchor(originEl, container, toward);
    setLineFrom(from);
    setLineTo(targetEl ? facingAnchor(targetEl, container, from) : toward);
  }, [connectFrom, hoverMandateId, hoverMemberId, pointer, selectedMandateId, selectedMemberId]);

  useEffect(() => {
    updateLine();
  }, [updateLine, committees, members]);

  useEffect(() => {
    if (!connectFrom) {
      setPointer(null);
      setLineFrom(null);
      setLineTo(null);
      return;
    }
    const onMove = (event: PointerEvent) => {
      const container = boardRef.current;
      if (!container) {
        return;
      }
      const origin = container.getBoundingClientRect();
      setPointer({ x: event.clientX - origin.left, y: event.clientY - origin.top });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dropRubberBand();
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [connectFrom, dropRubberBand]);

  const allMandates = useMemo(() => committees.flatMap((row) => row.mandates), [committees]);
  const adultMembers = useMemo(() => members.filter((member) => memberIsAdult(member)), [members]);
  const selectedMandate = allMandates.find((row) => row.id === selectedMandateId) ?? null;
  const selectedMember = adultMembers.find((row) => row.id === selectedMemberId) ?? null;

  const assignMember = async (mandate: Mandate, member: Member) => {
    if (!memberIsAdult(member)) {
      setErrorMessage(t("committeeUnderage", { name: displayMemberName(member) }));
      dropRubberBand();
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateMandate(mandate.id, { member: member.id, person: null });
      setSuccessMessage(
        t("committeeAssigned", { name: displayMemberName(member), role: t(`role_${mandate.role}`) }),
      );
      dropRubberBand();
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleMandateClick = (mandate: Mandate) => {
    if (connectFrom === "member" && selectedMember) {
      void assignMember(mandate, selectedMember);
      return;
    }
    setConnectFrom("mandate");
    setSelectedMandateId(mandate.id);
    setSelectedMemberId(null);
  };

  const handleMemberClick = (member: Member) => {
    if (connectFrom === "mandate" && selectedMandate) {
      void assignMember(selectedMandate, member);
      return;
    }
    setConnectFrom("member");
    setSelectedMemberId(member.id);
    setSelectedMandateId(null);
  };

  const confirmDeleteMandate = async () => {
    if (!mandateToDelete) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await deleteMandate(mandateToDelete.id);
      if (selectedMandateId === mandateToDelete.id) {
        dropRubberBand();
      }
      setMandateToDelete(null);
      setSuccessMessage(t("committeeRemoved"));
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const draftFor = (committeeId: number, mandates: Mandate[]) =>
    drafts[committeeId] ?? { role: firstOpenRole(mandates), started_on: todayIso(), title: "" };

  const body = (
    <div className="space-y-6">
      <ActionNotices
        error={errorMessage}
        success={successMessage}
        onDismiss={() => {
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
      />

      {committees.length === 0 ? (
        <FormPanel>
          <EmptyState title={t("committeeEmptyTitle")} description={t("committeeEmptySubtitle")} />
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1 space-y-2">
              <Label htmlFor="committee-name">{t("clubCommitteeTitle")}</Label>
              <Input id="committee-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <Button
              type="button"
              variant="primary"
              onClick={async () => {
                if (variant === "club" && selectedClubId == null) {
                  return;
                }
                try {
                  await createCommittee({
                    name: name.trim() || (variant === "ltf" ? "LTF Committee" : "Club committee"),
                    scope: variant === "ltf" ? "federation" : "club",
                    club: variant === "club" ? selectedClubId : null,
                  });
                  await load();
                  setSuccessMessage(t("saved"));
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                }
              }}
            >
              {t("createCommittee")}
            </Button>
          </div>
        </FormPanel>
      ) : null}

      {committees.map((committee) => {
        const draft = draftFor(committee.id, committee.mandates);
        const vacantCount = committee.mandates.filter(isVacant).length;
        const filledCount = committee.mandates.length - vacantCount;
        const draftTaken = roleIsTaken(committee.mandates, draft.role, draft.title);
        return (
          <FormPanel key={committee.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-section text-foreground">{committee.name}</h2>
                <p className="mt-1 text-sm text-muted">{t("mandateHint")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge label={t("committeeFilledCount", { count: filledCount })} tone="success" />
                <StatusBadge
                  label={t("committeeVacantCount", { count: vacantCount })}
                  tone={vacantCount ? "warning" : "neutral"}
                />
              </div>
            </div>

            <div className="mt-5 grid gap-3 rounded-[var(--radius-card)] border border-border bg-secondary/50 p-4 md:grid-cols-4">
              <div className="space-y-2 md:col-span-2">
                <Label>{t("committeeOffices")}</Label>
                <Select
                  value={draft.role}
                  onValueChange={(value) =>
                    setDrafts((current) => ({
                      ...current,
                      [committee.id]: { ...draft, role: value as Role },
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => {
                      const taken = UNIQUE_ROLES.has(role) && roleIsTaken(committee.mandates, role);
                      return (
                        <SelectItem key={role} value={role} disabled={taken}>
                          {taken ? `${t(`role_${role}`)} (${t("current")})` : t(`role_${role}`)}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {draftTaken && UNIQUE_ROLES.has(draft.role) ? (
                  <p className="text-xs text-muted">{t("committeeRoleTaken", { role: t(`role_${draft.role}`) })}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`mandate-start-${committee.id}`}>{t("committeeStart")}</Label>
                <Input
                  id={`mandate-start-${committee.id}`}
                  type="date"
                  value={draft.started_on}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [committee.id]: { ...draft, started_on: event.target.value },
                    }))
                  }
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="primary"
                  disabled={isSaving || draftTaken}
                  onClick={async () => {
                    if (!draft.started_on) {
                      setErrorMessage(t("committeeNeedStart"));
                      return;
                    }
                    if (draft.role === "other" && !draft.title.trim()) {
                      setErrorMessage(t("committeeNeedTitle"));
                      return;
                    }
                    if (roleIsTaken(committee.mandates, draft.role, draft.title)) {
                      setErrorMessage(t("committeeRoleTaken", { role: t(`role_${draft.role}`) }));
                      return;
                    }
                    setIsSaving(true);
                    try {
                      const created = await createMandate({
                        committee: committee.id,
                        role: draft.role,
                        started_on: draft.started_on,
                        title: draft.role === "other" ? draft.title.trim() : "",
                      });
                      const nextMandates = [
                        ...committee.mandates,
                        {
                          id: created.id,
                          role: draft.role,
                          title: draft.role === "other" ? draft.title.trim() : "",
                          member: null,
                          member_name: "",
                          person: null,
                          person_name: "",
                          started_on: draft.started_on,
                          ended_on: null,
                        },
                      ];
                      setDrafts((current) => ({
                        ...current,
                        [committee.id]: { role: firstOpenRole(nextMandates), started_on: todayIso(), title: "" },
                      }));
                      await load();
                      setConnectFrom("mandate");
                      setSelectedMandateId(created.id);
                      setSelectedMemberId(null);
                      setSuccessMessage(t("committeeConnectingMandate", { role: t(`role_${draft.role}`) }));
                    } catch (error) {
                      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                >
                  {t("addMandate")}
                </Button>
              </div>
              {draft.role === "other" ? (
                <div className="space-y-2 md:col-span-4">
                  <Label htmlFor={`mandate-title-${committee.id}`}>{t("titleOptional")}</Label>
                  <Input
                    id={`mandate-title-${committee.id}`}
                    value={draft.title}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [committee.id]: { ...draft, title: event.target.value },
                      }))
                    }
                    placeholder={t("titleOptional")}
                  />
                  <p className="text-xs text-muted">{t("committeeCustomTitleHint")}</p>
                </div>
              ) : null}
            </div>

            {connectFrom ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-form)] border border-primary/40 bg-[var(--accent-soft,color-mix(in_oklab,var(--primary)_10%,white))] px-3 py-2">
                <p className="text-sm text-foreground">
                  {connectFrom === "mandate" && selectedMandate
                    ? t("committeeConnectingMandate", { role: t(`role_${selectedMandate.role}`) })
                    : selectedMember
                      ? t("committeeConnectingMember", { name: displayMemberName(selectedMember) })
                      : t("committeePickMemberHint")}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={dropRubberBand}>
                  {t("committeeCancelConnect")}
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">{t("committeePickMemberHint")}</p>
            )}

            <div ref={boardRef} className="relative mt-4 grid gap-4 lg:grid-cols-2">
              {lineFrom && lineTo ? (
                <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible">
                  <path
                    d={curvePath(lineFrom, lineTo)}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <circle cx={lineFrom.x} cy={lineFrom.y} r="4" fill="var(--primary)" />
                  <circle cx={lineTo.x} cy={lineTo.y} r="4" fill="var(--primary)" />
                </svg>
              ) : null}

              <div className="flex min-w-0 flex-col rounded-[var(--radius-card)] border border-border bg-[var(--surface-secondary,var(--secondary))] p-3">
                <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted">
                  {t("committeeOffices")}
                </p>
                {committee.mandates.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted">{t("committeeEmptySubtitle")}</p>
                ) : (
                  <div className="space-y-2">
                    {committee.mandates.map((mandate) => {
                      const vacant = isVacant(mandate);
                      const selected = selectedMandateId === mandate.id;
                      return (
                        <div
                          key={mandate.id}
                          ref={(node) => {
                            mandateRefs.current[mandate.id] = node;
                          }}
                          role="button"
                          tabIndex={0}
                          onMouseEnter={() => connectFrom === "member" && setHoverMandateId(mandate.id)}
                          onMouseLeave={() =>
                            setHoverMandateId((current) => (current === mandate.id ? null : current))
                          }
                          onClick={() => handleMandateClick(mandate)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleMandateClick(mandate);
                            }
                          }}
                          className={cn(
                            CARD_BASE,
                            "cursor-pointer",
                            selected || hoverMandateId === mandate.id ? CARD_SELECTED : vacant ? CARD_VACANT : CARD_IDLE,
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-foreground">{t(`role_${mandate.role}`)}</p>
                              {mandate.title ? (
                                <p className="mt-0.5 text-xs text-muted">{mandate.title}</p>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge
                                label={vacant ? t("committeeVacant") : t("current")}
                                tone={vacant ? "warning" : "success"}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                disabled={isSaving}
                                aria-label={t("committeeRemoveTitle", { role: t(`role_${mandate.role}`) })}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setMandateToDelete(mandate);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-foreground">
                            {vacant ? t("committeeVacant") : holderName(mandate)}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {formatDisplayDate(mandate.started_on)}
                            {mandate.ended_on
                              ? ` → ${formatDisplayDate(mandate.ended_on)}`
                              : ` → ${t("current")}`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-col rounded-[var(--radius-card)] border border-border bg-[var(--surface-secondary,var(--secondary))] p-3">
                <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted">
                  {t("committeeMembers")}
                </p>
                <Input
                  value={memberQuery}
                  onChange={(event) => setMemberQuery(event.target.value)}
                  placeholder={t("committeeSearchMembers")}
                  aria-label={t("committeeSearchMembers")}
                />
                <p className="mt-2 px-1 text-xs text-muted">{t("committeeAdultsOnly")}</p>
                {adultMembers.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted">
                    {members.length === 0 ? t("committeeNoMembers") : t("committeeNoAdults")}
                  </p>
                ) : (
                  <div className="mt-2 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                    {adultMembers.map((member) => {
                      const selected = selectedMemberId === member.id;
                      return (
                        <button
                          key={member.id}
                          type="button"
                          ref={(node) => {
                            memberRefs.current[member.id] = node;
                          }}
                          disabled={isSaving}
                          onMouseEnter={() => connectFrom === "mandate" && setHoverMemberId(member.id)}
                          onMouseLeave={() =>
                            setHoverMemberId((current) => (current === member.id ? null : current))
                          }
                          onClick={() => handleMemberClick(member)}
                          className={cn(CARD_BASE, selected || hoverMemberId === member.id ? CARD_SELECTED : CARD_IDLE)}
                        >
                          <p className="font-medium text-foreground">{displayMemberName(member)}</p>
                          {member.ltf_licenseid ? (
                            <p className="mt-0.5 text-xs text-muted">{member.ltf_licenseid}</p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </FormPanel>
        );
      })}

      <DeleteConfirmModal
        isOpen={mandateToDelete !== null}
        title={t("committeeRemoveTitle", {
          role: mandateToDelete ? t(`role_${mandateToDelete.role}`) : "",
        })}
        description={t("committeeRemoveDescription")}
        confirmLabel={t("committeeRemove")}
        cancelLabel={common("deleteCancelButton")}
        onConfirm={() => {
          void confirmDeleteMandate();
        }}
        onCancel={() => setMandateToDelete(null)}
      />
    </div>
  );

  if (embed) {
    return body;
  }
  if (variant === "ltf") {
    return (
      <LtfAdminLayout title={t("ltfCommitteeTitle")} subtitle={t("committeeSubtitle")}>
        {body}
      </LtfAdminLayout>
    );
  }
  return (
    <ClubAdminLayout title={t("clubCommitteeTitle")} subtitle={t("committeeSubtitle")}>
      {body}
    </ClubAdminLayout>
  );
}
