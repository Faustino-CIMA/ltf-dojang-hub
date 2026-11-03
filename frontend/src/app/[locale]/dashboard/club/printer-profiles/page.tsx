"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import {
  PrinterProfilePanel,
  printerProfileInitial,
  type PrinterProfileFormValues,
} from "@/components/ltf-admin/printer-profile-panel";
import { Button } from "@/components/ui/button";
import { ActionNotices, ListActionsRow, ListToolbarPanel } from "@/components/ui/list-page-chrome";
import { DeleteConfirmModal } from "@/components/ui/delete-confirm-modal";
import { Input } from "@/components/ui/input";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { apiRequest } from "@/lib/api";
import { getDashboardRouteForRole } from "@/lib/dashboard-routing";
import {
  PrinterProfile,
  createPrinterProfile,
  deletePrinterProfile,
  getPrinterProfiles,
  updatePrinterProfile,
} from "@/lib/license-card-api";

type AuthMeResponse = {
  role: string;
};

function formatOffsetMm(value: number | string): string {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return `${value} mm`;
  }
  return `${parsedValue.toFixed(2)} mm`;
}

export default function ClubAdminPrinterProfilesPage() {
  const t = useTranslations("LtfAdmin");
  const common = useTranslations("Common");
  const locale = useLocale();
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);
  const [printerProfiles, setPrinterProfiles] = useState<PrinterProfile[]>([]);
  const [editingProfile, setEditingProfile] = useState<PrinterProfile | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<PrinterProfile | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const canManagePrinterProfiles = currentRole === "club_admin";
  const fallbackRoute = getDashboardRouteForRole(currentRole ?? "", locale) ?? `/${locale}/dashboard/club`;

  const loadPrinterProfiles = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getPrinterProfiles();
      setPrinterProfiles(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("printerProfilesLoadError"));
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
    if (!canManagePrinterProfiles) {
      return;
    }
    void loadPrinterProfiles();
  }, [canManagePrinterProfiles, loadPrinterProfiles]);

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return printerProfiles;
    }
    return printerProfiles.filter((profile) => {
      const description = profile.description ?? "";
      return (
        profile.name.toLowerCase().includes(normalizedQuery) ||
        description.toLowerCase().includes(normalizedQuery) ||
        String(profile.x_offset_mm).toLowerCase().includes(normalizedQuery) ||
        String(profile.y_offset_mm).toLowerCase().includes(normalizedQuery)
      );
    });
  }, [printerProfiles, searchQuery]);

  const closeForm = () => {
    setEditingProfile(null);
    setIsFormOpen(false);
  };

  const closeDeleteModal = () => {
    setProfileToDelete(null);
    setIsDeleteOpen(false);
  };

  const startCreate = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingProfile(null);
    setIsFormOpen(true);
  };

  const startEdit = (profile: PrinterProfile) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingProfile(profile);
    setIsFormOpen(true);
  };

  const startDelete = (profile: PrinterProfile) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setProfileToDelete(profile);
    setIsDeleteOpen(true);
  };

  const saveProfile = async (values: PrinterProfileFormValues) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    const normalizedDescription = values.description.trim();
    const payload = {
      name: values.name.trim(),
      x_offset_mm: values.x_offset_mm,
      y_offset_mm: values.y_offset_mm,
      description: normalizedDescription,
    };

    try {
      if (editingProfile) {
        await updatePrinterProfile(editingProfile.id, payload);
        setSuccessMessage(t("printerProfilesUpdatedSuccess"));
      } else {
        await createPrinterProfile(payload);
        setSuccessMessage(t("printerProfilesCreatedSuccess"));
      }
      closeForm();
      await loadPrinterProfiles();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("printerProfilesSaveError"));
    }
  };

  const confirmDelete = async () => {
    if (!profileToDelete) {
      return;
    }
    setErrorMessage(null);
    try {
      await deletePrinterProfile(profileToDelete.id);
      closeDeleteModal();
      setSuccessMessage(t("printerProfilesDeletedSuccess"));
      await loadPrinterProfiles();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("printerProfilesDeleteError"));
    }
  };

  if (isRoleLoading) {
    return (
      <ClubAdminLayout title={t("printerProfilesTitle")} subtitle={t("printerProfilesSubtitle")}>
        <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
      </ClubAdminLayout>
    );
  }

  if (!canManagePrinterProfiles) {
    return (
      <ClubAdminLayout title={t("printerProfilesTitle")} subtitle={t("printerProfilesSubtitle")}>
        <EmptyState
          title={t("printerProfilesAccessDeniedTitle")}
          description={t("printerProfilesAccessDeniedSubtitle")}
        />
        <div className="mt-4">
          <Button asChild variant="outline">
            <Link href={fallbackRoute}>{t("printerProfilesAccessDeniedBackAction")}</Link>
          </Button>
        </div>
      </ClubAdminLayout>
    );
  }

  return (
    <ClubAdminLayout title={t("printerProfilesTitle")} subtitle={t("printerProfilesSubtitle")}>
      <ActionNotices error={errorMessage} success={successMessage} onDismiss={() => { setErrorMessage(null); setSuccessMessage(null); }} />

      <div className="space-y-3">
        <div className="flex flex-col gap-3">
          <ListToolbarPanel
            search={
              <Input
                className="w-full min-w-0 max-w-xl"
                placeholder={t("printerProfilesSearchPlaceholder")}
                aria-label={t("printerProfilesSearchPlaceholder")}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            }
          />
          <ListActionsRow
            actions={<Button variant="primary" onClick={startCreate}>{t("printerProfilesCreateAction")}</Button>}
          />
        </div>

        {isLoading ? (
          <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
        ) : filteredProfiles.length === 0 ? (
          <EmptyState
            title={searchQuery.trim() ? t("noResultsTitle") : t("printerProfilesEmptyTitle")}
            description={
              searchQuery.trim()
                ? t("printerProfilesNoResultsSubtitle")
                : t("printerProfilesEmptySubtitle")
            }
          />
        ) : (
          <EntityTable
            columns={[
              { key: "name", header: t("printerProfilesNameLabel") },
              {
                key: "x_offset_mm",
                header: t("printerProfilesXOffsetLabel"),
                render: (profile: PrinterProfile) => formatOffsetMm(profile.x_offset_mm),
              },
              {
                key: "y_offset_mm",
                header: t("printerProfilesYOffsetLabel"),
                render: (profile: PrinterProfile) => formatOffsetMm(profile.y_offset_mm),
              },
              {
                key: "description",
                header: t("printerProfilesDescriptionLabel"),
                render: (profile: PrinterProfile) => profile.description || t("printerProfilesDescriptionEmpty"),
              },
              {
                key: "actions",
                header: t("actionsLabel"),
                render: (profile: PrinterProfile) => (
                  <RowActionMenu
                    label={common("rowActionsLabel")}
                    actions={[
                      { key: "edit", label: t("editAction"), onSelect: () => startEdit(profile) },
                      { key: "delete", label: t("deleteAction"), destructive: true, onSelect: () => startDelete(profile) },
                    ]}
                  />
                ),
              },
            ]}
            rows={filteredProfiles}
          />
        )}
      </div>

      <PrinterProfilePanel
        open={isFormOpen}
        editing={Boolean(editingProfile)}
        formKey={editingProfile ? String(editingProfile.id) : "new"}
        initialValues={printerProfileInitial(editingProfile)}
        onClose={closeForm}
        onSubmit={saveProfile}
      />

      <DeleteConfirmModal
        isOpen={isDeleteOpen}
        title={common("deleteTitle", { item: t("printerProfileLabel") })}
        description={common("deleteDescriptionWithName", { name: profileToDelete?.name ?? "" })}
        confirmLabel={common("deleteConfirmButton")}
        cancelLabel={common("deleteCancelButton")}
        onConfirm={confirmDelete}
        onCancel={closeDeleteModal}
      />
    </ClubAdminLayout>
  );
}
