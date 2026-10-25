"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/club-admin/empty-state";
import { EntityTable } from "@/components/club-admin/entity-table";
import { LuAddressFields, type AddressValue } from "@/components/clubmgmt/lu-address-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteConfirmModal } from "@/components/ui/delete-confirm-modal";
import { Input } from "@/components/ui/input";
import { Label, RequiredForm } from "@/components/ui/label";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createTrainingVenue,
  deleteTrainingVenue,
  listTrainingVenues,
  updateTrainingVenue,
  venueShortAddress,
  type TrainingVenue,
} from "@/lib/training-venues";
import type { TableSort } from "@/lib/table-sort";

const EMPTY_ADDRESS: AddressValue = {
  postal_code: "",
  locality: "",
  street: "",
  house_number: "",
  line2: "",
  country: "Luxembourg",
  use_for_invoice: false,
};

export function TrainingVenuesSection({
  clubId,
  onError,
  onSuccess,
}: {
  clubId: number;
  onError?: (message: string | null) => void;
  onSuccess?: (message: string | null) => void;
}) {
  const t = useTranslations("TrainingVenues");
  const common = useTranslations("Common");
  const [venues, setVenues] = useState<TrainingVenue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sort, setSort] = useState<TableSort | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingVenue | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TrainingVenue | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setVenues(await listTrainingVenues(clubId));
      onError?.(null);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : t("loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [clubId, onError, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setNotes("");
    setIsActive(true);
    setAddress(EMPTY_ADDRESS);
    setFormError(null);
    setPanelOpen(true);
  };

  const openEdit = (venue: TrainingVenue) => {
    setEditing(venue);
    setName(venue.name);
    setNotes(venue.notes);
    setIsActive(venue.is_active);
    setAddress({
      postal_code: venue.postal_code,
      locality: venue.locality,
      street: venue.street,
      house_number: venue.house_number,
      line2: venue.line2,
      country: venue.country || "Luxembourg",
      use_for_invoice: false,
    });
    setFormError(null);
    setPanelOpen(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError(t("nameRequired"));
      return;
    }
    setIsSaving(true);
    setFormError(null);
    const payload = {
      name: trimmed,
      street: address.street.trim(),
      house_number: address.house_number.trim(),
      line2: address.line2.trim(),
      postal_code: address.postal_code.trim(),
      locality: address.locality.trim(),
      country: address.country.trim() || "Luxembourg",
      notes: notes.trim(),
      is_active: isActive,
    };
    try {
      if (editing) {
        await updateTrainingVenue(clubId, editing.id, payload);
      } else {
        await createTrainingVenue(clubId, payload);
      }
      setPanelOpen(false);
      onSuccess?.(t("saved"));
      await load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteTrainingVenue(clubId, pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : t("saveError"));
      setPendingDelete(null);
    }
  };

  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-2 text-sm text-muted">{t("subtitle")}</p>
        </div>
        <Button type="button" onClick={openCreate}>
          {t("addVenue")}
        </Button>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <EmptyState title={t("title")} description={t("subtitle")} loading />
        ) : venues.length === 0 ? (
          <EmptyState title={t("emptyTitle")} description={t("emptySubtitle")} />
        ) : (
          <EntityTable
            embedded
            clientSort
            sort={sort}
            onSortChange={setSort}
            rows={venues}
            columns={[
              {
                key: "name",
                header: t("nameLabel"),
                sortable: true,
                sortValue: (venue) => venue.name,
              },
              {
                key: "address",
                header: t("shortAddressLabel"),
                sortable: true,
                sortValue: (venue) => venueShortAddress(venue),
                render: (venue) => venueShortAddress(venue) || "—",
              },
              {
                key: "is_active",
                header: t("activeLabel"),
                sortable: true,
                sortValue: (venue) => venue.is_active,
                render: (venue) => (
                  <StatusBadge
                    label={venue.is_active ? t("activeBadge") : t("inactiveBadge")}
                    tone={venue.is_active ? "success" : "neutral"}
                  />
                ),
              },
              {
                key: "actions",
                header: t("actionsLabel"),
                render: (venue) => (
                  <RowActionMenu
                    label={common("rowActionsLabel")}
                    actions={[
                      { key: "edit", label: t("editVenue"), onSelect: () => openEdit(venue) },
                      {
                        key: "delete",
                        label: t("deleteVenue"),
                        destructive: true,
                        onSelect: () => setPendingDelete(venue),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        )}
      </div>

      <SidePanel
        open={panelOpen}
        title={editing ? t("editVenue") : t("addVenue")}
        description={t("subtitle")}
        closeLabel={common("modalClose")}
        onClose={() => setPanelOpen(false)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setPanelOpen(false)} disabled={isSaving}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="training-venue-form" disabled={isSaving}>
              {isSaving ? t("saving") : t("save")}
            </Button>
          </>
        }
      >
        <form id="training-venue-form" className="space-y-4" onSubmit={handleSubmit}>
          <RequiredForm>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <div className="space-y-2">
              <Label htmlFor="venue-name" required>
                {t("nameLabel")}
              </Label>
              <Input
                id="venue-name"
                value={name}
                placeholder={t("namePlaceholder")}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <LuAddressFields idPrefix="venue" value={address} onChange={setAddress} />
            <div className="space-y-2">
              <Label htmlFor="venue-notes">{t("notesLabel")}</Label>
              <textarea
                id="venue-notes"
                value={notes}
                placeholder={t("notesPlaceholder")}
                rows={3}
                onChange={(event) => setNotes(event.target.value)}
                className="w-full rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 py-2 text-sm text-[var(--field-foreground)] outline-none placeholder:text-[var(--field-placeholder)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="venue-active"
                checked={isActive}
                onCheckedChange={(value) => setIsActive(value === true)}
              />
              <Label htmlFor="venue-active">{t("activeLabel")}</Label>
            </div>
          </RequiredForm>
        </form>
      </SidePanel>

      <DeleteConfirmModal
        isOpen={pendingDelete !== null}
        title={t("deleteTitle")}
        description={t("deleteDescription", { name: pendingDelete?.name ?? "" })}
        confirmLabel={common("deleteConfirmButton")}
        cancelLabel={common("deleteCancelButton")}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
