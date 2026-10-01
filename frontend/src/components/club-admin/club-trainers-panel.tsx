"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/club-admin/empty-state";
import { cn } from "@/lib/utils";
import {
  addClubTrainer,
  getClubTrainers,
  getMembersList,
  removeClubTrainer,
  setClubTrainerQualite,
  type ClubTrainer,
  type Member,
} from "@/lib/club-admin-api";

type Point = { x: number; y: number };

type ClubTrainersPanelProps = {
  clubId: number;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

const CARD_BASE =
  "w-full rounded-[var(--radius-card)] border-2 bg-[var(--surface)] px-3 py-3 text-left transition-colors";

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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isAdultMember(dateOfBirth: string | null) {
  if (!dateOfBirth) return false;
  const born = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(born.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const monthDelta = today.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < born.getDate())) age -= 1;
  return age >= 18;
}

export function ClubTrainersPanel({ clubId, onError, onSuccess }: ClubTrainersPanelProps) {
  const t = useTranslations("ClubAdmin");
  const boardRef = useRef<HTMLDivElement | null>(null);
  const memberCardRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const targetRef = useRef<HTMLDivElement | null>(null);
  const [trainers, setTrainers] = useState<ClubTrainer[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [hoverTarget, setHoverTarget] = useState(false);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [lineFrom, setLineFrom] = useState<Point | null>(null);
  const [lineTo, setLineTo] = useState<Point | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pendingMember, setPendingMember] = useState<Member | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [trainerRows, memberRows] = await Promise.all([
        getClubTrainers(clubId),
        getMembersList({ clubId, isActive: true }),
      ]);
      setTrainers(trainerRows.trainers);
      setMembers(
        memberRows.filter((member) => member.club === clubId && member.is_active && isAdultMember(member.date_of_birth)),
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : t("trainersLoadError"));
    } finally {
      setIsLoading(false);
    }
  }, [clubId, onError, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const trainerMemberIds = useMemo(
    () => new Set(trainers.map((row) => row.member_id).filter((id): id is number => id != null)),
    [trainers],
  );

  const visibleMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = members
      .filter((member) => member.is_active && isAdultMember(member.date_of_birth))
      .filter((member) => !trainerMemberIds.has(member.id))
      .filter((member) => {
        if (!q) return true;
        return `${member.first_name} ${member.last_name} ${member.email}`.toLowerCase().includes(q);
      })
      .slice(0, 16);
    if (selectedMember && !rows.some((member) => member.id === selectedMember.id)) {
      return [selectedMember, ...rows];
    }
    return rows;
  }, [members, query, selectedMember, trainerMemberIds]);

  const dropRubberBand = () => {
    setSelectedMember(null);
    setHoverTarget(false);
    setPointer(null);
    setLineFrom(null);
    setLineTo(null);
  };

  const updateLine = useCallback(() => {
    const container = boardRef.current;
    const originEl = selectedMember ? memberCardRefs.current[selectedMember.id] : null;
    if (!container || !originEl) {
      setLineFrom(null);
      setLineTo(null);
      return;
    }
    const targetEl = hoverTarget ? targetRef.current : null;
    const toward = targetEl ? cardCenter(targetEl, container) : pointer;
    if (!toward) {
      setLineFrom(null);
      setLineTo(null);
      return;
    }
    const from = facingAnchor(originEl, container, toward);
    setLineFrom(from);
    setLineTo(targetEl ? facingAnchor(targetEl, container, from) : toward);
  }, [hoverTarget, pointer, selectedMember]);

  useEffect(() => {
    updateLine();
  }, [updateLine, visibleMembers.length, trainers.length]);

  useEffect(() => {
    if (!selectedMember) return;
    const onMove = (event: PointerEvent) => {
      const container = boardRef.current;
      if (!container) return;
      const origin = container.getBoundingClientRect();
      setPointer({ x: event.clientX - origin.left, y: event.clientY - origin.top });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dropRubberBand();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [selectedMember]);

  const appoint = async (member: Member, memberEmail?: string) => {
    setIsSaving(true);
    try {
      const result = await addClubTrainer(clubId, member.id, memberEmail || member.email);
      setTrainers(result.trainers);
      dropRubberBand();
      setPendingMember(null);
      setEmail("");
      onSuccess(t("trainerAdded"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("trainersSaveError");
      if (message === "email_required" || message.includes("email_required")) {
        dropRubberBand();
        setPendingMember(member);
        setEmailError(null);
      } else if (message === "already_trainer" || message.includes("already_trainer")) {
        onError(t("trainerAlready"));
      } else {
        onError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const connectToTrainers = (member: Member) => {
    if (!member.user && !member.email) {
      dropRubberBand();
      setPendingMember(member);
      setEmail("");
      setEmailError(null);
      return;
    }
    void appoint(member);
  };

  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">{t("trainersTitle")}</h2>
      <p className="mt-2 text-sm text-muted">{t("trainersSubtitle")}</p>
      {isLoading ? (
        <div className="mt-6">
          <EmptyState title={t("loadingTitle")} description={t("trainersLoading")} loading />
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-sm text-muted">
            {selectedMember
              ? t("trainersConnectingHint", { name: `${selectedMember.first_name} ${selectedMember.last_name}`.trim() })
              : t("trainersIdleHint")}
          </p>
          {selectedMember ? (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={dropRubberBand}>
              {t("transferCancelConnect")}
            </Button>
          ) : null}
          <Input
            className="mt-4"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("trainerSearchPlaceholder")}
          />
          <div ref={boardRef} className="relative mt-4 grid gap-4 lg:grid-cols-2">
            {lineFrom && lineTo ? (
              <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible">
                <path d={curvePath(lineFrom, lineTo)} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx={lineFrom.x} cy={lineFrom.y} r="4" fill="var(--primary)" />
                <circle cx={lineTo.x} cy={lineTo.y} r="4" fill="var(--primary)" />
              </svg>
            ) : null}
            <div className="flex min-w-0 flex-col rounded-[var(--radius-card)] border border-border bg-[var(--surface-secondary)] p-3">
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("trainersMembersColumn")}</p>
              <div className="space-y-2">
                {visibleMembers.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted">{t("trainersNoMembers")}</p>
                ) : (
                  visibleMembers.map((member) => {
                    const selected = member.id === selectedMember?.id;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        ref={(node) => {
                          memberCardRefs.current[member.id] = node;
                        }}
                        onClick={() => setSelectedMember((current) => (current?.id === member.id ? null : member))}
                        className={cn(CARD_BASE, selected ? "border-primary" : "border-border hover:border-primary/50")}
                      >
                        <p className="font-medium text-foreground">
                          {member.first_name} {member.last_name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">{member.email || t("trainerNoEmail")}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <div
              ref={targetRef}
              onMouseEnter={() => selectedMember && setHoverTarget(true)}
              onMouseLeave={() => setHoverTarget(false)}
              onClick={() => {
                if (selectedMember) connectToTrainers(selectedMember);
              }}
              className={cn(
                "flex min-h-48 flex-col rounded-[var(--radius-card)] border-2 bg-[var(--surface-secondary)] p-3 text-left",
                hoverTarget || selectedMember ? "border-primary" : "border-border",
              )}
            >
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("trainersDropColumn")}</p>
              <p className="mb-2 px-1 text-xs text-muted">{t("trainerQualiteHint")}</p>
              {trainers.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted">{t("trainersEmpty")}</p>
              ) : (
                <ul className="space-y-2">
                  {trainers.map((trainer) => (
                    <li key={trainer.user_id} className="flex items-center justify-between gap-3 rounded-[var(--radius-form)] border border-border bg-[var(--surface)] px-3 py-2">
                      <label className="flex min-w-0 items-start gap-2" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={trainer.include_in_qualite !== false}
                          disabled={isSaving}
                          aria-label={t("trainerQualite")}
                          onChange={(event) => {
                            event.stopPropagation();
                            setIsSaving(true);
                            setClubTrainerQualite(clubId, trainer.user_id, event.target.checked)
                              .then((result) => {
                                setTrainers(result.trainers);
                                onSuccess(t("trainerQualiteSaved"));
                              })
                              .catch((error) => onError(error instanceof Error ? error.message : t("trainersSaveError")))
                              .finally(() => setIsSaving(false));
                          }}
                        />
                        <span>
                          <p className="text-sm font-medium text-foreground">
                            {trainer.first_name} {trainer.last_name}
                          </p>
                          <p className="text-xs text-muted">{t("trainerQualite")}</p>
                        </span>
                      </label>
                      <div className="text-right">
                        <p className="text-xs text-muted">{trainer.email || trainer.username}</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isSaving}
                        onClick={(event) => {
                          event.stopPropagation();
                          setIsSaving(true);
                          removeClubTrainer(clubId, trainer.user_id)
                            .then((result) => {
                              setTrainers(result.trainers);
                              onSuccess(t("trainerRemoved"));
                            })
                            .catch((error) => onError(error instanceof Error ? error.message : t("trainersSaveError")))
                            .finally(() => setIsSaving(false));
                        }}
                      >
                        {t("trainerRemove")}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      <Modal
        title={t("trainerEmailRequired")}
        description={pendingMember ? `${pendingMember.first_name} ${pendingMember.last_name}` : undefined}
        isOpen={pendingMember != null}
        onClose={() => {
          setPendingMember(null);
          setEmail("");
          setEmailError(null);
        }}
      >
        <div className="space-y-3">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("trainerEmailPlaceholder")}
          />
          {emailError ? <p className="text-sm text-destructive">{emailError}</p> : null}
          <Button
            type="button"
            variant="primary"
            disabled={isSaving}
            onClick={() => {
              if (!pendingMember) return;
              if (!isValidEmail(email)) {
                setEmailError(t("trainerEmailInvalid"));
                return;
              }
              void appoint(pendingMember, email.trim());
            }}
          >
            {t("trainerAdd")}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
