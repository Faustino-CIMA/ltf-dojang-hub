"use client";

import { Download, Eye, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { type PrintJob, type PrintJobStatus } from "@/lib/license-card-api";

const PDF_READY_STATUSES: PrintJobStatus[] = ["succeeded"];
const DELETE_BLOCKED_STATUSES: PrintJobStatus[] = ["queued", "running"];

export type PrintJobRowActionLabels = {
  preview: string;
  download: string;
  delete: string;
  menu: string;
  execute: string;
  retry: string;
  cancel: string;
};

type PrintJobRowActionsProps = {
  job: PrintJob;
  busy: boolean;
  labels: PrintJobRowActionLabels;
  onPreview: (job: PrintJob) => void;
  onDownload: (job: PrintJob) => void;
  onDelete: (job: PrintJob) => void;
  onExecute: (job: PrintJob) => void;
  onRetry: (job: PrintJob) => void;
  onCancel: (job: PrintJob) => void;
};

export function PrintJobRowActions({
  job,
  busy,
  labels,
  onPreview,
  onDownload,
  onDelete,
  onExecute,
  onRetry,
  onCancel,
}: PrintJobRowActionsProps) {
  const pdfReady = PDF_READY_STATUSES.includes(job.status) && Boolean(job.artifact_pdf);
  const deleteBlocked = DELETE_BLOCKED_STATUSES.includes(job.status);

  return (
    <div className="flex flex-nowrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy || !pdfReady}
        onClick={() => onPreview(job)}
      >
        <Eye aria-hidden="true" />
        {labels.preview}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy || !pdfReady}
        onClick={() => onDownload(job)}
      >
        <Download aria-hidden="true" />
        {labels.download}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy || deleteBlocked}
        onClick={() => onDelete(job)}
      >
        <Trash2 aria-hidden="true" />
        {labels.delete}
      </Button>
      <RowActionMenu
        label={labels.menu}
        actions={[
          {
            key: "execute",
            label: labels.execute,
            disabled: busy || !["draft", "failed"].includes(job.status),
            onSelect: () => onExecute(job),
          },
          {
            key: "retry",
            label: labels.retry,
            disabled: busy || !["failed", "cancelled"].includes(job.status),
            onSelect: () => onRetry(job),
          },
          {
            key: "cancel",
            label: labels.cancel,
            disabled: busy || ["succeeded", "cancelled"].includes(job.status),
            onSelect: () => onCancel(job),
          },
        ]}
      />
    </div>
  );
}
