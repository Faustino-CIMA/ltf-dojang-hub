"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { Button } from "@/components/ui/button";
import { DeleteConfirmModal } from "@/components/ui/delete-confirm-modal";
import { Input } from "@/components/ui/input";
import { PopoverSelect } from "@/components/ui/popover-select";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiRequest } from "@/lib/api";
import { getClubs } from "@/lib/club-admin-api";
import { formatDisplayDateTime } from "@/lib/date-display";
import { type TableSort } from "@/lib/table-sort";
import {
  PrintJob,
  PrintJobStatus,
  cancelPrintJob,
  deletePrintJob,
  downloadPrintJobPdf,
  executePrintJob,
  getPrintJobs,
  retryPrintJob,
} from "@/lib/license-card-api";

type AuthMeResponse = {
  role: string;
};

function openBlobInNewTab(blob: Blob) {
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 15000);
}

export default function ClubPrintJobsPage() {
  const t = useTranslations("ClubAdmin");
  const common = useTranslations("Common");
  const pathname = usePathname();
  const router = useRouter();
  const locale = pathname?.split("/")[1] || "en";
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PrintJobStatus | "all">("all");
  const [tableSort, setTableSort] = useState<TableSort | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [jobToDelete, setJobToDelete] = useState<PrintJob | null>(null);
  const isDeletingRef = useRef(false);
  const [clubNameById, setClubNameById] = useState<Record<number, string>>({});

  const canManagePrintJobs = currentRole === "club_admin";

  const loadJobs = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [jobsResponse, clubsResponse] = await Promise.all([getPrintJobs(), getClubs()]);
      setJobs(jobsResponse);
      setClubNameById(
        clubsResponse.reduce<Record<number, string>>((acc, club) => {
          acc[club.id] = club.name;
          return acc;
        }, {})
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("printJobsLoadError"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let isMounted = true;
    const loadRole = async () => {
      setIsRoleLoading(true);
      try {
        const me = await apiRequest<AuthMeResponse>("/api/auth/me/");
        if (isMounted) {
          setCurrentRole(me.role);
        }
      } catch {
        if (isMounted) {
          setCurrentRole(null);
        }
      } finally {
        if (isMounted) {
          setIsRoleLoading(false);
        }
      }
    };
    void loadRole();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!canManagePrintJobs) {
      return;
    }
    void loadJobs();
  }, [canManagePrintJobs, loadJobs]);

  const filteredJobs = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return jobs.filter((job) => {
      if (statusFilter !== "all" && job.status !== statusFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const clubName = (clubNameById[job.club] || "").toLowerCase();
      return (
        job.job_number.toLowerCase().includes(normalizedQuery) ||
        String(job.id).includes(normalizedQuery) ||
        String(job.template_version).includes(normalizedQuery) ||
        clubName.includes(normalizedQuery)
      );
    });
  }, [clubNameById, jobs, searchQuery, statusFilter]);

  const getStatusMeta = (status: PrintJobStatus) => {
    switch (status) {
      case "draft":
        return { label: t("printJobStatusDraft"), tone: "neutral" as const };
      case "queued":
        return { label: t("printJobStatusQueued"), tone: "warning" as const };
      case "running":
        return { label: t("printJobStatusRunning"), tone: "info" as const };
      case "succeeded":
        return { label: t("printJobStatusSucceeded"), tone: "success" as const };
      case "failed":
        return { label: t("printJobStatusFailed"), tone: "danger" as const };
      default:
        return { label: t("printJobStatusCancelled"), tone: "neutral" as const };
    }
  };

  const executeAction = async (jobId: number, action: () => Promise<unknown>) => {
    setActiveJobId(jobId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await action();
      setSuccessMessage(t("printJobsActionSuccess"));
      await loadJobs();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("printJobsActionError"));
    } finally {
      setActiveJobId(null);
    }
  };

  const confirmDelete = async () => {
    if (!jobToDelete || isDeletingRef.current) {
      return;
    }
    isDeletingRef.current = true;
    setActiveJobId(jobToDelete.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await deletePrintJob(jobToDelete.id);
      setJobToDelete(null);
      setSuccessMessage(t("printJobsDeletedSuccess"));
      await loadJobs();
    } catch (error) {
      setJobToDelete(null);
      setErrorMessage(error instanceof Error ? error.message : t("printJobsActionError"));
    } finally {
      isDeletingRef.current = false;
      setActiveJobId(null);
    }
  };

  const handleDownloadPdf = async (job: PrintJob) => {
    setActiveJobId(job.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const blob = await downloadPrintJobPdf(job.id);
      openBlobInNewTab(blob);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("printJobsActionError"));
    } finally {
      setActiveJobId(null);
    }
  };

  if (isRoleLoading) {
    return (
      <ClubAdminLayout title={t("printJobsTitle")} subtitle={t("printJobsSubtitle")}>
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      </ClubAdminLayout>
    );
  }

  if (!canManagePrintJobs) {
    return (
      <ClubAdminLayout title={t("printJobsTitle")} subtitle={t("printJobsSubtitle")}>
        <EmptyState title={t("orderLicenseForbiddenTitle")} description={t("orderLicenseForbiddenSubtitle")} />
      </ClubAdminLayout>
    );
  }

  return (
    <ClubAdminLayout title={t("printJobsTitle")} subtitle={t("printJobsSubtitle")}>
      <ActionNotices error={errorMessage} success={successMessage} onDismiss={() => { setErrorMessage(null); setSuccessMessage(null); }} />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-full max-w-sm"
            placeholder={t("printJobsSearchPlaceholder")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <PopoverSelect
            className="w-[200px]"
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as PrintJobStatus | "all")}
            ariaLabel={t("statusLabel")}
            options={[
              { value: "all", label: t("printJobsStatusFilterAll") },
              { value: "draft", label: t("printJobStatusDraft") },
              { value: "queued", label: t("printJobStatusQueued") },
              { value: "running", label: t("printJobStatusRunning") },
              { value: "succeeded", label: t("printJobStatusSucceeded") },
              { value: "failed", label: t("printJobStatusFailed") },
              { value: "cancelled", label: t("printJobStatusCancelled") },
            ]}
          />
          <Button
            variant="outline"
            onClick={() => router.push(`/${locale}/dashboard/club/print-jobs/quick-print`)}
          >
            {t("quickPrintCreateAction")}
          </Button>
          <Button variant="outline" disabled={isLoading} onClick={() => void loadJobs()}>
            {isLoading ? t("refreshingAction") : t("refreshAction")}
          </Button>
        </div>

        {isLoading ? (
          <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
        ) : filteredJobs.length === 0 ? (
          <EmptyState title={t("printJobsEmptyTitle")} description={t("printJobsEmptySubtitle")} />
        ) : (
          <EntityTable
            clientSort
            sort={tableSort}
            onSortChange={setTableSort}
            rows={filteredJobs}
            columns={[
              { key: "job_number", header: t("printJobLabel"), sortable: true, sortValue: (job) => job.job_number },
              {
                key: "club",
                header: t("clubLabel"),
                sortable: true,
                sortValue: (job) => clubNameById[job.club] || String(job.club),
                render: (job) => clubNameById[job.club] || String(job.club),
              },
              {
                key: "template_version",
                header: t("printJobTemplateVersionLabel"),
                sortable: true,
                sortValue: (job) => job.template_version,
                render: (job) => `#${job.template_version}`,
              },
              {
                key: "total_items",
                header: t("printJobItemsLabel"),
                sortable: true,
                sortValue: (job) => job.total_items,
              },
              {
                key: "status",
                header: t("statusLabel"),
                sortable: true,
                sortValue: (job) => job.status,
                render: (job) => {
                  const statusMeta = getStatusMeta(job.status);
                  return <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />;
                },
              },
              {
                key: "created_at",
                header: t("createdAtLabel"),
                sortable: true,
                sortValue: (job) => job.created_at,
                render: (job) => formatDisplayDateTime(job.created_at),
              },
              {
                key: "updated_at",
                header: t("updatedAtLabel"),
                sortable: true,
                sortValue: (job) => job.updated_at,
                render: (job) => formatDisplayDateTime(job.updated_at),
              },
              {
                key: "actions",
                header: t("actionsLabel"),
                render: (job) => {
                  const isJobBusy = activeJobId === job.id;
                  return (
                    <RowActionMenu
                      label={common("rowActionsLabel")}
                      actions={[
                        {
                          key: "execute",
                          label: t("printJobExecuteAction"),
                          disabled: isJobBusy || !["draft", "failed"].includes(job.status),
                          onSelect: () => void executeAction(job.id, () => executePrintJob(job.id)),
                        },
                        {
                          key: "retry",
                          label: t("printJobRetryAction"),
                          disabled: isJobBusy || !["failed", "cancelled"].includes(job.status),
                          onSelect: () => void executeAction(job.id, () => retryPrintJob(job.id)),
                        },
                        {
                          key: "cancel",
                          label: t("printJobCancelAction"),
                          disabled: isJobBusy || ["succeeded", "cancelled"].includes(job.status),
                          onSelect: () => void executeAction(job.id, () => cancelPrintJob(job.id)),
                        },
                        {
                          key: "pdf",
                          label: t("printJobDownloadPdfAction"),
                          disabled: isJobBusy || job.status !== "succeeded" || !job.artifact_pdf,
                          onSelect: () => void handleDownloadPdf(job),
                        },
                        {
                          key: "delete",
                          label: t("deleteAction"),
                          disabled: isJobBusy || job.status === "queued" || job.status === "running",
                          onSelect: () => setJobToDelete(job),
                        },
                      ]}
                    />
                  );
                },
              },
            ]}
          />
        )}
      </div>
      <DeleteConfirmModal
        isOpen={jobToDelete !== null}
        title={common("deleteTitle", { item: jobToDelete?.job_number ?? t("printJobLabel") })}
        description={common("deleteDescriptionWithName", { name: jobToDelete?.job_number ?? "" })}
        confirmLabel={common("deleteConfirmButton")}
        cancelLabel={common("deleteCancelButton")}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (activeJobId === null) {
            setJobToDelete(null);
          }
        }}
      />
    </ClubAdminLayout>
  );
}

