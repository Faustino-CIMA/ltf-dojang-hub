"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { confirmModuleRenewal, previewModuleRenewal } from "@/lib/ltf-finance-api";

type RenewalPage = {
  title: string;
  body: string;
  confirm: string;
  done: boolean;
  closed: boolean;
};

function ModuleRenewalPage() {
  const search = useSearchParams();
  const token = search.get("token") ?? "";
  const [page, setPage] = useState<RenewalPage | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    previewModuleRenewal(token)
      .then((next) => {
        if (!cancelled) setPage(next);
      })
      .catch(() => {
        if (!cancelled) setPage({ title: "", body: "", confirm: "", done: false, closed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setBusy(true);
    try {
      setPage(await confirmModuleRenewal(token));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl px-[var(--page-padding-x)] py-10">
      <section className="app-panel p-4">
        <h1 className="text-section text-foreground">{page?.title || "…"}</h1>
        {page?.body ? <p className="mt-3 text-sm text-muted">{page.body}</p> : null}
        {page && !page.done && !page.closed && page.confirm ? (
          <Button type="button" className="mt-4" onClick={() => void confirm()} disabled={busy}>
            {page.confirm}
          </Button>
        ) : null}
      </section>
    </main>
  );
}

export default function ModuleRenewalRoute() {
  return (
    <Suspense>
      <ModuleRenewalPage />
    </Suspense>
  );
}
