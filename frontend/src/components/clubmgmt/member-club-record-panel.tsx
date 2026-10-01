"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  convertPersonToMember,
  findContactMemberMatches,
  linkContact,
  type ContactMemberMatch,
  createCheckup,
  createContact,
  createPerson,
  getMemberRecord,
  listCheckups,
  listContacts,
  listFees,
  saveMemberRecord,
  updateContact,
  updatePerson,
  type MemberContactRow,
  type MemberRecord,
} from "@/lib/clubmgmt-api";
import { LuAddressFields, type AddressValue } from "@/components/clubmgmt/lu-address-fields";
import {
  nationalityCodeFromStored,
  nationalityLabel,
  nationalityOptions,
  normalizePhoneLabel,
  PHONE_LABELS,
} from "@/lib/nationalities";
import { formatFirstName, formatLastName } from "@/lib/person-name";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RELATIONS = ["father", "mother", "grandfather", "grandmother", "uncle", "aunt", "brother", "sister", "guardian", "partner", "other"] as const;
const PARENT_RELATIONS = new Set(["father", "mother", "guardian", "grandfather", "grandmother"]);
const NONE_VALUE = "none";

type ListKind = "email" | "phone" | "address" | "checkup" | "contact";

type Props = {
  memberId: number;
  clubId: number;
  overviewEmail?: string;
};

const emptyAddress = (): AddressValue => ({
  postal_code: "",
  locality: "",
  street: "",
  house_number: "",
  line2: "",
  country: "Luxembourg",
  use_for_invoice: false,
});

function deliveryPreview(record: MemberRecord, t: ReturnType<typeof useTranslations>) {
  const invoiceEmail = record.emails.find((row) => row.use_for_invoice && row.email.trim())?.email
    || record.emails.find((row) => row.email.trim())?.email;
  const invoiceAddress = record.addresses.find((row) => row.use_for_invoice)
    || record.addresses.find((row) => row.street || row.postal_code || row.locality);
  if (record.invoice_delivery === "email" && invoiceEmail) {
    return t("deliveryPreviewEmail", { email: invoiceEmail });
  }
  if (record.invoice_delivery === "post" && invoiceAddress) {
    return t("deliveryPreviewPost", {
      address: [invoiceAddress.street, invoiceAddress.house_number, invoiceAddress.postal_code, invoiceAddress.locality, invoiceAddress.country]
        .filter(Boolean)
        .join(" "),
    });
  }
  if (record.invoice_delivery === "hand") {
    return t("deliveryPreviewHand", { name: record.member_name });
  }
  if (invoiceEmail) return t("deliveryPreviewEmail", { email: invoiceEmail });
  if (invoiceAddress) {
    return t("deliveryPreviewPost", {
      address: [invoiceAddress.street, invoiceAddress.house_number, invoiceAddress.postal_code, invoiceAddress.locality, invoiceAddress.country]
        .filter(Boolean)
        .join(" "),
    });
  }
  return t("deliveryPreviewHandFallback", { name: record.member_name });
}

function DraftActions({
  onSave,
  onCancel,
  saving,
  saveLabel,
  cancelLabel,
}: {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
  cancelLabel: string;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" variant="primary" disabled={saving} onClick={onSave}>
        {saveLabel}
      </Button>
      <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
        {cancelLabel}
      </Button>
    </div>
  );
}

