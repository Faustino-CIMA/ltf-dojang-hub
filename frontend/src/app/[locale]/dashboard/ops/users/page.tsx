"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { OpsUsersBoard } from "@/components/ops/ops-users-board";
import { OpsLayout } from "@/components/ops/ops-layout";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { apiRequest } from "@/lib/api";
import { getOpsUsers, type OpsUser } from "@/lib/ops-api";

export default function OpsUsersPage() {
  const t = useTranslations("Ops");
  const [users, setUsers] = useState<OpsUser[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const page = await getOpsUsers({ q: query || undefined });
      setUsers(page.results);
    } catch (error) {
      setUsers([]);
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [query, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void apiRequest<{ id: number }>("/api/auth/me/")
      .then((me) => setCurrentUserId(me.id))
      .catch(() => setCurrentUserId(null));
  }, []);

  return (
    <OpsLayout title={t("usersTitle")} subtitle={t("usersSubtitle")} hintSubtitle>
      <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
      <OpsUsersBoard
        users={users}
        isLoading={isLoading}
        query={query}
        onQueryChange={setQuery}
        onChanged={load}
        currentUserId={currentUserId}
      />
    </OpsLayout>
  );
}
