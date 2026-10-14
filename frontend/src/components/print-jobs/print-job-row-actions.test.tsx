import { fireEvent, render, screen } from "@testing-library/react";

import { PrintJobRowActions } from "@/components/print-jobs/print-job-row-actions";
import { type PrintJob } from "@/lib/license-card-api";

const labels = {
  preview: "Preview PDF",
  download: "Download PDF",
  delete: "Delete",
  menu: "Row actions",
  execute: "Execute",
  retry: "Retry",
  cancel: "Cancel",
};

function job(overrides: Partial<PrintJob> = {}): PrintJob {
  return {
    id: 42,
    job_number: "PJ-42",
    club: 1,
    template_version: 1,
    paper_profile: null,
    printer_profile: null,
    printer_profile_data: null,
    side: "front",
    status: "draft",
    total_items: 1,
    selected_slots: [],
    include_bleed_guide: false,
    include_safe_area_guide: false,
    bleed_mm: "0",
    safe_area_mm: "0",
    metadata: {},
    execution_metadata: {},
    requested_by: null,
    executed_by: null,
    queued_at: null,
    started_at: null,
    finished_at: null,
    cancelled_at: null,
    execution_attempts: 0,
    artifact_pdf: null,
    artifact_size_bytes: 0,
    artifact_sha256: "",
    error_detail: "",
    last_error_at: null,
    created_at: "2026-10-14T10:00:00+02:00",
    updated_at: "2026-10-14T10:00:00+02:00",
    items: [],
    ...overrides,
  };
}

function renderActions(overrides: Partial<PrintJob> = {}, handlers: Partial<Record<string, jest.Mock>> = {}) {
  const onPreview = handlers.onPreview ?? jest.fn();
  const onDownload = handlers.onDownload ?? jest.fn();
  const onDelete = handlers.onDelete ?? jest.fn();
  const onExecute = handlers.onExecute ?? jest.fn();
  const onRetry = handlers.onRetry ?? jest.fn();
  const onCancel = handlers.onCancel ?? jest.fn();
  render(
    <PrintJobRowActions
      job={job(overrides)}
      busy={false}
      labels={labels}
      onPreview={onPreview}
      onDownload={onDownload}
      onDelete={onDelete}
      onExecute={onExecute}
      onRetry={onRetry}
      onCancel={onCancel}
    />
  );
  return { onPreview, onDownload, onDelete, onExecute, onRetry, onCancel };
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
}

describe("PrintJobRowActions", () => {
  it("keeps every action in the row menu, with delete last and destructive", () => {
    const { onDelete, onExecute } = renderActions();

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Preview PDF" })).not.toBeInTheDocument();

    openMenu();
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Preview PDF",
      "Download PDF",
      "Execute",
      "Retry",
      "Cancel",
      "Delete",
    ]);
    for (const item of items) {
      expect(item.querySelector("svg")).not.toBeNull();
    }
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveClass("text-destructive");

    expect(screen.getByRole("menuitem", { name: "Preview PDF" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Download PDF" })).toBeDisabled();
    fireEvent.click(screen.getByRole("menuitem", { name: "Execute" }));
    expect(onExecute).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("enables preview and download only when the PDF artifact is ready", () => {
    const { onPreview, onDownload } = renderActions({
      status: "succeeded",
      artifact_pdf: "/media/job.pdf",
    });

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Preview PDF" }));
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Download PDF" }));
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("blocks delete while a job is queued or running", () => {
    const { onDelete } = renderActions({ status: "running" });

    openMenu();
    const deleteItem = screen.getByRole("menuitem", { name: "Delete" });
    expect(deleteItem).toBeDisabled();
    fireEvent.click(deleteItem);
    expect(onDelete).not.toHaveBeenCalled();
  });
});
