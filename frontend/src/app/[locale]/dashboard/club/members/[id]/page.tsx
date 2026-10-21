"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
  Award,
  ClipboardList,
  History,
  IdCard,
  Landmark,
  Pencil,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { MemberFormPanel } from "@/components/club-admin/member-form-panel";
import { EmptyState } from "@/components/club-admin/empty-state";
import { MemberHistoryTimeline } from "@/components/history/member-history-timeline";
import { CurrentLicensesPanel } from "@/components/member/current-licenses-panel";
import { ProfilePhotoManager } from "@/components/profile-photo/profile-photo-manager";
import { Button } from "@/components/ui/button";
import {
  deleteMemberGrade,
  deleteMemberProfilePicture,
  downloadMemberProfilePicture,
  Member,
  MemberClubTransferHistory,
  MemberHistoryResponse,
  getMember,
  getMemberClubTransfers,
  getMemberHistory,
  promoteMemberGrade,
  updateMemberGrade,
  } from "@/lib/club-admin-api";
import { MemberClubMovementPanel } from "@/components/member/member-club-movement-panel";
import {
  FormPanel,
  PageNotice,
  ActionNotices
} from "@/components/ui/list-page-chrome";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { MemberClubRecordPanel } from "@/components/clubmgmt/member-club-record-panel";
import { MemberCommitteePanel } from "@/components/member/member-committee-panel";
import { MemberGearCard } from "@/components/club-admin/member-gear-card";
import { MemberTeamsCard } from "@/components/club-admin/member-teams-card";
import { MemberNationalTeamBadge } from "@/components/national-team/member-national-team-badge";
import { useClubSelection } from "@/components/club-selection-provider";
import { downloadClubStatement } from "@/lib/club-finance-api";
import { CLUB_MANAGEMENT_MODULE_ID, COMPETITION_MODULE_ID, getModuleStatus, isClubModuleAssigned } from "@/lib/modules-api";
import { apiRequest } from "@/lib/api";
import { formatDisplayDate } from "@/lib/date-display";
import { canonicalizeLicenseRole } from "@/lib/license-roles";

type AuthMeResponse = { role: string };

const MEMBER_DETAIL_TABS = [
  "overview",
  "club-record",
  "current-licenses",
  "license-history",
  "grades",
  "committee",
  "club-movements",
] as const;

type MemberDetailTab = (typeof MEMBER_DETAIL_TABS)[number];

function parseMemberDetailTab(value: string | null): MemberDetailTab {
  if (value && (MEMBER_DETAIL_TABS as readonly string[]).includes(value)) {
    return value as MemberDetailTab;
  }
  return "overview";
}

