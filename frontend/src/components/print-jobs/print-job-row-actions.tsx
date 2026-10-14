"use client";

import { Ban, Download, Eye, Play, RotateCcw, Trash2 } from "lucide-react";

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
    <RowActionMenu
      label={labels.menu}
      actions={[
        {
          key: "preview",
          label: labels.preview,
          icon: <Eye aria-hidden="true" />,
          disabled: busy || !pdfReady,
          onSelect: () => onPreview(job),
        },
        {
          key: "download",
          label: labels.download,
          icon: <Download aria-hidden="true" />,
          disabled: busy || !pdfReady,
          onSelect: () => onDownload(job),
        },
        {
          key: "execute",
          label: labels.execute,
          icon: <Play aria-hidden="true" />,
          disabled: busy || !["draft", "failed"].includes(job.status),
          onSelect: () => onExecute(job),
        },
        {
          key: "retry",
          label: labels.retry,
          icon: <RotateCcw aria-hidden="true" />,
          disabled: busy || !["failed", "cancelled"].includes(job.status),
          onSelect: () => onRetry(job),
        },
        {
          key: "cancel",
          label: labels.cancel,
          icon: <Ban aria-hidden="true" />,
          disabled: busy || ["succeeded", "cancelled"].includes(job.status),
          onSelect: () => onCancel(job),
        },
        {
          key: "delete",
          label: labels.delete,
          icon: <Trash2 aria-hidden="true" />,
          destructive: true,
          disabled: busy || deleteBlocked,
          onSelect: () => onDelete(job),
        },
      ]}
    />
  );
}
