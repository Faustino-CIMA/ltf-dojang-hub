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

describe("PrintJobRowActions", () => {
  it("shows labeled icon buttons and keeps rare actions in the menu", () => {
    const onDelete = jest.fn();
    const onExecute = jest.fn();
    render(
      <PrintJobRowActions
        job={job()}
        busy={false}
        labels={labels}
        onPreview={jest.fn()}
        onDownload={jest.fn()}
        onDelete={onDelete}
        onExecute={onExecute}
        onRetry={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Preview PDF" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Execute" }));
    expect(onExecute).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menuitem", { name: "Preview PDF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Download PDF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("enables preview and download only when the PDF artifact is ready", () => {
    const onPreview = jest.fn();
    const onDownload = jest.fn();
    render(
      <PrintJobRowActions
        job={job({ status: "succeeded", artifact_pdf: "/media/job.pdf" })}
        busy={false}
        labels={labels}
        onPreview={onPreview}
        onDownload={onDownload}
        onDelete={jest.fn()}
        onExecute={jest.fn()}
        onRetry={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("blocks delete while a job is queued or running", () => {
    const onDelete = jest.fn();
    render(
      <PrintJobRowActions
        job={job({ status: "running" })}
        busy={false}
        labels={labels}
        onPreview={jest.fn()}
        onDownload={jest.fn()}
        onDelete={onDelete}
        onExecute={jest.fn()}
        onRetry={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).not.toHaveBeenCalled();
  });
});
