"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

export type DashboardHeader = {
  title: string;
  subtitle?: string;
  hintSubtitle?: boolean;
};

type DashboardShellContextValue = {
  setHeader: (header: DashboardHeader) => void;
};

export const DashboardShellContext = createContext<DashboardShellContextValue | null>(null);

export function useDashboardPageHeader(initial: DashboardHeader) {
  const [pageHeader, setPageHeader] = useState<DashboardHeader | null>(null);
  const shell = useMemo<DashboardShellContextValue>(() => ({ setHeader: setPageHeader }), []);
  return {
    title: pageHeader?.title || initial.title,
    subtitle: pageHeader ? pageHeader.subtitle : initial.subtitle,
    hintSubtitle: pageHeader ? pageHeader.hintSubtitle : initial.hintSubtitle,
    shell,
  };
}

export function DashboardHeaderSync({
  title,
  subtitle,
  hintSubtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  hintSubtitle?: boolean;
  children: ReactNode;
}) {
  const shell = useContext(DashboardShellContext);
  useLayoutEffect(() => {
    shell?.setHeader({ title, subtitle, hintSubtitle });
  }, [hintSubtitle, shell, subtitle, title]);
  return children;
}