export default function ClubMemberDetailPage() {
  const t = useTranslations("ClubAdmin");
  const commonT = useTranslations("Common");
  const importT = useTranslations("Import");
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawLocale = params?.locale;
  const rawId = params?.id;
  const locale = typeof rawLocale === "string" ? rawLocale : "en";
  const memberId = typeof rawId === "string" ? Number(rawId) : Number(rawId?.[0]);
  const isEditing = searchParams.get("edit") === "1";
  const urlTab = parseMemberDetailTab(searchParams.get("tab"));
  const [activeTab, setActiveTabState] = useState<MemberDetailTab>(urlTab);
  const [member, setMember] = useState<Member | null>(null);
  const [history, setHistory] = useState<MemberHistoryResponse | null>(null);
  const [clubMoves, setClubMoves] = useState<MemberClubTransferHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const { selectedClubId } = useClubSelection();
  const [clubMgmtOn, setClubMgmtOn] = useState(false);
  const [competitionOn, setCompetitionOn] = useState(false);

  const roleLabelByValue = useMemo(
    () => ({
      Athlete: t("licenseRoleAthlete"),
      Coach: t("licenseRoleCoach"),
      Referee: t("licenseRoleReferee"),
      Official: t("licenseRoleOfficial"),
      Doctor: t("licenseRoleDoctor"),
      Physiotherapist: t("licenseRolePhysiotherapist"),
      Volunteer: t("licenseRoleVolunteer"),
      Staff: t("licenseRoleStaff"),
      Media: t("licenseRoleMedia"),
      Fan: t("licenseRoleFan"),
    }),
    [t]
  );

  const updateEditQuery = useCallback(
    (edit: boolean) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      if (edit) {
        nextParams.set("edit", "1");
      } else {
        nextParams.delete("edit");
      }
      const nextQuery = nextParams.toString();
      const currentQuery = searchParams.toString();
      if (nextQuery === currentQuery) {
        return;
      }
      router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    setActiveTabState(urlTab);
  }, [urlTab]);

  const setActiveTab = useCallback(
    (tab: MemberDetailTab) => {
      setActiveTabState(tab);
      const nextParams = new URLSearchParams(searchParams.toString());
      if (tab === "overview") {
        nextParams.delete("tab");
      } else {
        nextParams.set("tab", tab);
      }
      const nextQuery = nextParams.toString();
      const currentQuery = searchParams.toString();
      if (nextQuery === currentQuery) {
        return;
      }
      router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const loadMember = useCallback(async () => {
    if (!memberId) {
      setErrorMessage(t("memberNotFound"));
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [memberResponse, historyResponse, movementResponse] = await Promise.all([
        getMember(memberId),
        getMemberHistory(memberId),
        getMemberClubTransfers(memberId),
      ]);
      setMember(memberResponse);
      setHistory(historyResponse);
      setClubMoves(movementResponse);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load member.");
    } finally {
      setIsLoading(false);
    }
  }, [memberId, t]);

  const handleStatementDownload = useCallback(async () => {
    if (!member || selectedClubId == null) {
      return;
    }
    setErrorMessage(null);
    try {
      await downloadClubStatement({
        clubId: selectedClubId,
        year: new Date().getFullYear(),
        memberId: member.id,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("statementDownloadError"));
    }
  }, [member, selectedClubId, t]);

  const handlePhotoDownload = useCallback(async () => {
    if (!member) {
      return;
    }
    const photoBlob = await downloadMemberProfilePicture(member.id);
    const objectUrl = URL.createObjectURL(photoBlob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${member.first_name}-${member.last_name}-profile-picture.jpg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }, [member]);

  useEffect(() => {
    loadMember();
  }, [loadMember]);

  useEffect(() => {
    let cancelled = false;
    getModuleStatus()
      .then((status) => {
        if (!cancelled) {
          setClubMgmtOn(isClubModuleAssigned(status, CLUB_MANAGEMENT_MODULE_ID, selectedClubId));
          setCompetitionOn(isClubModuleAssigned(status, COMPETITION_MODULE_ID, selectedClubId));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClubMgmtOn(false);
          setCompetitionOn(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClubId]);

  useEffect(() => {
    let isMounted = true;
    const loadCurrentUserRole = async () => {
      try {
        const me = await apiRequest<AuthMeResponse>("/api/auth/me/");
        if (isMounted) {
          setCurrentRole(me.role);
        }
      } catch {
        if (isMounted) {
          setCurrentRole(null);
        }
      }
    };
    loadCurrentUserRole();
    return () => {
      isMounted = false;
    };
  }, []);

  const isCoach = currentRole === "coach";
  const canManageMemberFull = currentRole === "club_admin";
  const canEditMember = canManageMemberFull || isCoach;
  const canManageGrades = canEditMember;

  const onEdit = () => {
    if (!canEditMember) {
      return;
    }
    updateEditQuery(true);
  };

  const onCancelEdit = () => {
    updateEditQuery(false);
  };

  const licenseHistoryCount = useMemo(() => {
    const years = new Set((history?.license_history ?? []).map((entry) => entry.license_year));
    return years.size;
  }, [history]);
  const gradeHistoryCount = history?.grade_history.length ?? 0;
  const committeeCount = history?.committee_history?.length ?? 0;
  const showCommittee = currentRole !== "ltf_finance";
  const clubMovementCount = clubMoves?.completed_transfer_count ?? 0;

  const title = member
    ? t("memberDetailTitle", { name: `${member.first_name} ${member.last_name}` })
    : t("memberDetailTitleFallback");

  const historyTimelineShared = {
    licenseTitle: t("licenseHistoryTitle"),
    gradeTitle: t("gradeHistoryTitle"),
    emptyLabel: t("historyEmpty"),
    licenseYearLabel: t("historyLicenseYearColumn"),
    licenseTypeLabel: t("historyLicenseTypeColumn"),
    licenseStatusLabel: t("historyLicenseStatusColumn"),
    licenseIssuedLabel: t("historyLicenseIssuedColumn"),
    gradeDateLabel: t("historyGradeDateColumn"),
    gradeLabel: t("historyGradeColumn"),
    gradeIssuedByLabel: t("historyGradeIssuedByColumn"),
    addGradeAriaLabel: t("addGradeAction"),
    editGradeAriaLabel: t("editGradeAction"),
    deleteGradeAriaLabel: t("deleteGradeAction"),
    deleteGradeTitle: t("deleteGradeTitle"),
    deleteGradeDescription: t("deleteGradeDescription"),
    deleteConfirmLabel: commonT("deleteConfirmButton"),
    gradeFormTitle: t("promoteGradeTitle"),
    editGradeFormTitle: t("editGradeTitle"),
    promoteToGradeLabel: t("promoteToGradeLabel"),
    promoteDateLabel: t("promoteDateLabel"),
    issuedByLabel: t("gradeIssuedByLabel"),
    issuedByClubOption: t("gradeIssuedByClubOption"),
    issuedByLtfOption: t("gradeIssuedByLtfOption"),
    issuedByOtherOption: t("gradeIssuedByOtherOption"),
    issuedByOtherPlaceholder: t("gradeIssuedByOtherPlaceholder"),
    promoteSubmitLabel: t("promoteSubmitLabel"),
    cancelLabel: t("cancelEdit"),
    previousPageLabel: commonT("paginationPrevious"),
    nextPageLabel: commonT("paginationNext"),
    pageLabel: (current: number, total: number) => commonT("paginationPage", { current, total }),
    licenseHistory: history?.license_history ?? [],
    gradeHistory: history?.grade_history ?? [],
  };

  return (
    <ClubAdminLayout title={title} subtitle={t("memberDetailSubtitle")}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-[var(--control-height)] min-h-[var(--control-height)]" asChild>
            <Link href={`/${locale}/dashboard/club/members`}>{t("backToMembers")}</Link>
          </Button>
          {clubMgmtOn && member && selectedClubId != null ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-[var(--control-height)] min-h-[var(--control-height)]"
              onClick={() => void handleStatementDownload()}
            >
              {t("downloadStatementAction")}
            </Button>
          ) : null}
        </div>

        <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />

        {isLoading ? (
          <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
        ) : !member ? (
          <EmptyState title={t("noResultsTitle")} description={t("memberNotFound")} />
        ) : (
          <div className="space-y-3">
            {member.is_club_tourist ? (
              <PageNotice tone="warning">{t("clubTouristMemberHint")}</PageNotice>
            ) : null}

            <UnderlineTabs
              idPrefix="member-detail"
              ariaLabel={t("memberDetailTabsAriaLabel")}
              value={activeTab}
              onChange={setActiveTab}
              options={[
                { value: "overview", label: t("memberOverviewTab"), icon: User },
                ...(clubMgmtOn
                  ? [{ value: "club-record" as const, label: t("memberClubRecordTab"), icon: ClipboardList }]
                  : []),
                {
                  value: "current-licenses",
                  label: t("memberCurrentLicensesTab"),
                  icon: IdCard,
                },
                {
                  value: "license-history",
                  label: t("memberLicenseHistoryTab"),
                  icon: History,
                  count: licenseHistoryCount,
                },
                {
                  value: "grades",
                  label: t("memberGradesTab"),
                  icon: Award,
                  count: gradeHistoryCount,
                },
                ...(showCommittee
                  ? [
                      {
                        value: "committee" as const,
                        label: t("memberCommitteeTab"),
                        icon: Landmark,
                        count: committeeCount,
                      },
                    ]
                  : []),
                {
                  value: "club-movements",
                  label: t("memberClubMovementsTab"),
                  icon: ArrowLeftRight,
                  count: clubMovementCount,
                },
              ]}
            />

            <div
              role="tabpanel"
              id="member-detail-panel"
              aria-labelledby={`member-detail-${activeTab}`}
              className="space-y-3"
            >
            {activeTab === "club-record" && member ? (
              <MemberClubRecordPanel
                memberId={member.id}
                clubId={member.club}
                overviewEmail={member.email ?? ""}
              />
            ) : null}
            {activeTab === "overview" ? (
            <>
            <FormPanel>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="text-section text-foreground">{t("memberOverviewTab")}</h2>
                  <MemberNationalTeamBadge memberId={member.id} />
                </div>
                {canManageMemberFull ? (
                  <Button
                    variant="outline"
                    size="icon-lg"
                    className="h-[var(--control-height)] min-h-[var(--control-height)] w-[var(--control-height)] shrink-0"
                    aria-label={t("editAction")}
                    onClick={onEdit}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              <div className="mt-4">
                <ProfilePhotoManager
                  imageUrl={member.profile_picture_url}
                  thumbnailUrl={member.profile_picture_thumbnail_url}
                  labels={{
                    sectionTitle: t("photoSectionTitle"),
                    sectionSubtitle: t("photoSectionSubtitle"),
                    changeButton: t("photoChangeButton"),
                    removeButton: t("photoRemoveButton"),
                    downloadButton: t("photoDownloadButton"),
                    modalTitle: t("photoModalTitle"),
                    modalDescription: t("photoModalDescription"),
                    dragDropLabel: t("photoDragDropLabel"),
                    selectFileButton: t("photoSelectFileButton"),
                    cameraButton: t("photoCameraButton"),
                    cameraCaptureButton: t("photoCameraCaptureButton"),
                    cameraCancelButton: t("photoCameraCancelButton"),
                    cameraStarting: t("photoCameraStarting"),
                    cameraUnavailable: t("photoCameraUnavailable"),
                    cameraPermissionDenied: t("photoCameraPermissionDenied"),
                    cameraStartError: t("photoCameraStartError"),
                    zoomLabel: t("photoZoomLabel"),
                    backgroundColorLabel: t("photoBackgroundColorLabel"),
                    removeBackgroundButton: t("photoRemoveBackgroundButton"),
                    removeBackgroundBusy: t("photoRemoveBackgroundBusy"),
                    consentLabel: t("photoConsentLabel"),
                    saveButton: t("photoSaveButton"),
                    saveBusy: t("photoSaveBusy"),
                    cancelButton: t("photoCancelButton"),
                    previewTitle: t("photoPreviewTitle"),
                    currentPhotoAlt: t("photoCurrentAlt"),
                    emptyPhotoLabel: t("photoEmptyLabel"),
                    removeBackgroundUnsupported: t("photoUnsupportedError"),
                  }}
                  onDelete={
                    canManageMemberFull
                      ? async () => {
                          await deleteMemberProfilePicture(member.id);
                          await loadMember();
                        }
                      : undefined
                  }
                  onDownload={handlePhotoDownload}
                  onEdit={
                    canManageMemberFull
                      ? () => router.push(`/${locale}/dashboard/club/members/${member.id}/photo`)
                      : undefined
                  }
                />
              </div>
                <div className="mt-4 grid gap-3 text-sm text-foreground md:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("firstNameLabel")}</span>
                    <span className="font-medium">{member.first_name}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("lastNameLabel")}</span>
                    <span className="font-medium">{member.last_name}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("sexLabel")}</span>
                    <span className="font-medium">
                      {member.sex === "M" ? t("sexMale") : t("sexFemale")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("emailLabel")}</span>
                    <span className="font-medium">{member.email || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{importT("wtLicenseLabel")}</span>
                    <span className="font-medium">{member.wt_licenseid || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("ltfLicenseLabel")}</span>
                    <span className="font-medium">{member.ltf_licenseid || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("dobLabel")}</span>
                    <span className="font-medium">{formatDisplayDate(member.date_of_birth)}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("beltRankLabel")}</span>
                    <span className="font-medium">{member.belt_rank || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("primaryLicenseRoleLabel")}</span>
                    <span className="font-medium">
                      {canonicalizeLicenseRole(member.primary_license_role)
                        ? roleLabelByValue[canonicalizeLicenseRole(member.primary_license_role)]
                        : "-"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("secondaryLicenseRoleLabel")}</span>
                    <span className="font-medium">
                      {canonicalizeLicenseRole(member.secondary_license_role)
                        ? roleLabelByValue[canonicalizeLicenseRole(member.secondary_license_role)]
                        : "-"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{t("isActiveLabel")}</span>
                    <span className="font-medium">
                      {member.is_active ? t("activeLabel") : t("inactiveLabel")}
                    </span>
                  </div>
                </div>
            </FormPanel>
            {competitionOn && canEditMember ? (
              <>
                <MemberTeamsCard
                  memberId={member.id}
                  clubId={member.club}
                  teams={member.teams ?? []}
                  onChanged={() => void loadMember()}
                />
                <MemberGearCard memberId={member.id} />
              </>
            ) : null}
            </>
            ) : null}

            {activeTab === "current-licenses" ? (
              <CurrentLicensesPanel
                memberId={member.id}
                licenses={member.current_licenses ?? []}
                title={t("currentLicensesTitle")}
                subtitle={t("currentLicensesSubtitle")}
                emptyLabel={t("currentLicensesEmpty")}
                pendingHint={t("currentLicensesPendingHint")}
                yearLabel={t("yearLabel")}
                typeLabel={t("licenseTypeLabel")}
                statusLabel={t("statusLabel")}
                pendingLabel={t("statusPending")}
                activeLabel={t("statusActive")}
                expiredLabel={t("statusExpired")}
                revokedLabel={t("statusRevoked")}
                cardPreviewTitle={t("cardPreviewTitle")}
                cardPreviewFrontLabel={t("cardPreviewFrontLabel")}
                cardPreviewBackLabel={t("cardPreviewBackLabel")}
                cardPreviewUnavailable={t("cardPreviewUnavailable")}
              />
            ) : null}

            {activeTab === "license-history" ? (
              <FormPanel>
                <h2 className="text-section text-foreground">{t("memberLicenseHistoryTab")}</h2>
                <p className="mt-1 text-sm text-muted">{t("licenseHistorySubtitle")}</p>
                <div className="mt-3">
                  <MemberHistoryTimeline {...historyTimelineShared} visibleSection="licenses" />
                </div>
              </FormPanel>
            ) : null}

            {activeTab === "grades" ? (
              <FormPanel>
                <h2 className="text-section text-foreground">{t("memberGradesTab")}</h2>
                <p className="mt-1 text-sm text-muted">{t("gradeHistorySubtitle")}</p>
                <div className="mt-3">
                  <MemberHistoryTimeline
                    {...historyTimelineShared}
                    visibleSection="grades"
                    onPromote={
                      canManageGrades
                        ? async (input) => {
                            await promoteMemberGrade(member.id, input);
                            await loadMember();
                          }
                        : undefined
                    }
                    onUpdateGrade={
                      canManageGrades
                        ? async (historyId, input) => {
                            await updateMemberGrade(member.id, historyId, input);
                            await loadMember();
                          }
                        : undefined
                    }
                    onDeleteGrade={
                      canManageGrades
                        ? async (historyId) => {
                            await deleteMemberGrade(member.id, historyId);
                            await loadMember();
                          }
                        : undefined
                    }
                  />
                </div>
              </FormPanel>
            ) : null}

            {activeTab === "committee" && showCommittee ? (
              <MemberCommitteePanel terms={history?.committee_history ?? []} />
            ) : null}

            {activeTab === "club-movements" ? (
              <MemberClubMovementPanel
                title={t("clubMovementHistoryTitle")}
                subtitle={t("clubMovementHistorySubtitle")}
                emptyLabel={t("clubMovementHistoryEmpty")}
                fromLabel={t("clubMovementFromLabel")}
                toLabel={t("clubMovementToLabel")}
                dateLabel={t("clubMovementDateLabel")}
                statusLabel={t("statusLabel")}
                countLabel={t("clubMovementCountLabel")}
                touristLabel={t("clubTouristBadge")}
                touristHint={t("clubTouristMemberHint")}
                history={clubMoves}
              />
            ) : null}
            </div>
          </div>
        )}
      </div>
      <MemberFormPanel
        open={isEditing && canManageMemberFull && Boolean(member)}
        mode="edit"
        member={member}
        clubs={[]}
        selectedClubId={selectedClubId}
        onClose={onCancelEdit}
        onSaved={async () => {
          onCancelEdit();
          await loadMember();
        }}
      />
    </ClubAdminLayout>
  );
}
