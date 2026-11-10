"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";

import {
  AccessBadges,
  ClubAdminAccessMenu,
  ClubAdminAccessPanel,
  accessIsReset,
  useClubAdminAccessCopy,
} from "@/components/club-admin/club-admin-access";
import { Button } from "@/components/ui/button";
import { DeleteConfirmModal } from "@/components/ui/delete-confirm-modal";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FloatingNotice } from "@/components/ui/list-page-chrome";
import { SidePanel } from "@/components/ui/side-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/api";
import { sendClubAdminAccessLink } from "@/lib/club-access-links";
import {
  type AddClubAdminResponse,
  type ClubAdminAssignmentAdmin,
  type ClubAdminAssignmentClub,
  type ClubAdminAssignmentMember,
  addClubAdmin,
  getClubAdminAssignmentBoard,
  removeClubAdmin,
  searchClubAdminAssignmentMembers,
} from "@/lib/club-admin-api";
import { formatFullName } from "@/lib/person-name";
import { cn } from "@/lib/utils";

function displayMemberName(member: ClubAdminAssignmentMember) {
  return formatFullName(member);
}

function displayAdminName(admin: ClubAdminAssignmentAdmin) {
  return formatFullName(admin) || admin.member_name || admin.username;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function ClubAdminsSection({ clubId, locale }: { clubId: number; locale: string }) {
  const t = useTranslations("ClubAdmin");
  const common = useTranslations("Common");
  const access = useClubAdminAccessCopy();
  const [role, setRole] = useState<string | null>(null);
  const [clubs, setClubs] = useState<ClubAdminAssignmentClub[]>([]);
  const [admins, setAdmins] = useState<ClubAdminAssignmentAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [inviteResetUrl, setInviteResetUrl] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [licensedOnly, setLicensedOnly] = useState(true);
  const [members, setMembers] = useState<ClubAdminAssignmentMember[]>([]);
  const [memberTotal, setMemberTotal] = useState(0);
  const [memberTruncated, setMemberTruncated] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addNote, setAddNote] = useState<string | null>(null);

  const [pendingMember, setPendingMember] = useState<ClubAdminAssignmentMember | null>(null);
  const [emailValue, setEmailValue] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<ClubAdminAssignmentAdmin | null>(null);
  const [accessAdmin, setAccessAdmin] = useState<ClubAdminAssignmentAdmin | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ role: string }>("/api/auth/me/")
      .then((me) => {
        if (!cancelled) setRole(me.role);
      })
      .catch(() => {
        if (!cancelled) setRole(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadBoard = useCallback(async () => {
    setErrorMessage(null);
    try {
      const response = await getClubAdminAssignmentBoard(clubId);
      setClubs(response.clubs);
      setAdmins(response.admins);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("overviewLoadError"));
    } finally {
      setIsLoading(false);
    }
  }, [clubId, t]);

  useEffect(() => {
    if (role !== "club_admin") return;
    setIsLoading(true);
    void loadBoard();
  }, [loadBoard, role]);

  useEffect(() => {
    if (role !== "club_admin") return;
    if (typeof window === "undefined" || window.location.hash !== "#club-admins") return;
    document.getElementById("club-admins")?.scrollIntoView({ block: "start" });
  }, [role]);

  const club = useMemo(() => clubs.find((item) => item.id === clubId) ?? clubs[0] ?? null, [clubId, clubs]);
  const currentAdmins = useMemo(
    () => admins.filter((admin) => admin.clubs.some((item) => item.id === (club?.id ?? clubId))),
    [admins, club?.id, clubId],
  );
  const atLimit = Boolean(club && club.admin_count >= club.max_admins);

  useEffect(() => {
    if (!addOpen || role !== "club_admin") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setMembersLoading(true);
      try {
        const result = await searchClubAdminAssignmentMembers({
          query: memberQuery,
          clubId,
          licensedOnly,
          limit: 25,
          signal: controller.signal,
        });
        setMembers(result.members);
        setMemberTotal(result.total);
        setMemberTruncated(result.truncated);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setErrorMessage(error instanceof Error ? error.message : t("overviewLoadError"));
      } finally {
        if (!controller.signal.aborted) setMembersLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [addOpen, clubId, licensedOnly, memberQuery, role, t]);

  const mapAssignError = (message: string) => {
    if (message === "email_required") return t("adminEmailRequired");
    if (message === "already_admin") return t("adminAlreadyError");
    if (message === "email_in_use") return t("adminEmailInUse");
    if (message === "home_club_only") return t("adminHomeClubOnly");
    if (message === "actor_home_club" || message === "Not allowed.") return t("actorHomeClubOnly");
    if (message === "email_change_forbidden") return access.emailChangeForbidden;
    if (message === "rate_limited") return access.rateLimited;
    if (message === "last_admin") return t("adminLastAdminError");
    if (message === "Club admin limit reached.") return t("adminLimitReached");
    return message;
  };

  const closeAdd = () => {
    setAddOpen(false);
    setAddNote(null);
    setMemberQuery("");
  };

  const completeAssign = async (member: ClubAdminAssignmentMember, email?: string) => {
    if (!club) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setInviteResetUrl(null);
    try {
      const response: AddClubAdminResponse = await addClubAdmin(club.id, member.id, email, locale);
      const name = displayMemberName(member);
      if (response.created_user && response.email_sent) {
        setSuccessMessage(t("adminAssignedCreated", { name, club: club.name, username: response.username }));
      } else if (response.created_user) {
        setSuccessMessage(t("adminAssignedCreatedNoEmail", { name, club: club.name, username: response.username }));
        setInviteResetUrl(response.reset_url || null);
      } else {
        setSuccessMessage(t("adminAssignedSuccess", { name, club: club.name }));
      }
      closeAdd();
      setShowEmailModal(false);
      setPendingMember(null);
      setEmailValue("");
      await loadBoard();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("overviewLoadError");
      if (message === "email_required") {
        setPendingMember(member);
        setEmailValue("");
        setEmailError(null);
        setShowEmailModal(true);
        closeAdd();
      } else {
        setErrorMessage(mapAssignError(message));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const beginAssign = (member: ClubAdminAssignmentMember) => {
    if (!club) return;
    setAddNote(null);
    if (member.club_id !== club.id) {
      setAddNote(t("adminHomeClubOnly"));
      return;
    }
    if (member.administered_club_ids.includes(club.id)) {
      setAddNote(t("adminAlreadyError"));
      return;
    }
    if (club.admin_count >= club.max_admins) {
      setAddNote(t("adminLimitReached"));
      return;
    }
    if (!member.user_id && !member.email) {
      setPendingMember(member);
      setEmailValue("");
      setEmailError(null);
      setShowEmailModal(true);
      closeAdd();
      return;
    }
    void completeAssign(member);
  };

  const confirmEmail = () => {
    if (!pendingMember) return;
    if (!isValidEmail(emailValue)) {
      setEmailError(t("adminEmailInvalid"));
      return;
    }
    void completeAssign(pendingMember, emailValue.trim());
  };

  const confirmRemove = async () => {
    if (!pendingRemove || !club) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await removeClubAdmin(club.id, pendingRemove.id);
      setSuccessMessage(t("adminRemovedSuccess", { name: displayAdminName(pendingRemove), club: club.name }));
      setPendingRemove(null);
      await loadBoard();
    } catch (error) {
      setErrorMessage(mapAssignError(error instanceof Error ? error.message : t("overviewLoadError")));
    } finally {
      setIsSaving(false);
    }
  };

  const issueAccess = async (
    admin: ClubAdminAssignmentAdmin,
    body: { delivery: "email" | "copy" | "both"; email?: string; locale: string },
  ) => {
    setIsSaving(true);
    setAccessError(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    setInviteResetUrl(null);
    try {
      const result = await sendClubAdminAccessLink(admin.id, body);
      if (result.link) {
        try {
          await navigator.clipboard.writeText(result.link);
        } catch {
          // The notice still shows the link when the clipboard is unavailable.
        }
        setInviteResetUrl(result.link);
      }
      const reset = accessIsReset(admin);
      if (body.delivery !== "copy" && result.email_sent) {
        setSuccessMessage(access.sent(reset, body.email || admin.email));
      } else if (body.delivery !== "copy" && !result.email_sent) {
        setSuccessMessage(access.emailFailed);
      } else {
        setSuccessMessage(access.copied(reset));
      }
      setAccessAdmin(null);
      await loadBoard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed";
      setAccessError(mapAssignError(message));
    } finally {
      setIsSaving(false);
    }
  };

  if (role !== "club_admin") return null;

  const noticeOpen = Boolean(errorMessage || successMessage);

  return (
    <section id="club-admins" className="rounded-[var(--radius-card)] border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-lg font-semibold text-foreground">{t("adminsTitle")}</h2>
          <InfoHint ariaLabel={common("aboutTitle", { title: t("adminsTitle") })}>{t("profileAdminsHint")}</InfoHint>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {club ? (
            <span className="text-xs text-muted">
              {t("adminsCountLabel", { count: club.admin_count, max: club.max_admins })}
            </span>
          ) : null}
          <Button type="button" size="sm" onClick={() => setAddOpen(true)} disabled={isLoading || atLimit || !club}>
            <UserPlus aria-hidden="true" />
            {t("profileAdminsAdd")}
          </Button>
        </div>
      </div>
      {atLimit ? <p className="mt-2 text-sm text-muted">{t("adminLimitReached")}</p> : null}

      <div className="mt-4 space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted">{t("loadingSubtitle")}</p>
        ) : currentAdmins.length === 0 ? (
          <p className="text-sm text-muted">{t("profileAdminsEmpty")}</p>
        ) : (
          currentAdmins.map((admin) => (
            <div
              key={admin.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border px-3 py-2"
            >
              <div>
                <p className="font-medium text-foreground">{displayAdminName(admin)}</p>
                <p className="text-xs text-muted">
                  {admin.username}
                  {admin.email ? ` · ${admin.email}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <AccessBadges admin={admin} labels={access.badges} />
                </div>
              </div>
              <ClubAdminAccessMenu
                admin={admin}
                menuLabel={access.menuLabel(displayAdminName(admin))}
                copy={access.copy}
                onOpen={() => {
                  setAccessError(null);
                  setAccessAdmin(admin);
                }}
                onCopy={() => void issueAccess(admin, { delivery: "copy", locale })}
                onRemove={() => setPendingRemove(admin)}
              />
            </div>
          ))
        )}
      </div>

      <SidePanel
        open={addOpen}
        title={t("adminsBoardTitle")}
        closeLabel={common("modalClose")}
        onClose={closeAdd}
        footer={
          <Button type="button" variant="outline" onClick={closeAdd}>
            {common("modalClose")}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-foreground">{t("adminsSearchMembers")}</p>
            <InfoHint size="compact" ariaLabel={common("aboutTitle", { title: t("adminsSearchMembers") })}>
              {t("profileAdminsSearchHint")}
            </InfoHint>
          </div>
          <Input
            value={memberQuery}
            onChange={(event) => setMemberQuery(event.target.value)}
            placeholder={t("adminsSearchMembers")}
            aria-label={t("adminsSearchMembers")}
          />
          <Switch
            id="profile-admins-licensed-only"
            checked={licensedOnly}
            onCheckedChange={setLicensedOnly}
            label={t("adminsLicensedOnly")}
          />
          {memberTruncated ? (
            <p className="text-xs text-muted">{t("transferNarrowHint", { shown: members.length, total: memberTotal })}</p>
          ) : null}
          {addNote ? <p className="text-sm text-muted">{addNote}</p> : null}
          <div className="space-y-2">
            {membersLoading && members.length === 0 ? (
              <p className="text-sm text-muted">{t("loadingSubtitle")}</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted">{t("adminsNoMembers")}</p>
            ) : (
              members.map((member) => {
                const already = member.administered_club_ids.includes(club?.id ?? clubId);
                return (
                  <button
                    key={member.id}
                    type="button"
                    disabled={isSaving || already}
                    onClick={() => beginAssign(member)}
                    className={cn(
                      "w-full rounded-[var(--radius-card)] border border-border bg-[var(--surface)] px-3 py-2 text-left transition-colors",
                      already ? "opacity-70" : "hover:border-primary/50",
                    )}
                  >
                    <p className="font-medium text-foreground">{displayMemberName(member)}</p>
                    <p className="mt-0.5 text-xs text-muted">{member.email || member.club_name}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {member.has_valid_license ? (
                        <StatusBadge label={t("transferLicensedBadge")} tone="success" />
                      ) : (
                        <StatusBadge label={t("transferNoLicenseBadge")} tone="neutral" />
                      )}
                      {already ? <StatusBadge label={t("adminsAlreadyBadge")} tone="success" /> : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </SidePanel>

      <SidePanel
        open={showEmailModal}
        title={t("adminEmailTitle")}
        closeLabel={common("modalClose")}
        onClose={() => {
          setShowEmailModal(false);
          setPendingMember(null);
        }}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowEmailModal(false);
                setPendingMember(null);
              }}
            >
              {common("deleteCancelButton")}
            </Button>
            <Button type="button" variant="primary" onClick={confirmEmail} disabled={isSaving}>
              {t("adminsAssignAction")}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="profile-club-admin-email" required>
              {t("emailLabel")}
            </Label>
            <InfoHint size="compact" ariaLabel={common("aboutTitle", { title: t("adminEmailTitle") })}>
              {t("adminEmailDescription")}
            </InfoHint>
          </div>
          <Input
            id="profile-club-admin-email"
            type="email"
            value={emailValue}
            onChange={(event) => setEmailValue(event.target.value)}
            placeholder="name@example.com"
            autoFocus
          />
          {emailError ? <p className="text-sm text-destructive">{emailError}</p> : null}
        </div>
      </SidePanel>

      <ClubAdminAccessPanel
        admin={accessAdmin}
        open={Boolean(accessAdmin)}
        allowEmailChange={false}
        locale={locale}
        busy={isSaving}
        error={accessError}
        closeLabel={common("modalClose")}
        copy={access.copy}
        onClose={() => {
          setAccessAdmin(null);
          setAccessError(null);
        }}
        onSubmit={(body) => {
          if (!accessAdmin) return;
          void issueAccess(accessAdmin, body);
        }}
      />

      <DeleteConfirmModal
        isOpen={Boolean(pendingRemove)}
        title={t("adminsRemoveTitle")}
        description={
          pendingRemove && club
            ? t("adminsRemoveDescription", { name: displayAdminName(pendingRemove), club: club.name })
            : ""
        }
        confirmLabel={t("adminsRemoveAction")}
        cancelLabel={common("deleteCancelButton")}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => void confirmRemove()}
      />

      <FloatingNotice
        open={noticeOpen}
        token={`${errorMessage ?? ""}::${successMessage ?? ""}::${inviteResetUrl ?? ""}`}
        tone={errorMessage ? "danger" : "success"}
        onDismiss={() => {
          setErrorMessage(null);
          setSuccessMessage(null);
          setInviteResetUrl(null);
        }}
        dismissLabel={common("modalClose")}
      >
        <p>{errorMessage || successMessage}</p>
        {inviteResetUrl ? (
          <p className="mt-2 break-all text-xs">
            {t("adminResetLink")}: {inviteResetUrl}
          </p>
        ) : null}
      </FloatingNotice>
    </section>
  );
}
