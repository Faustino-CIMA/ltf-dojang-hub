"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }
>(({ className, required, children, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "block text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className
    )}
    {...props}
  >
    {children}
    {required ? <RequiredMark /> : null}
  </label>
));

Label.displayName = "Label";

function RequiredMark() {
  const t = useTranslations("Common");
  return (
    <>
      <span aria-hidden="true" data-required="true" className="text-destructive">
        {" *"}
      </span>
      <span className="sr-only"> ({t("requiredMark")})</span>
    </>
  );
}

export function RequiredLegend({ className }: { className?: string }) {
  const t = useTranslations("Common");
  return (
    <p className={cn("mb-3 hidden text-sm text-muted group-has-data-required/required:block", className)}>
      <span aria-hidden="true" className="text-destructive">*</span> {t("requiredLegend")}
    </p>
  );
}

export function RequiredForm({
  children,
  className,
  legendClassName,
}: {
  children: React.ReactNode;
  className?: string;
  legendClassName?: string;
}) {
  return (
    <div className={cn("group/required", className)}>
      <RequiredLegend className={legendClassName} />
      {children}
    </div>
  );
}

export { Label };
