"use client";

import { InfoHint } from "@/components/ui/info-hint";

export type WizardChromeStep = {
  id: string;
  label: string;
};

export type ImportBadgeTone = "success" | "info" | "warning" | "danger" | "neutral";

const TONE_CLASS: Record<ImportBadgeTone, string> = {
  success: "badge-success",
  info: "badge-info",
  warning: "badge-warning",
  danger: "badge-danger",
  neutral: "border-border bg-secondary text-foreground",
};

const CARD_TONE: Record<ImportBadgeTone, string> = {
  success: "banner-success",
  info: "banner-info",
  warning: "banner-warning",
  danger: "banner-danger",
  neutral: "border-border bg-secondary text-foreground",
};

export function WizardStepPills({
  steps,
  currentId,
  resultTone,
}: {
  steps: WizardChromeStep[];
  currentId: string;
  resultTone?: "success" | "warning" | "error" | null;
}) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentId),
  );
  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((step, index) => {
          const isCurrent = step.id === currentId;
          const isDone = index < currentIndex;
          const resultClass =
            step.id === "result" && resultTone === "success"
              ? "badge-success"
              : step.id === "result" && resultTone === "warning"
                ? "badge-warning"
                : step.id === "result" && resultTone === "error"
                  ? "badge-danger"
                  : null;
          return (
            <span
              key={step.id}
              data-result-tone={step.id === "result" ? resultTone ?? undefined : undefined}
              className={`inline-flex items-center gap-2 rounded-[var(--radius-form)] border px-3 py-1 text-xs font-medium ${
                resultClass
                  ? resultClass
                  : isCurrent
                    ? "border-primary bg-primary text-primary-foreground"
                    : isDone
                      ? "badge-success"
                      : "border-border bg-secondary text-muted"
              }`}
            >
              <span>{index + 1}</span>
              <span>{step.label}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}

export function ImportStatusBadge({ tone, label }: { tone: ImportBadgeTone; label: string }) {
  return (
    <span className={`inline-flex rounded-[var(--radius-form)] border px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}>
      {label}
    </span>
  );
}

export function ExplainedCount({
  label,
  hint,
  hintLabel,
  tone = "neutral",
}: {
  label: string;
  hint: string;
  hintLabel: string;
  tone?: ImportBadgeTone;
}) {
  return (
    <div className={`flex items-start justify-between gap-2 rounded-[var(--radius-form)] border px-3 py-2 text-sm ${CARD_TONE[tone]}`}>
      <span className="font-medium">{label}</span>
      <InfoHint ariaLabel={hintLabel} size="compact">
        {hint}
      </InfoHint>
    </div>
  );
}

export function StatusLegend({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; hint: string; tone: ImportBadgeTone }>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-sm text-muted">
            <ImportStatusBadge tone={item.tone} label={item.label} />
            <span>{item.hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StepIntro({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="space-y-2 text-sm text-muted">{children}</div>
    </div>
  );
}
