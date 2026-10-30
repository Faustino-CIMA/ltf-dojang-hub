"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { EntityTable } from "@/components/club-admin/entity-table";
import { OpsLayout } from "@/components/ops/ops-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, RequiredForm } from "@/components/ui/label";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { LoadingCardGrid } from "@/components/ui/loading-card";
import { RowActionMenu } from "@/components/ui/row-action-menu";
import { SidePanel } from "@/components/ui/side-panel";
import { apiRequest } from "@/lib/api";

type MapDesk = { desk: string; level: string };
type OfficeRow = { office: string; desks: MapDesk[] };
type GrantRow = {
  id: number;
  user_id: number;
  name: string;
  username: string;
  desk: string;
  level: string;
  club_name: string;
  source: string;
  valid_until: string | null;
  reason: string;
};
type ContactRow = { id: number; name: string; user_id: number | null };

const OFFICE_KEYS = {
  president: "officePresident",
  vice_president: "officeVicePresident",
  secretary_general: "officeSecretaryGeneral",
  treasurer: "officeTreasurer",
  secretary: "officeSecretary",
  committee_member: "officeCommitteeMember",
  cashier_auditor: "officeCashierAuditor",
  other: "officeOther",
} as const;

export default function OpsDesksPage() {
  const t = useTranslations("Ops");
  const [offices, setOffices] = useState<OfficeRow[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<OfficeRow | null>(null);
  const [mapDesks, setMapDesks] = useState<MapDesk[]>([]);
  const [grantOpen, setGrantOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [desk, setDesk] = useState("ltf_finance");
  const [level, setLevel] = useState("full");
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [personId, setPersonId] = useState("");
  const [loginId, setLoginId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [map, grantPage, contactPage] = await Promise.all([
        apiRequest<{ offices: OfficeRow[] }>("/api/ops/desks/map/"),
        apiRequest<{ results: GrantRow[] }>("/api/ops/desks/grants/"),
        apiRequest<{ results: ContactRow[] }>("/api/ops/desks/contacts/"),
      ]);
      setOffices(map.offices);
      setGrants(grantPage.results);
      setContacts(contactPage.results);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const officeLabel = (office: string) => (office in OFFICE_KEYS ? t(OFFICE_KEYS[office as keyof typeof OFFICE_KEYS]) : office);
  const deskLabel = (value: string) => (value === "ltf_finance" ? t("deskFinance") : value === "ltf_admin" ? t("deskAdmin") : value === "member" ? t("deskMember") : value);
  const levelLabel = (value: string) => (value === "read_only" ? t("deskReadOnly") : t("deskFull"));

  const saveMap = async () => {
    if (!editing) return;
    setErrorMessage(null);
    try {
      await apiRequest("/api/ops/desks/map/", {
        method: "POST",
        body: JSON.stringify({ office: editing.office, desks: mapDesks.filter((row) => row.desk) }),
      });
      setSuccessMessage(t("deskSaved"));
      setEditing(null);
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    }
  };

  const saveGrant = async () => {
    setErrorMessage(null);
    try {
      await apiRequest("/api/ops/desks/grants/", {
        method: "POST",
        body: JSON.stringify({
          user_id: Number(userId),
          desk,
          level,
          reason,
          valid_until: until || null,
        }),
      });
      setSuccessMessage(t("deskSaved"));
      setGrantOpen(false);
      setReason("");
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    }
  };

  const linkContact = async () => {
    setErrorMessage(null);
    try {
      await apiRequest("/api/ops/desks/contacts/", {
        method: "POST",
        body: JSON.stringify({ person_id: Number(personId), user_id: Number(loginId) }),
      });
      setSuccessMessage(t("deskLinked"));
      setLinkOpen(false);
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    }
  };

  return (
    <OpsLayout title={t("desksTitle")} subtitle={t("desksSubtitle")}>
      <ActionNotices
        error={errorMessage}
        success={successMessage}
        onDismiss={() => {
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
      />
      {loading ? (
        <LoadingCardGrid title={t("desksTitle")} description={t("desksSubtitle")} />
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-section text-foreground">{t("deskMapTitle")}</h2>
            <EntityTable
              clientSort
              rows={offices.map((row) => ({ ...row, id: row.office }))}
              columns={[
                { key: "office", header: t("deskOffice"), sortable: true, sortValue: (row) => officeLabel(row.office), render: (row) => officeLabel(row.office) },
                {
                  key: "desks",
                  header: t("deskDesk"),
                  render: (row) => row.desks.map((item) => `${deskLabel(item.desk)} · ${levelLabel(item.level)}`).join(", ") || "—",
                },
                {
                  key: "actions",
                  header: <span className="sr-only">{t("deskRowActions")}</span>,
                  render: (row) => (
                    <RowActionMenu
                      label={t("deskRowActions")}
                      actions={[
                        {
                          key: "edit",
                          label: t("deskEdit"),
                          icon: <Pencil aria-hidden="true" />,
                          onSelect: () => {
                            setEditing(row);
                            setMapDesks(row.desks.length ? row.desks : [{ desk: "", level: "full" }]);
                          },
                        },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-section text-foreground">{t("deskGrantsTitle")}</h2>
              <Button type="button" onClick={() => setGrantOpen(true)}>{t("deskAdd")}</Button>
            </div>
            <EntityTable
              clientSort
              rows={grants}
              columns={[
                { key: "name", header: t("deskName"), sortable: true, sortValue: (row) => row.name, render: (row) => row.name },
                { key: "desk", header: t("deskDesk"), sortable: true, sortValue: (row) => row.desk, render: (row) => deskLabel(row.desk) },
                { key: "level", header: t("deskLevel"), sortable: true, sortValue: (row) => row.level, render: (row) => levelLabel(row.level) },
                { key: "source", header: t("deskSource"), sortable: true, sortValue: (row) => row.source, render: (row) => row.source },
                { key: "until", header: t("deskUntil"), sortable: true, sortValue: (row) => row.valid_until || "", render: (row) => row.valid_until || t("deskOpen") },
                {
                  key: "actions",
                  header: <span className="sr-only">{t("deskRowActions")}</span>,
                  render: (row) => (
                    <RowActionMenu
                      label={t("deskRowActions")}
                      actions={[
                        {
                          key: "end",
                          label: t("deskEnd"),
                          icon: <Trash2 aria-hidden="true" />,
                          destructive: true,
                          confirmLabel: t("deskEndConfirm"),
                          onSelect: () => {
                            void apiRequest(`/api/ops/desks/grants/${row.id}/end/`, { method: "POST" }).then(() => load());
                          },
                        },
                      ]}
                    />
                  ),
                },
              ]}
            />
            <Button type="button" variant="outline" onClick={() => setLinkOpen(true)}>{t("deskLinkTitle")}</Button>
          </section>
        </div>
      )}

      <SidePanel open={Boolean(editing)} title={editing ? officeLabel(editing.office) : ""} closeLabel={t("deskSave")} onClose={() => setEditing(null)}
        footer={<Button type="button" onClick={() => void saveMap()}>{t("deskSave")}</Button>}
      >
        <div className="space-y-3">
          {mapDesks.map((row, index) => (
            <div key={`${row.desk}-${index}`} className="grid grid-cols-2 gap-2">
              <Label htmlFor={`map-desk-${index}`}>{t("deskDesk")}</Label>
              <select id={`map-desk-${index}`} className="h-10 rounded-[var(--radius-form)] border border-border bg-surface px-2" value={row.desk} onChange={(event) => setMapDesks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, desk: event.target.value } : item))}>
                <option value="">—</option>
                <option value="ltf_admin">{t("deskAdmin")}</option>
                <option value="ltf_finance">{t("deskFinance")}</option>
                <option value="member">{t("deskMember")}</option>
              </select>
              <Label htmlFor={`map-level-${index}`}>{t("deskLevel")}</Label>
              <select id={`map-level-${index}`} className="h-10 rounded-[var(--radius-form)] border border-border bg-surface px-2" value={row.level} onChange={(event) => setMapDesks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, level: event.target.value } : item))}>
                <option value="full">{t("deskFull")}</option>
                <option value="read_only">{t("deskReadOnly")}</option>
              </select>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setMapDesks((current) => [...current, { desk: "ltf_finance", level: "read_only" }])}>{t("deskAdd")}</Button>
        </div>
      </SidePanel>

      <SidePanel open={grantOpen} title={t("deskAdd")} closeLabel={t("deskSave")} onClose={() => setGrantOpen(false)}
        footer={<Button type="submit" form="desk-grant-form">{t("deskSave")}</Button>}
      >
        <form id="desk-grant-form" onSubmit={(event) => { event.preventDefault(); void saveGrant(); }}>
          <RequiredForm className="space-y-3">
            <Label htmlFor="grant-user" required>{t("deskLogin")}</Label>
            <Input id="grant-user" required value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="1" />
            <Label htmlFor="grant-desk" required>{t("deskDesk")}</Label>
            <select id="grant-desk" className="h-10 w-full rounded-[var(--radius-form)] border border-border bg-surface px-2" value={desk} onChange={(event) => setDesk(event.target.value)}>
              <option value="ltf_finance">{t("deskFinance")}</option>
              <option value="ltf_admin">{t("deskAdmin")}</option>
            </select>
            <Label htmlFor="grant-level" required>{t("deskLevel")}</Label>
            <select id="grant-level" className="h-10 w-full rounded-[var(--radius-form)] border border-border bg-surface px-2" value={level} onChange={(event) => setLevel(event.target.value)}>
              <option value="full">{t("deskFull")}</option>
              <option value="read_only">{t("deskReadOnly")}</option>
            </select>
            <Label htmlFor="grant-until">{t("deskUntil")}</Label>
            <Input id="grant-until" type="date" value={until} onChange={(event) => setUntil(event.target.value)} required={level === "read_only"} />
            <Label htmlFor="grant-reason" required>{t("deskReason")}</Label>
            <Input id="grant-reason" required value={reason} onChange={(event) => setReason(event.target.value)} />
          </RequiredForm>
        </form>
      </SidePanel>

      <SidePanel open={linkOpen} title={t("deskLinkTitle")} closeLabel={t("deskSave")} onClose={() => setLinkOpen(false)}
        footer={<Button type="submit" form="desk-link-form">{t("deskSave")}</Button>}
      >
        <form id="desk-link-form" onSubmit={(event) => { event.preventDefault(); void linkContact(); }}>
          <RequiredForm className="space-y-3">
            <Label htmlFor="link-person" required>{t("deskPerson")}</Label>
            <select id="link-person" required className="h-10 w-full rounded-[var(--radius-form)] border border-border bg-surface px-2" value={personId} onChange={(event) => setPersonId(event.target.value)}>
              <option value="">—</option>
              {contacts.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
            <Label htmlFor="link-user" required>{t("deskLogin")}</Label>
            <Input id="link-user" required value={loginId} onChange={(event) => setLoginId(event.target.value)} />
          </RequiredForm>
        </form>
      </SidePanel>
    </OpsLayout>
  );
}
