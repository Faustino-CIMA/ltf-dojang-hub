"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Trash2 } from "lucide-react";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { EmptyState } from "@/components/club-admin/empty-state";
import { useClubSelection } from "@/components/club-selection-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { getMembers } from "@/lib/club-admin-api";
import { downloadClubStatement } from "@/lib/club-finance-api";
import { LuAddressFields, type AddressValue } from "@/components/clubmgmt/lu-address-fields";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FamilyRecord,
  addFamilyMember,
  addFamilyParent,
  createFamily,
  findContactMemberMatches,
  listFamilies,
  removeFamilyMember,
  updateFamily,
  type ContactMemberMatch,
} from "@/lib/clubmgmt-api";
import { formatFirstName, formatLastName } from "@/lib/person-name";

const emptyAddress = (): AddressValue => ({
  postal_code: "",
  locality: "",
  street: "",
  house_number: "",
  line2: "",
  country: "Luxembourg",
  use_for_invoice: true,
});

function recipientValue(family: FamilyRecord) {
  if (family.bill_to_person) return `person:${family.bill_to_person}`;
  if (family.invoice_member) return `member:${family.invoice_member}`;
  const adult = family.memberships.find((row) => !row.is_underage);
  return adult ? `member:${adult.member}` : "";
}

const fieldClass =
  "block h-[var(--control-height)] w-full max-w-sm rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 text-sm";

type ClubMember = { id: number; first_name: string; last_name: string };

function todayYear() {
  return String(new Date().getFullYear());
}

