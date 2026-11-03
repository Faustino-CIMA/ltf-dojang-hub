"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { DeleteConfirmModal } from "@/components/ui/delete-confirm-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import {
  ListActionsRow,
  ListToolbarPanel,
  ActionNotices
} from "@/components/ui/list-page-chrome";
import { apiRequest } from "@/lib/api";
import {
  LicenseType,
  createLicenseType,
  deleteLicenseType,
  getLicenseTypes,
  updateLicenseType,
} from "@/lib/ltf-admin-api";

const licenseTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

type LicenseTypeFormValues = z.infer<typeof licenseTypeSchema>;
type AuthMeResponse = { role: string };

export default function LtfAdminLicenseTypesPage() {
  const t = useTranslations("LtfAdmin");
  const common = useTranslations("Common");
  const [licenseTypes, setLicenseTypes] = useState<LicenseType[]>([]);
  const [editingType, setEditingType] = useState<LicenseType | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [licenseTypeToDelete, setLicenseTypeToDelete] = useState<LicenseType | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentRole, setCurrentRole] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LicenseTypeFormValues>({
    resolver: zodResolver(licenseTypeSchema),
    defaultValues: {
      name: "",
    },
  });

  const loadLicenseTypes = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getLicenseTypes();
      setLicenseTypes(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load license types.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLicenseTypes();
  }, []);

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

  const canManageLicenseTypes = currentRole === "ltf_finance";

  const filteredTypes = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return licenseTypes;
    }
    return licenseTypes.filter((licenseType) => {
      return (
        licenseType.name.toLowerCase().includes(normalizedQuery) ||
        licenseType.code.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [licenseTypes, searchQuery]);

  const onSubmit = async (values: LicenseTypeFormValues) => {
    setErrorMessage(null);
    try {
      if (editingType) {
        await updateLicenseType(editingType.id, { name: values.name });
      } else {
        await createLicenseType({ name: values.name });
      }
      setEditingType(null);
      setIsFormOpen(false);
      reset({ name: "" });
      await loadLicenseTypes();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save license type.");
    }
  };

  const startCreate = () => {
    setEditingType(null);
    setIsFormOpen(true);
    reset({ name: "" });
  };

  const startEdit = (licenseType: LicenseType) => {
    setEditingType(licenseType);
    setIsFormOpen(true);
    reset({ name: licenseType.name });
  };

  const handleDelete = (licenseType: LicenseType) => {
    setLicenseTypeToDelete(licenseType);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!licenseTypeToDelete) {
      return;
    }
    try {
      await deleteLicenseType(licenseTypeToDelete.id);
      setIsDeleteOpen(false);
      setLicenseTypeToDelete(null);
      await loadLicenseTypes();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete license type.");
    }
  };

  return (
    <LtfAdminLayout title={t("licenseTypesTitle")} subtitle={t("licenseTypesSubtitle")}>
      <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />

      <div className="space-y-3">
        <div className="flex flex-col gap-3">
          <ListToolbarPanel
            search={
              <Input
                className="w-full max-w-xs"
                placeholder={t("searchLicenseTypesPlaceholder")}
                aria-label={t("searchLicenseTypesPlaceholder")}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            }
          />
          <ListActionsRow
            actions={
              canManageLicenseTypes ? (
                <Button variant="primary" onClick={startCreate}>{t("createLicenseType")}</Button>
              ) : (
                <p className="text-sm text-muted">{t("licenseTypesReadOnlyHint")}</p>
              )
            }
          />
        </div>

        {isLoading ? (
          <EmptyState title={t("loadingTitle")} description={t("loadingSubtitle")} loading />
        ) : filteredTypes.length === 0 ? (
          <EmptyState title={t("noResultsTitle")} description={t("noLicenseTypesResultsSubtitle")} />
        ) : (
          <EntityTable
            columns={[
              { key: "name", header: t("licenseTypeNameLabel") },
              { key: "code", header: t("licenseTypeCodeLabel") },
              ...(canManageLicenseTypes
                ? [
                    {
                      key: "actions",
                      header: t("actionsLabel"),
                      render: (licenseType: LicenseType) => (
                        <RowActionMenu
                          label={common("rowActionsLabel")}
                          actions={[
                            { key: "edit", label: t("editAction"), onSelect: () => startEdit(licenseType) },
                            { key: "delete", label: t("deleteAction"), destructive: true, onSelect: () => handleDelete(licenseType) },
                          ]}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
            rows={filteredTypes}
          />
        )}
      </div>

      <SidePanel
        open={isFormOpen && canManageLicenseTypes}
        title={editingType ? t("updateLicenseType") : t("createLicenseType")}
        description={t("licenseTypeFormSubtitle")}
        closeLabel={common("modalClose")}
        onClose={() => setIsFormOpen(false)}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingType(null);
                setIsFormOpen(false);
                reset({ name: "" });
              }}
            >
              {t("cancelEdit")}
            </Button>
            <Button type="submit" form="license-type-form" disabled={isSubmitting}>
              {editingType ? t("updateLicenseType") : t("createLicenseType")}
            </Button>
          </>
        }
      >
        <form id="license-type-form" className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="license-type-name" required>{t("licenseTypeNameLabel")}</Label>
            <Input id="license-type-name" placeholder={t("licenseTypeNamePlaceholder")} {...register("name")} />
            {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
          </div>
        </form>
      </SidePanel>

      <DeleteConfirmModal
        isOpen={isDeleteOpen && canManageLicenseTypes}
        title={common("deleteTitle", { item: t("licenseTypeLabel") })}
        description={common("deleteDescriptionWithName", {
          name: licenseTypeToDelete?.name ?? "",
        })}
        confirmLabel={common("deleteConfirmButton")}
        cancelLabel={common("deleteCancelButton")}
        onConfirm={confirmDelete}
        onCancel={() => {
          setIsDeleteOpen(false);
          setLicenseTypeToDelete(null);
        }}
      />
    </LtfAdminLayout>
  );
}
