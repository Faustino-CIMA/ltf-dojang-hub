"use client"

import * as React from "react"

import { useDeskAccess } from "@/components/desk-access"
import { formatDisplayDate } from "@/lib/date-display"
import { cn } from "@/lib/utils"

const LOCKED_FILE = new Set(["file", "checkbox", "radio", "range", "color"])

function Input({ className, type, readOnly, disabled, ...props }: React.ComponentProps<"input">) {
  const { readOnly: viewOnly } = useDeskAccess()
  const fileLike = LOCKED_FILE.has(type || "")
  const field = (
    <input
      type={type}
      data-slot="input"
      readOnly={viewOnly && !fileLike ? true : readOnly}
      disabled={viewOnly && fileLike ? true : disabled}
      aria-readonly={viewOnly && !fileLike ? true : undefined}
      className={cn(
        "file:text-foreground placeholder:text-[var(--field-placeholder)] selection:bg-primary selection:text-primary-foreground border-[var(--border)] h-[var(--control-height)] min-h-[var(--control-height)] w-full min-w-0 rounded-[var(--radius-form)] border bg-[var(--field-background)] px-3 py-0 text-sm text-[var(--field-foreground)] transition-[color,box-shadow] outline-none file:inline-flex file:h-[var(--control-height)] file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        "read-only:cursor-text read-only:opacity-100",
        className
      )}
      {...props}
    />
  )
  if (type !== "date") {
    return field
  }
  const selected = typeof props.value === "string" ? props.value.trim() : ""
  const shown = selected ? formatDisplayDate(selected) : ""
  return (
    <div className="grid w-full min-w-0 gap-1">
      {field}
      <p className="min-h-4 text-xs leading-4 text-muted tabular-nums">{shown && shown !== "-" ? shown : "\u00a0"}</p>
    </div>
  )
}

export { Input }
