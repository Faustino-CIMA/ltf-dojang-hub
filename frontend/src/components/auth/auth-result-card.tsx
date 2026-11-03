"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AuthResultCard({
  tone,
  title,
  body,
  live,
  action,
}: {
  tone: "success" | "warning";
  title: string;
  body: string;
  live: string;
  action?: { href: string; label: string };
}) {
  const actionRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    actionRef.current?.focus();
  }, [action?.href]);

  const Icon = tone === "success" ? CircleCheck : CircleAlert;
  const iconClass =
    tone === "success"
      ? "bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-[var(--success)]"
      : "bg-[color-mix(in_oklab,var(--warning)_18%,transparent)] text-[var(--warning)]";

  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-surface px-5 py-8 text-center shadow-[var(--shadow-float)]">
      <p className="sr-only" role="status">
        {live}
      </p>
      <div className={`mx-auto flex size-16 items-center justify-center rounded-full ${iconClass}`}>
        <Icon className="size-9" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-foreground">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      {action ? (
        <Button asChild variant="primary" className="mt-6 w-full">
          <Link ref={actionRef} href={action.href}>
            {action.label}
          </Link>
        </Button>
      ) : null}
    </section>
  );
}