export default function ClubFamiliesPage() {
  const t = useTranslations("ClubMgmt");
  const locale = useLocale();
  const { selectedClubId } = useClubSelection();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [families, setFamilies] = useState<FamilyRecord[]>([]);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [openFamilies, setOpenFamilies] = useState<Record<number, boolean>>({});
  const [parentFamily, setParentFamily] = useState<FamilyRecord | null>(null);
  const [parentDraft, setParentDraft] = useState({
    first_name: "",
    last_name: "",
    relation: "mother",
    email: "",
    phone: "",
    is_emergency: true,
  });
  const [parentAddress, setParentAddress] = useState<AddressValue>(emptyAddress());
  const [parentMatches, setParentMatches] = useState<ContactMemberMatch[]>([]);
  const [differentParent, setDifferentParent] = useState(false);
  const [chosenParentId, setChosenParentId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (selectedClubId == null) {
      return;
    }
    setErrorMessage(null);
    try {
      const [nextFamilies, list] = await Promise.all([listFamilies(selectedClubId), getMembers()]);
      setFamilies(nextFamilies);
      setMembers(list.map((row) => ({ id: row.id, first_name: row.first_name, last_name: row.last_name })));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    }
  }, [selectedClubId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!parentFamily) return;
    const firstName = parentDraft.first_name.trim();
    const lastName = parentDraft.last_name.trim();
    if (!selectedClubId || firstName.length < 2 || lastName.length < 2) {
      setParentMatches([]);
      setChosenParentId(null);
      return;
    }
    const exclude = parentFamily.memberships[0]?.member ?? 0;
    const handle = window.setTimeout(() => {
      void findContactMemberMatches(selectedClubId, firstName, lastName, exclude)
        .then((rows) => {
          const familyIds = new Set(parentFamily.memberships.map((row) => row.member));
          const next = rows.filter((row) => !familyIds.has(row.id));
          setParentMatches(next);
          setChosenParentId((current) => (next.some((row) => row.id === current) ? current : next.length === 1 ? next[0].id : null));
        })
        .catch(() => setParentMatches([]));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [parentDraft.first_name, parentDraft.last_name, parentFamily, selectedClubId]);

  const membersInFamilies = useMemo(() => {
    const used = new Set<number>();
    for (const family of families) {
      for (const row of family.memberships) {
        used.add(row.member);
      }
    }
    return used;
  }, [families]);

  return (
    <ClubAdminLayout title={t("familiesTitle")} subtitle={t("familiesBillingHint")}>
      <div className="space-y-6">
      <ActionNotices
        error={errorMessage}
        success={successMessage}
        onDismiss={() => {
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
      />

      <FormPanel>
        <h2 className="text-section text-foreground">{t("createFamily")}</h2>
        <div className="mt-4 max-w-md space-y-3">
          <div className="space-y-2">
            <Label htmlFor="family-name">{t("familyName")}</Label>
            <Input
              id="family-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("familyName")}
            />
          </div>
          <Button
            type="button"
            variant="primary"
            disabled={isSaving}
            onClick={async () => {
              if (selectedClubId == null) {
                return;
              }
              if (!name.trim()) {
                setErrorMessage(t("familyNeedName"));
                return;
              }
              setIsSaving(true);
              try {
                await createFamily({ club: selectedClubId, name: name.trim() });
                setName("");
                setSuccessMessage(t("saved"));
                await load();
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : t("saveError"));
              } finally {
                setIsSaving(false);
              }
            }}
          >
            {t("createFamily")}
          </Button>
        </div>
      </FormPanel>

      {families.length === 0 ? (
        <EmptyState title={t("familiesEmptyTitle")} description={t("familiesEmptySubtitle")} />
      ) : (
        <div className="space-y-4">
          {families.map((family) => {
            const availableMembers = members.filter((member) => !membersInFamilies.has(member.id));
            const open = Boolean(openFamilies[family.id]);
            return (
              <FormPanel key={family.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    aria-expanded={open}
                    onClick={() => setOpenFamilies((current) => ({ ...current, [family.id]: !current[family.id] }))}
                  >
                    <ChevronDown
                      className={`mt-1 h-4 w-4 shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`}
                    />
                    <span className="min-w-0">
                      <span className="block text-section text-foreground">{family.name}</span>
                      <span className="mt-1 block text-sm text-muted">
                        {t("familyMemberCount", { count: family.memberships.length })}
                      </span>
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving || selectedClubId == null}
                      onClick={async () => {
                        if (selectedClubId == null) {
                          return;
                        }
                        setErrorMessage(null);
                        try {
                          await downloadClubStatement({
                            clubId: selectedClubId,
                            year: Number(todayYear()),
                            familyId: family.id,
                          });
                        } catch (error) {
                          setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                        }
                      }}
                    >
                      {t("downloadStatementAction")}
                    </Button>
                    {family.memberships.length > 0 ? (
                      <Button asChild variant="outline">
                        <Link href={`/${locale}/dashboard/club/families/${family.id}/invoice`}>
                          {t("familyInvoicePreview")}
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>

                {open ? (
                <>
                <p className="mt-4 text-sm text-muted">{t("familyInvoiceHint")}</p>
                {family.memberships.length === 0 ? (
                  <p className="mt-4 text-sm text-muted">{t("noMembers")}</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {family.memberships.map((row, index) => (
                      <li
                        key={row.member}
                        className="flex items-center justify-between gap-3 rounded-[var(--radius-form)] border border-border bg-secondary/40 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <StatusBadge label={String(index + 1)} tone={index === 0 ? "info" : "neutral"} />
                          <span className="truncate font-medium text-foreground">{row.member_name}</span>
                          {row.is_underage ? <span className="text-xs text-muted">{t("minorMember")}</span> : null}
                          {row.dob_missing ? <span className="text-xs text-muted">{t("dobMissing")}</span> : null}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={isSaving}
                          aria-label={t("familyRemoveMember", { name: row.member_name })}
                          onClick={async () => {
                            setIsSaving(true);
                            try {
                              await removeFamilyMember(family.id, row.member);
                              setSuccessMessage(t("familyMemberRemoved", { name: row.member_name }));
                              await load();
                            } catch (error) {
                              setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                            } finally {
                              setIsSaving(false);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-4 space-y-3">
                  <p className="text-sm text-muted">{t("familyOneInvoiceHint")}</p>
                  {family.needs_recipient ? (
                    <p className="rounded-[var(--radius-form)] border border-border bg-secondary/50 px-3 py-2 text-sm">
                      {t("chooseBillRecipient")}
                    </p>
                  ) : null}
                  <div className="flex max-w-sm flex-col gap-2">
                    <Label htmlFor={`bill-to-${family.id}`}>{t("receivesTheBill")}</Label>
                    <select
                      id={`bill-to-${family.id}`}
                      className={fieldClass}
                      value={recipientValue(family)}
                      disabled={isSaving || family.memberships.length === 0}
                      onChange={async (event) => {
                        const value = event.target.value;
                        if (!value || value === "add-parent") {
                          if (value === "add-parent") {
                            setParentDraft({ first_name: "", last_name: "", relation: "mother", email: "", phone: "", is_emergency: true });
                            setParentAddress(emptyAddress());
                            setParentMatches([]);
                            setDifferentParent(false);
                            setChosenParentId(null);
                            setParentFamily(family);
                          }
                          return;
                        }
                        setIsSaving(true);
                        setErrorMessage(null);
                        try {
                          if (value.startsWith("member:")) {
                            await updateFamily(family.id, { invoice_member: Number(value.slice(7)), bill_to_person: null });
                          } else if (value.startsWith("person:")) {
                            await updateFamily(family.id, { bill_to_person: Number(value.slice(7)), invoice_member: null });
                          }
                          await load();
                        } catch (error) {
                          setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                    >
                      <option value="">{t("chooseBillRecipient")}</option>
                      {family.memberships.map((row) => (
                        <option key={`member-${row.member}`} value={`member:${row.member}`}>
                          {row.member_name}
                          {row.is_underage ? ` (${t("minorMember")})` : ""}
                        </option>
                      ))}
                      {family.guardians.map((guardian) => {
                        const memberValue = guardian.member_id ? `member:${guardian.member_id}` : "";
                        const alreadyListed = guardian.member_id
                          ? family.memberships.some((row) => row.member === guardian.member_id)
                          : false;
                        if (alreadyListed) return null;
                        const value = memberValue || `person:${guardian.person_id}`;
                        return (
                          <option key={value} value={value}>
                            {guardian.name} ({t(`relation_${guardian.relation}`)})
                          </option>
                        );
                      })}
                      <option value="add-parent">{t("addParentOrGuardian")}</option>
                    </select>
                  </div>
                  {family.bill_to_person ? (
                    <div className="flex max-w-sm flex-col gap-2">
                      <Label htmlFor={`bill-delivery-${family.id}`}>{t("deliveryLabel")}</Label>
                      <select
                        id={`bill-delivery-${family.id}`}
                        className={fieldClass}
                        value={family.bill_to_delivery}
                        disabled={isSaving}
                        onChange={async (event) => {
                          setIsSaving(true);
                          try {
                            await updateFamily(family.id, { bill_to_delivery: event.target.value });
                            await load();
                          } catch (error) {
                            setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                      >
                        <option value="">{t("billToDeliveryAuto")}</option>
                        <option value="email">{t("deliveryEmail")}</option>
                        <option value="post">{t("deliveryPost")}</option>
                        <option value="hand">{t("deliveryHand")}</option>
                      </select>
                    </div>
                  ) : null}
                  <div className="flex max-w-sm flex-col gap-2">
                  <Label htmlFor={`add-member-${family.id}`}>{t("addMember")}</Label>
                  <select
                    id={`add-member-${family.id}`}
                    className={fieldClass}
                    value=""
                    disabled={isSaving || availableMembers.length === 0}
                    onChange={async (event) => {
                      const id = Number(event.target.value);
                      if (!id) {
                        return;
                      }
                      setIsSaving(true);
                      try {
                        await addFamilyMember(family.id, id);
                        await load();
                      } catch (error) {
                        setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                  >
                    <option value="">{t("addMember")}</option>
                    {availableMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.first_name} {member.last_name}
                      </option>
                    ))}
                  </select>
                  </div>
                </div>
                </>
                ) : null}
              </FormPanel>
            );
          })}
        </div>
      )}
      </div>

      <Modal
        isOpen={parentFamily !== null}
        onClose={() => setParentFamily(null)}
        title={t("addParentOrGuardian")}
        description={parentFamily ? parentFamily.name : undefined}
      >
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="parent-first-name">{t("firstName")}</Label>
              <Input
                id="parent-first-name"
                value={parentDraft.first_name}
                onChange={(event) => setParentDraft({ ...parentDraft, first_name: event.target.value })}
                onBlur={() => setParentDraft((current) => ({ ...current, first_name: formatFirstName(current.first_name) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent-last-name">{t("lastName")}</Label>
              <Input
                id="parent-last-name"
                value={parentDraft.last_name}
                onChange={(event) => setParentDraft({ ...parentDraft, last_name: event.target.value.toLocaleUpperCase("fr-LU") })}
                onBlur={() => setParentDraft((current) => ({ ...current, last_name: formatLastName(current.last_name) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent-relation">{t("relationLabel")}</Label>
              <select
                id="parent-relation"
                className="block h-[var(--control-height)] w-full rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 text-sm"
                value={parentDraft.relation}
                onChange={(event) => setParentDraft({ ...parentDraft, relation: event.target.value })}
              >
                {["father", "mother", "guardian", "grandfather", "grandmother", "uncle", "aunt", "other"].map((relation) => (
                  <option key={relation} value={relation}>
                    {t(`relation_${relation}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent-email">{t("parentEmail")}</Label>
              <Input
                id="parent-email"
                type="email"
                value={parentDraft.email}
                onChange={(event) => setParentDraft({ ...parentDraft, email: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent-phone">{t("phone")}</Label>
              <Input
                id="parent-phone"
                value={parentDraft.phone}
                onChange={(event) => setParentDraft({ ...parentDraft, phone: event.target.value })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={parentDraft.is_emergency}
              onCheckedChange={(checked) => setParentDraft({ ...parentDraft, is_emergency: Boolean(checked) })}
            />
            {t("emergency")}
          </label>
          <LuAddressFields value={parentAddress} onChange={setParentAddress} />
          {parentMatches.length > 0 && !differentParent ? (
            <div className="rounded-[var(--radius-form)] border border-border bg-secondary/50 p-3 text-sm">
              <p className="font-medium">{t("contactMatchesTitle")}</p>
              <div className="mt-2 space-y-2">
                {parentMatches.map((match) => (
                  <label key={match.id} className="flex items-center gap-2">
                    {parentMatches.length > 1 ? (
                      <input
                        type="radio"
                        name="parent-member-match"
                        checked={chosenParentId === match.id}
                        onChange={() => setChosenParentId(match.id)}
                      />
                    ) : null}
                    <span>
                      {match.name}
                      {match.ltf_licenseid ? ` · ${match.ltf_licenseid}` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {parentMatches.length > 0 ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={differentParent} onCheckedChange={(checked) => setDifferentParent(Boolean(checked))} />
              {t("contactDifferentPerson")}
            </label>
          ) : null}
          <div className="flex">
            <Button
              type="button"
              variant="primary"
              className="w-full sm:ml-auto sm:w-auto"
              disabled={isSaving}
              onClick={async () => {
                if (!parentFamily) return;
                const firstName = formatFirstName(parentDraft.first_name);
                const lastName = formatLastName(parentDraft.last_name);
                if (!firstName || !lastName) {
                  setErrorMessage(t("contactRequired"));
                  return;
                }
                if (parentMatches.length > 1 && !differentParent && !chosenParentId) {
                  setErrorMessage(t("contactChooseMember"));
                  return;
                }
                setIsSaving(true);
                setErrorMessage(null);
                try {
                  await addFamilyParent(parentFamily.id, {
                    first_name: firstName,
                    last_name: lastName,
                    relation: parentDraft.relation,
                    email: parentDraft.email.trim(),
                    phone: parentDraft.phone.trim(),
                    is_emergency: parentDraft.is_emergency,
                    different_person: differentParent,
                    member_id: differentParent ? undefined : chosenParentId,
                    street: parentAddress.street,
                    house_number: parentAddress.house_number,
                    line2: parentAddress.line2,
                    postal_code: parentAddress.postal_code,
                    locality: parentAddress.locality,
                    country: parentAddress.country,
                  });
                  setParentFamily(null);
                  setSuccessMessage(t("parentSaved"));
                  await load();
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                } finally {
                  setIsSaving(false);
                }
              }}
            >
              {isSaving ? t("saving") : t("saveItem")}
            </Button>
          </div>
        </div>
      </Modal>
    </ClubAdminLayout>
  );
}