function NationalityField({
  label,
  value,
  onChange,
  noneLabel,
  locale,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  noneLabel: string;
  locale: string;
}) {
  const options = useMemo(() => {
    const listed = nationalityOptions(locale);
    const stored = nationalityCodeFromStored(value);
    if (stored && !listed.some((row) => row.code === stored)) {
      return [{ code: stored, name: nationalityLabel(stored, locale) }, ...listed];
    }
    return listed;
  }, [locale, value]);
  const selected = nationalityCodeFromStored(value) || NONE_VALUE;

  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">
        <Select
          value={selected}
          onValueChange={(next) => onChange(next === NONE_VALUE ? "" : next)}
          modal={false}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={label} />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={NONE_VALUE}>{noneLabel}</SelectItem>
            {options.map((row) => (
              <SelectItem key={row.code} value={row.code}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function phoneLabelText(label: string, t: ReturnType<typeof useTranslations>) {
  const code = normalizePhoneLabel(label);
  if (!code) {
    return "";
  }
  return t(`phoneLabel_${code}`);
}

export function MemberClubRecordPanel({ memberId, clubId, overviewEmail = "" }: Props) {
  const t = useTranslations("ClubMgmt");
  const locale = useLocale();
  const router = useRouter();
  const [record, setRecord] = useState<MemberRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [checkups, setCheckups] = useState<Array<{ id: number; checked_on: string; notes: string }>>([]);
  const [contacts, setContacts] = useState<MemberContactRow[]>([]);
  const [convertingPersonId, setConvertingPersonId] = useState<number | null>(null);
  const [fees, setFees] = useState<Array<{ id: number; name: string; amount: string }>>([]);
  const [adding, setAdding] = useState<ListKind | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [emailDraft, setEmailDraft] = useState({ email: "", use_for_invoice: true });
  const [phoneDraft, setPhoneDraft] = useState({ number: "", label: "mobile" });
  const [addressDraft, setAddressDraft] = useState<AddressValue>(emptyAddress());
  const [checkupDraft, setCheckupDraft] = useState({ checked_on: "", notes: "" });
  const [contactDraft, setContactDraft] = useState({
    first_name: "",
    last_name: "",
    relation: "father",
    is_emergency: true,
    email: "",
    phone: "",
    also_family: false,
  });
  const [contactAddress, setContactAddress] = useState<AddressValue>(emptyAddress());
  const [memberMatches, setMemberMatches] = useState<ContactMemberMatch[]>([]);
  const [differentPerson, setDifferentPerson] = useState(false);
  const [chosenMemberId, setChosenMemberId] = useState<number | null>(null);

  useEffect(() => {
    if (adding !== "contact") {
      return;
    }
    const firstName = contactDraft.first_name.trim();
    const lastName = contactDraft.last_name.trim();
    if (!clubId || firstName.length < 2 || lastName.length < 2) {
      setMemberMatches([]);
      setChosenMemberId(null);
      return;
    }
    const handle = window.setTimeout(() => {
      void findContactMemberMatches(clubId, firstName, lastName, memberId)
        .then((rows) => {
          setMemberMatches(rows);
          setChosenMemberId((current) => (rows.some((row) => row.id === current) ? current : rows.length === 1 ? rows[0].id : null));
        })
        .catch(() => setMemberMatches([]));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [adding, clubId, contactDraft.first_name, contactDraft.last_name, memberId]);

  const load = async () => {
    setErrorMessage(null);
    try {
      const [nextRecord, nextCheckups, nextContacts, nextFees] = await Promise.all([
        getMemberRecord(memberId),
        listCheckups(memberId),
        listContacts(memberId),
        listFees(clubId),
      ]);
      setFees(nextFees);
      setRecord({
        ...nextRecord,
        invoice_delivery: nextRecord.invoice_delivery || "email",
        membership_fee: nextRecord.membership_fee ?? null,
        nationality_1: nationalityCodeFromStored(nextRecord.nationality_1),
        nationality_2: nationalityCodeFromStored(nextRecord.nationality_2),
        emails: nextRecord.emails.filter((row) => row.email.trim()),
        phones: nextRecord.phones.filter((row) => row.number.trim()),
        addresses: nextRecord.addresses.filter(
          (row) => row.street.trim() || row.postal_code.trim() || row.locality.trim()
        ),
      });
      setCheckups(nextCheckups);
      setContacts(nextContacts);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("loadError"));
    }
  };

  useEffect(() => {
    void load();
  }, [memberId, clubId]);

  const persist = async (next: MemberRecord) => {
    const saved = await saveMemberRecord(memberId, {
      ...next,
      nationality_1: nationalityCodeFromStored(next.nationality_1),
      nationality_2: nationalityCodeFromStored(next.nationality_2),
      emails: next.emails.filter((row) => row.email.trim()),
      phones: next.phones.filter((row) => row.number.trim()),
      addresses: next.addresses.filter(
        (row) => row.street.trim() || row.postal_code.trim() || row.locality.trim()
      ),
    });
    const cleaned: MemberRecord = {
      ...saved,
      invoice_delivery: saved.invoice_delivery || "email",
      membership_fee: saved.membership_fee ?? null,
      nationality_1: nationalityCodeFromStored(saved.nationality_1),
      nationality_2: nationalityCodeFromStored(saved.nationality_2),
      emails: saved.emails.filter((row) => row.email.trim()),
      phones: saved.phones.filter((row) => row.number.trim()),
      addresses: saved.addresses.filter(
        (row) => row.street.trim() || row.postal_code.trim() || row.locality.trim()
      ),
    };
    setRecord(cleaned);
    setSuccessMessage(t("saved"));
    return cleaned;
  };

  if (!record) {
    return <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />;
  }

  const saveIdentity = async () => {
    setErrorMessage(null);
    try {
      await persist(record);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    }
  };

  const trimmedOverview = overviewEmail.trim();
  const overviewEmailInUse = record.emails.some(
    (row) => row.email.trim().toLowerCase() === trimmedOverview.toLowerCase()
  );

  const closeDraft = () => {
    setAdding(null);
    setEditingIndex(null);
    setEmailDraft({ email: "", use_for_invoice: record.emails.every((row) => !row.use_for_invoice) });
    setPhoneDraft({ number: "", label: "mobile" });
    setAddressDraft({ ...emptyAddress(), use_for_invoice: record.addresses.every((row) => !row.use_for_invoice) });
    setCheckupDraft({ checked_on: "", notes: "" });
    setContactDraft({ first_name: "", last_name: "", relation: "father", is_emergency: true, email: "", phone: "", also_family: false });
    setContactAddress(emptyAddress());
  };

  const handleReuseOverviewEmail = async () => {
    if (!trimmedOverview) return;
    setErrorMessage(null);
    try {
      const useForInvoice = record.emails.every((row) => !row.use_for_invoice);
      await persist({
        ...record,
        emails: [...record.emails, { id: 0, email: trimmedOverview, use_for_invoice: useForInvoice }],
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    }
  };

  const startAdd = (kind: ListKind) => {
    closeDraft();
    if (kind === "email") {
      setEmailDraft({ email: "", use_for_invoice: record.emails.every((row) => !row.use_for_invoice) });
    }
    if (kind === "phone") {
      setPhoneDraft({ number: "", label: "mobile" });
    }
    if (kind === "address") {
      setAddressDraft({ ...emptyAddress(), use_for_invoice: record.addresses.every((row) => !row.use_for_invoice) });
    }
    if (kind === "checkup") {
      setCheckupDraft({ checked_on: "", notes: "" });
    }
    if (kind === "contact") {
      setContactDraft({
        first_name: "",
        last_name: "",
        relation: "father",
        is_emergency: true,
        email: "",
        phone: "",
        also_family: Boolean(record.family_name),
      });
      setContactAddress(emptyAddress());
    }
    setAdding(kind);
    setEditingIndex(null);
  };

  const startEditEmail = (index: number) => {
    const row = record.emails[index];
    setAdding("email");
    setEditingIndex(index);
    setEmailDraft({ email: row.email, use_for_invoice: row.use_for_invoice });
  };

  const startEditPhone = (index: number) => {
    const row = record.phones[index];
    setAdding("phone");
    setEditingIndex(index);
    setPhoneDraft({ number: row.number, label: normalizePhoneLabel(row.label) || "mobile" });
  };

  const startEditAddress = (index: number) => {
    const row = record.addresses[index];
    setAdding("address");
    setEditingIndex(index);
    setAddressDraft({
      postal_code: row.postal_code,
      locality: row.locality,
      street: row.street,
      house_number: row.house_number,
      line2: row.line2,
      country: row.country || "Luxembourg",
      use_for_invoice: row.use_for_invoice,
    });
  };

  const startEditContact = (index: number) => {
    const row = contacts[index];
    setAdding("contact");
    setEditingIndex(index);
    const email = row.person_detail.emails?.find((item) => item.use_for_invoice)?.email || row.person_detail.emails?.[0]?.email || "";
    const phone = row.person_detail.phones?.[0]?.number || "";
    const address = row.person_detail.addresses?.find((item) => item.use_for_invoice) || row.person_detail.addresses?.[0];
    setContactDraft({
      first_name: row.person_detail.first_name,
      last_name: row.person_detail.last_name,
      relation: row.relation,
      is_emergency: row.is_emergency,
      email,
      phone,
      also_family: false,
    });
    setContactAddress(
      address
        ? {
            street: address.street,
            house_number: address.house_number,
            line2: address.line2,
            postal_code: address.postal_code,
            locality: address.locality,
            country: address.country || "Luxembourg",
            use_for_invoice: true,
          }
        : emptyAddress(),
    );
  };

  const saveEmailDraft = async () => {
    if (!emailDraft.email.trim()) {
      setErrorMessage(t("emailRequired"));
      return;
    }
    setSavingDraft(true);
    setErrorMessage(null);
    try {
      const targetIndex = editingIndex;
      const nextRow = {
        id: targetIndex !== null ? record.emails[targetIndex].id : 0,
        email: emailDraft.email.trim(),
        use_for_invoice: emailDraft.use_for_invoice,
      };
      const emails = targetIndex !== null
        ? record.emails.map((row, index) => (index === targetIndex ? nextRow : row))
        : [...record.emails, nextRow];
      await persist({
        ...record,
        emails: emailDraft.use_for_invoice
          ? emails.map((row, index) => ({
              ...row,
              use_for_invoice: targetIndex !== null ? index === targetIndex : index === emails.length - 1,
            }))
          : emails,
      });
      closeDraft();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setSavingDraft(false);
    }
  };

  const savePhoneDraft = async () => {
    if (!phoneDraft.number.trim()) {
      setErrorMessage(t("phoneRequired"));
      return;
    }
    setSavingDraft(true);
    setErrorMessage(null);
    try {
      const targetIndex = editingIndex;
      const nextRow = {
        id: targetIndex !== null ? record.phones[targetIndex].id : 0,
        number: phoneDraft.number.trim(),
        label: normalizePhoneLabel(phoneDraft.label) || "mobile",
      };
      const phones = targetIndex !== null
        ? record.phones.map((row, index) => (index === targetIndex ? nextRow : row))
        : [...record.phones, nextRow];
      await persist({ ...record, phones });
      closeDraft();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setSavingDraft(false);
    }
  };

  const saveAddressDraft = async () => {
    if (!addressDraft.street.trim() && !addressDraft.postal_code.trim() && !addressDraft.locality.trim()) {
      setErrorMessage(t("addressRequired"));
      return;
    }
    setSavingDraft(true);
    setErrorMessage(null);
    try {
      const targetIndex = editingIndex;
      const nextRow = {
        id: targetIndex !== null ? record.addresses[targetIndex].id : 0,
        ...addressDraft,
      };
      const addresses = targetIndex !== null
        ? record.addresses.map((row, index) => (index === targetIndex ? nextRow : row))
        : [...record.addresses, nextRow];
      await persist({
        ...record,
        addresses: addressDraft.use_for_invoice
          ? addresses.map((row, index) => ({
              ...row,
              use_for_invoice: targetIndex !== null ? index === targetIndex : index === addresses.length - 1,
            }))
          : addresses,
      });
      closeDraft();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setSavingDraft(false);
    }
  };

  const saveContactDraft = async () => {
    const firstName = formatFirstName(contactDraft.first_name);
    const lastName = formatLastName(contactDraft.last_name);
    if (!firstName || !lastName) {
      setErrorMessage(t("contactRequired"));
      return;
    }
    const parentDetails = record.is_underage || PARENT_RELATIONS.has(contactDraft.relation);
    const detailPayload = parentDetails
      ? {
          email: contactDraft.email.trim(),
          phone: contactDraft.phone.trim(),
          street: contactAddress.street,
          house_number: contactAddress.house_number,
          line2: contactAddress.line2,
          postal_code: contactAddress.postal_code,
          locality: contactAddress.locality,
          country: contactAddress.country,
        }
      : {};
    setSavingDraft(true);
    setErrorMessage(null);
    try {
      if (editingIndex !== null) {
        const row = contacts[editingIndex];
        await updatePerson(row.person, { first_name: firstName, last_name: lastName });
        await updateContact(row.id, {
          relation: contactDraft.relation,
          is_emergency: contactDraft.is_emergency,
          ...detailPayload,
        });
      } else {
        if (memberMatches.length > 1 && !differentPerson && !chosenMemberId) {
          setErrorMessage(t("contactChooseMember"));
          setSavingDraft(false);
          return;
        }
        const linked = await linkContact({
          member: memberId,
          first_name: firstName,
          last_name: lastName,
          relation: contactDraft.relation,
          is_emergency: contactDraft.is_emergency,
          different_person: differentPerson,
          member_id: differentPerson ? undefined : chosenMemberId,
          also_family: parentDetails && contactDraft.also_family,
          ...detailPayload,
        });
        setSuccessMessage(linked.already_member ? t("contactAlreadyMember", { name: linked.linked_member_name }) : t("saved"));
        setDifferentPerson(false);
        closeDraft();
        await load();
        return;
      }
      closeDraft();
      setSuccessMessage(t("saved"));
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setSavingDraft(false);
    }
  };

  const emailEditor = (
    <div className="space-y-3">
      <Input
        type="email"
        autoFocus
        value={emailDraft.email}
        placeholder={t("emails")}
        onChange={(event) => setEmailDraft({ ...emailDraft, email: event.target.value })}
      />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={emailDraft.use_for_invoice}
          onCheckedChange={(checked) => setEmailDraft({ ...emailDraft, use_for_invoice: Boolean(checked) })}
        />
        {t("useForInvoice")}
      </label>
      <DraftActions
        saving={savingDraft}
        saveLabel={savingDraft ? t("saving") : t("saveItem")}
        cancelLabel={t("cancel")}
        onCancel={closeDraft}
        onSave={() => void saveEmailDraft()}
      />
    </div>
  );

  const phoneEditor = (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        <Input
          autoFocus
          value={phoneDraft.number}
          placeholder={t("phone")}
          onChange={(event) => setPhoneDraft({ ...phoneDraft, number: event.target.value })}
        />
        <Select
          value={normalizePhoneLabel(phoneDraft.label) || "mobile"}
          onValueChange={(value) => setPhoneDraft({ ...phoneDraft, label: value })}
          modal={false}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("phoneLabel")} />
          </SelectTrigger>
          <SelectContent position="popper">
            {PHONE_LABELS.map((label) => (
              <SelectItem key={label} value={label}>
                {t(`phoneLabel_${label}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DraftActions
        saving={savingDraft}
        saveLabel={savingDraft ? t("saving") : t("saveItem")}
        cancelLabel={t("cancel")}
        onSave={() => void savePhoneDraft()}
        onCancel={closeDraft}
      />
    </div>
  );

  const addressEditor = (
    <div className="space-y-3">
      <LuAddressFields value={addressDraft} onChange={setAddressDraft} />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={addressDraft.use_for_invoice}
          onCheckedChange={(checked) => setAddressDraft({ ...addressDraft, use_for_invoice: Boolean(checked) })}
        />
        {t("useForInvoice")}
      </label>
      <DraftActions
        saving={savingDraft}
        saveLabel={savingDraft ? t("saving") : t("saveItem")}
        cancelLabel={t("cancel")}
        onSave={() => void saveAddressDraft()}
        onCancel={closeDraft}
      />
    </div>
  );

  const contactEditor = (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        <Input
          autoFocus
          placeholder={t("firstName")}
          value={contactDraft.first_name}
          onChange={(event) => setContactDraft({ ...contactDraft, first_name: event.target.value })}
          onBlur={() =>
            setContactDraft((current) => ({ ...current, first_name: formatFirstName(current.first_name) }))
          }
        />
        <Input
          placeholder={t("lastName")}
          value={contactDraft.last_name}
          onChange={(event) =>
            setContactDraft({ ...contactDraft, last_name: event.target.value.toLocaleUpperCase("fr-LU") })
          }
          onBlur={() =>
            setContactDraft((current) => ({ ...current, last_name: formatLastName(current.last_name) }))
          }
        />
        <Select
          value={contactDraft.relation}
          onValueChange={(value) => setContactDraft({ ...contactDraft, relation: value })}
          modal={false}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {RELATIONS.map((rel) => (
              <SelectItem key={rel} value={rel}>
                {t(`relation_${rel}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={contactDraft.is_emergency}
            onCheckedChange={(checked) => setContactDraft({ ...contactDraft, is_emergency: Boolean(checked) })}
          />
          {t("emergency")}
        </label>
      </div>
      {record.is_underage || PARENT_RELATIONS.has(contactDraft.relation) ? (
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              type="email"
              placeholder={t("parentEmail")}
              value={contactDraft.email}
              onChange={(event) => setContactDraft({ ...contactDraft, email: event.target.value })}
            />
            <Input
              placeholder={t("phone")}
              value={contactDraft.phone}
              onChange={(event) => setContactDraft({ ...contactDraft, phone: event.target.value })}
            />
          </div>
          <LuAddressFields value={contactAddress} onChange={setContactAddress} />
          {record.family_name && editingIndex === null ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={contactDraft.also_family}
                onCheckedChange={(checked) => setContactDraft({ ...contactDraft, also_family: Boolean(checked) })}
              />
              {t("alsoForFamily", { name: record.family_name })}
            </label>
          ) : null}
        </div>
      ) : null}
      {memberMatches.length > 0 && !differentPerson ? (
        <div className="rounded-[var(--radius-form)] border border-border bg-secondary/50 p-3 text-sm">
          <p className="font-medium text-foreground">{t("contactMatchesTitle")}</p>
          <div className="mt-2 space-y-2">
            {memberMatches.map((match) => (
              <label key={match.id} className="flex items-center gap-2">
                {memberMatches.length > 1 ? (
                  <input
                    type="radio"
                    name="contact-member-match"
                    checked={chosenMemberId === match.id}
                    onChange={() => setChosenMemberId(match.id)}
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
      {memberMatches.length > 0 ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={differentPerson} onCheckedChange={(checked) => setDifferentPerson(Boolean(checked))} />
          {t("contactDifferentPerson")}
        </label>
      ) : null}
      <DraftActions
        saving={savingDraft}
        saveLabel={savingDraft ? t("saving") : t("saveItem")}
        cancelLabel={t("cancel")}
        onSave={() => void saveContactDraft()}
        onCancel={closeDraft}
      />
    </div>
  );

  return (
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
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-section text-foreground">{t("recordTitle")}</h2>
          {record.is_underage ? <StatusBadge label={t("underage")} tone="warning" /> : null}
          {record.last_checkup_on ? (
            <StatusBadge label={t("lastCheckup", { date: record.last_checkup_on })} tone="success" />
          ) : (
            <StatusBadge label={t("noCheckup")} tone="neutral" />
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>{t("ssn")}</Label>
            <Input
              className="mt-1"
              maxLength={13}
              inputMode="numeric"
              value={record.social_security_number}
              onChange={(event) =>
                setRecord({ ...record, social_security_number: event.target.value.replace(/\D/g, "").slice(0, 13) })
              }
            />
          </div>
          <div>
            <Label>{t("joinedAt")}</Label>
            <Input
              type="date"
              className="mt-1"
              value={record.joined_at || ""}
              onChange={(event) => setRecord({ ...record, joined_at: event.target.value })}
            />
          </div>
          <NationalityField
            label={t("nationality1")}
            value={record.nationality_1}
            noneLabel={t("nationalityNone")}
            locale={locale}
            onChange={(next) => setRecord({ ...record, nationality_1: next })}
          />
          <NationalityField
            label={t("nationality2")}
            value={record.nationality_2}
            noneLabel={t("nationalityNone")}
            locale={locale}
            onChange={(next) => setRecord({ ...record, nationality_2: next })}
          />
          {fees.length > 0 ? (
            <div className="md:col-span-2">
              <Label>{t("memberFeeLabel")}</Label>
              <p className="mt-1 text-xs text-muted">{t("memberFeeHint")}</p>
              <div className="mt-2">
                <Select
                  value={record.membership_fee ? String(record.membership_fee) : "default"}
                  onValueChange={(value) =>
                    setRecord({ ...record, membership_fee: value === "default" ? null : Number(value) })
                  }
                  modal={false}
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder={t("memberFeeLabel")} /></SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="default">{t("memberFeeDefault")}</SelectItem>
                    {fees.map((fee) => (
                      <SelectItem key={fee.id} value={String(fee.id)}>
                        {fee.name} · {fee.amount} EUR
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </div>
        <div className="mt-4">
          <Label>{t("medicalNotes")}</Label>
          <textarea
            className="mt-1 min-h-24 w-full rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 py-2 text-sm"
            value={record.medical_notes}
            onChange={(event) => setRecord({ ...record, medical_notes: event.target.value })}
          />
        </div>
      </FormPanel>

      <FormPanel>
        <h3 className="text-section text-foreground">{t("deliveryLabel")}</h3>
        <p className="mt-1 text-sm text-muted">{t("deliveryHint")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["email", "post", "hand"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              variant={record.invoice_delivery === option ? "primary" : "outline"}
              onClick={() => setRecord({ ...record, invoice_delivery: option })}
            >
              {option === "email" ? t("deliveryEmail") : option === "post" ? t("deliveryPost") : t("deliveryHand")}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">{deliveryPreview(record, t)}</p>
      </FormPanel>

      <FormPanel>
        <h3 className="text-section text-foreground">{t("emails")}</h3>
        {record.emails.length === 0 && adding !== "email" ? (
          <p className="mt-2 text-sm text-muted">{t("noEmailsYet")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {record.emails.map((row, index) => (
              <li key={`${row.id}-${row.email}`} className="rounded-[var(--radius-form)] border border-border px-3 py-2 text-sm">
                {adding === "email" && editingIndex === index ? (
                  emailEditor
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>
                      {row.email}
                      {row.use_for_invoice ? <span className="ml-2 text-xs text-muted">{t("useForInvoice")}</span> : null}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => startEditEmail(index)}>
                        {t("editItem")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          setErrorMessage(null);
                          try {
                            await persist({ ...record, emails: record.emails.filter((_, i) => i !== index) });
                          } catch (error) {
                            setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                          }
                        }}
                      >
                        {t("removeItem")}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {adding === "email" && editingIndex === null ? (
          <div className="mt-3">{emailEditor}</div>
        ) : adding === "email" ? null : (
          <div className="mt-3 flex flex-wrap gap-2">
            {trimmedOverview && !overviewEmailInUse ? (
              <Button type="button" variant="outline" onClick={() => void handleReuseOverviewEmail()}>
                {t("reuseOverviewEmail", { email: trimmedOverview })}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => startAdd("email")}>
              {t("addEmail")}
            </Button>
          </div>
        )}
      </FormPanel>

      <FormPanel>
        <h3 className="text-section text-foreground">{t("phones")}</h3>
        {record.phones.length === 0 && adding !== "phone" ? (
          <p className="mt-2 text-sm text-muted">{t("noPhonesYet")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {record.phones.map((row, index) => (
              <li key={`${row.id}-${row.number}`} className="rounded-[var(--radius-form)] border border-border px-3 py-2 text-sm">
                {adding === "phone" && editingIndex === index ? (
                  phoneEditor
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>
                      {row.number}
                      {phoneLabelText(row.label, t) ? ` · ${phoneLabelText(row.label, t)}` : ""}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => startEditPhone(index)}>
                        {t("editItem")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          setErrorMessage(null);
                          try {
                            await persist({ ...record, phones: record.phones.filter((_, i) => i !== index) });
                          } catch (error) {
                            setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                          }
                        }}
                      >
                        {t("removeItem")}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {adding === "phone" && editingIndex === null ? (
          <div className="mt-3">{phoneEditor}</div>
        ) : adding === "phone" ? null : (
          <Button className="mt-3" type="button" variant="outline" onClick={() => startAdd("phone")}>
            {t("addPhone")}
          </Button>
        )}
      </FormPanel>

      <FormPanel>
        <h3 className="text-section text-foreground">{t("addresses")}</h3>
        {record.addresses.length === 0 && adding !== "address" ? (
          <p className="mt-2 text-sm text-muted">{t("noAddressesYet")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {record.addresses.map((row, index) => (
              <li key={`${row.id}-${row.postal_code}-${row.street}`} className="rounded-[var(--radius-form)] border border-border px-3 py-2 text-sm">
                {adding === "address" && editingIndex === index ? (
                  addressEditor
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span>
                      {[row.street, row.house_number, row.line2, row.postal_code, row.locality, row.country]
                        .filter(Boolean)
                        .join(" ")}
                      {row.use_for_invoice ? <span className="ml-2 text-xs text-muted">{t("useForInvoice")}</span> : null}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => startEditAddress(index)}>
                        {t("editItem")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          setErrorMessage(null);
                          try {
                            await persist({ ...record, addresses: record.addresses.filter((_, i) => i !== index) });
                          } catch (error) {
                            setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                          }
                        }}
                      >
                        {t("removeItem")}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {adding === "address" && editingIndex === null ? (
          <div className="mt-3">{addressEditor}</div>
        ) : adding === "address" ? null : (
          <Button className="mt-3" type="button" variant="outline" onClick={() => startAdd("address")}>
            {t("addAddress")}
          </Button>
        )}
      </FormPanel>

      <FormPanel>
        <h3 className="text-section text-foreground">{t("mediaConsent")}</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {(
            [
              ["publish_facebook", "Facebook"],
              ["publish_instagram", "Instagram"],
              ["publish_x", "X"],
              ["publish_tiktok", "TikTok"],
              ["publish_webpage", t("webpage")],
              ["publish_print", t("printMedia")],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={Boolean(record[key])}
                onCheckedChange={(checked) => setRecord({ ...record, [key]: Boolean(checked) })}
              />
              {label}
            </label>
          ))}
        </div>
      </FormPanel>

      <FormPanel>
        <h3 className="text-section text-foreground">{t("checkups")}</h3>
        {checkups.length === 0 && adding !== "checkup" ? (
          <p className="mt-2 text-sm text-muted">{t("noCheckupsYet")}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {checkups.map((row) => (
              <li key={row.id}>{row.checked_on}{row.notes ? ` — ${row.notes}` : ""}</li>
            ))}
          </ul>
        )}
        {adding === "checkup" ? (
          <div className="mt-3 space-y-3">
            <Input type="date" autoFocus value={checkupDraft.checked_on} onChange={(event) => setCheckupDraft({ ...checkupDraft, checked_on: event.target.value })} />
            <Input value={checkupDraft.notes} placeholder={t("medicalNotes")} onChange={(event) => setCheckupDraft({ ...checkupDraft, notes: event.target.value })} />
            <DraftActions
              saving={savingDraft}
              saveLabel={savingDraft ? t("saving") : t("saveItem")}
              cancelLabel={t("cancel")}
              onCancel={closeDraft}
              onSave={async () => {
                if (!checkupDraft.checked_on) {
                  setErrorMessage(t("checkupRequired"));
                  return;
                }
                setSavingDraft(true);
                setErrorMessage(null);
                try {
                  await createCheckup({
                    member: memberId,
                    checked_on: checkupDraft.checked_on,
                    notes: checkupDraft.notes.trim() || undefined,
                  });
                  closeDraft();
                  setSuccessMessage(t("saved"));
                  await load();
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                } finally {
                  setSavingDraft(false);
                }
              }}
            />
          </div>
        ) : (
          <Button className="mt-3" type="button" variant="outline" onClick={() => startAdd("checkup")}>
            {t("addCheckup")}
          </Button>
        )}
      </FormPanel>

      <FormPanel>
        <h3 className="text-section text-foreground">{t("contacts")}</h3>
        {contacts.length === 0 && adding !== "contact" ? (
          <p className="mt-2 text-sm text-muted">{t("noContactsYet")}</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {contacts.map((row, index) => (
              <li key={row.id} className="rounded-[var(--radius-form)] border border-border px-3 py-2">
                {adding === "contact" && editingIndex === index ? (
                  contactEditor
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {row.person_detail.first_name} {row.person_detail.last_name} ({t(`relation_${row.relation}`)})
                      {row.is_primary ? ` · ${t("primaryContact")}` : ""}
                      {row.is_emergency ? ` · ${t("emergency")}` : ""}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => startEditContact(index)}>
                        {t("editItem")}
                      </Button>
                      {row.person_detail.converted_member ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/${locale}/dashboard/club/members/${row.person_detail.converted_member}`)}
                        >
                          {t("openMember")}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={convertingPersonId === row.person}
                          onClick={async () => {
                            setConvertingPersonId(row.person);
                            setErrorMessage(null);
                            try {
                              const converted = await convertPersonToMember(row.person);
                              router.push(`/${locale}/dashboard/club/members/${converted.member_id}`);
                            } catch (error) {
                              setErrorMessage(error instanceof Error ? error.message : t("saveError"));
                              setConvertingPersonId(null);
                            }
                          }}
                        >
                          {t("makeMember")}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {adding === "contact" && editingIndex === null ? (
          <div className="mt-3">{contactEditor}</div>
        ) : adding === "contact" ? null : (
          <Button className="mt-3" type="button" variant="outline" onClick={() => startAdd("contact")}>
            {t("addContact")}
          </Button>
        )}
      </FormPanel>

      <Button type="button" variant="primary" onClick={() => void saveIdentity()}>
        {t("saveRecord")}
      </Button>
    </div>
  );
}
