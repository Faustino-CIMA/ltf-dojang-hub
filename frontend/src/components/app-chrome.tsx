"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { logout } from "@/lib/auth-api";
import { clearToken, getToken } from "@/lib/auth";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("Common");
  const [hasToken, setHasToken] = useState(false);
  const isDashboard = pathname.includes("/dashboard");
  const isAuthPage = /\/(login|register|verify-email|reset-password)(\/|$)/.test(pathname);
  const isBrandPage = pathname === `/${locale}` || /\/(login|forgot-password)(\/|$)/.test(pathname);

  useEffect(() => {
    const refresh = () => setHasToken(Boolean(getToken()));
    refresh();
    window.addEventListener("auth-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("auth-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (isDashboard || isBrandPage) {
    return <>{children}</>;
  }

  if (isAuthPage) {
    return (
      <>
        <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher compact />
        </div>
        {children}
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/80 bg-surface/90 backdrop-blur-md">
        <div className="flex min-h-[var(--topbar-height)] w-full items-center justify-between gap-3 px-[var(--page-padding-x)]">
          <Link href={`/${locale}`} className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 items-center justify-center overflow-hidden rounded-[var(--radius-control)] bg-[var(--logo-tile)]">
              <Image src="/ltf-logo.svg" alt="LTF" width={80} height={24} className="h-5 w-auto" />
            </div>
            <span className="truncate text-sm font-semibold tracking-tight">{t("appTitle")}</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <LanguageSwitcher compact />
            {hasToken ? (
              <Button
                variant="outline"
                onClick={async () => {
                  await logout();
                  clearToken();
                  router.push(`/${locale}/login`);
                }}
              >
                {t("signOut")}
              </Button>
            ) : (
              <Button asChild variant="primary">
                <Link href={`/${locale}/login`}>{t("signIn")}</Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
