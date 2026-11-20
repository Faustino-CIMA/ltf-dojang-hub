import { type PrintJob, type PrintJobPdfFile } from "@/lib/license-card-api";

export const PRINT_JOB_PDF_WAIT_MS = 120_000;
export const PRINT_JOB_PDF_POLL_MS = 1_000;

export class PrintJobNotReady extends Error {
  readonly reason: "failed" | "timeout";

  constructor(reason: "failed" | "timeout", detail: string) {
    super(detail);
    this.name = "PrintJobNotReady";
    this.reason = reason;
  }
}

export function printJobTemplateVersionLabel(job: {
  template_version: number;
  template_version_number?: number | null;
}) {
  if (typeof job.template_version_number === "number") {
    return `v${job.template_version_number}`;
  }
  return `v${job.template_version}`;
}

/** Poll until the queued job has a PDF, or fail when the job itself fails. */
export async function pollPrintJobUntilPdf(options: {
  read: () => Promise<PrintJob>;
  download: () => Promise<PrintJobPdfFile>;
  onStatus?: (job: PrintJob) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<PrintJobPdfFile> {
  const timeoutMs = options.timeoutMs ?? PRINT_JOB_PDF_WAIT_MS;
  const intervalMs = options.intervalMs ?? PRINT_JOB_PDF_POLL_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const started = now();
  while (now() - started <= timeoutMs) {
    const job = await options.read();
    options.onStatus?.(job);
    if (job.status === "succeeded" && job.artifact_pdf) {
      return options.download();
    }
    if (job.status === "failed" || job.status === "cancelled") {
      throw new PrintJobNotReady("failed", job.error_detail || job.status);
    }
    if (now() - started >= timeoutMs) {
      break;
    }
    await sleep(intervalMs);
  }
  throw new PrintJobNotReady("timeout", "timeout");
}
