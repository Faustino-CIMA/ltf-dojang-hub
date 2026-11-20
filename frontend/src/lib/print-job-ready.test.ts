import { type PrintJob } from "@/lib/license-card-api";

import {
  PrintJobNotReady,
  pollPrintJobUntilPdf,
  printJobTemplateVersionLabel,
} from "./print-job-ready";

function job(overrides: Partial<PrintJob>): PrintJob {
  return {
    id: 7,
    job_number: "PJ-7",
    club: 1,
    template_version: 5,
    template_version_number: 4,
    paper_profile: null,
    printer_profile: null,
    printer_profile_data: null,
    side: "front",
    status: "queued",
    total_items: 1,
    selected_slots: [0],
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
    execution_attempts: 1,
    artifact_pdf: null,
    artifact_size_bytes: 0,
    artifact_sha256: "",
    error_detail: "",
    last_error_at: null,
    created_at: "2026-11-20T10:00:00+01:00",
    updated_at: "2026-11-20T10:00:00+01:00",
    items: [],
    ...overrides,
  };
}

describe("print job PDF wait", () => {
  it("shows the published version, not the database id", () => {
    expect(printJobTemplateVersionLabel(job({}))).toBe("v4");
    expect(printJobTemplateVersionLabel(job({ template_version: 5, template_version_number: null }))).toBe("v5");
  });

  it("waits through queued and running, then downloads the PDF", async () => {
    const states = [
      job({ status: "queued", artifact_pdf: null }),
      job({ status: "running", artifact_pdf: null }),
      job({ status: "succeeded", artifact_pdf: "/media/cards.pdf" }),
    ];
    const seen: string[] = [];
    const file = await pollPrintJobUntilPdf({
      read: async () => states.shift() as PrintJob,
      download: async () => ({ blob: new Blob(["%PDF"]), filename: "cards.pdf" }),
      onStatus: (current) => seen.push(current.status),
      sleep: async () => undefined,
      now: () => 0,
    });
    expect(seen).toEqual(["queued", "running", "succeeded"]);
    expect(file.filename).toBe("cards.pdf");
  });

  it("fails when the job fails, without downloading", async () => {
    const download = jest.fn();
    await expect(
      pollPrintJobUntilPdf({
        read: async () => job({ status: "failed", error_detail: "renderer stopped" }),
        download,
        sleep: async () => undefined,
        now: () => 0,
      }),
    ).rejects.toMatchObject({ reason: "failed", message: "renderer stopped" });
    expect(download).not.toHaveBeenCalled();
  });

  it("stops waiting when the PDF never arrives", async () => {
    let clock = 0;
    await expect(
      pollPrintJobUntilPdf({
        read: async () => job({ status: "running" }),
        download: async () => ({ blob: new Blob(["%PDF"]), filename: "cards.pdf" }),
        sleep: async (ms) => {
          clock += ms;
        },
        now: () => clock,
        timeoutMs: 2000,
        intervalMs: 1000,
      }),
    ).rejects.toBeInstanceOf(PrintJobNotReady);
  });
});
