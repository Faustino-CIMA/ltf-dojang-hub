"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";

import { authPrimaryClass } from "@/components/auth/auth-frame";

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
    <section className="px-1 py-6 text-center">
      <p className="sr-only" role="status">
        {live}
      </p>
      <div className={`mx-auto flex size-16 items-center justify-center rounded-full ${iconClass}`}>
        <Icon className="size-9" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-[var(--brand-on-ink)]">{title}</h1>
      <p className="auth-quiet mt-2 text-sm leading-relaxed">{body}</p>
      {action ? (
        <Link ref={actionRef} href={action.href} className={`${authPrimaryClass} mt-6`}>
          {action.label}
        </Link>
      ) : null}
    </section>
  );
}
