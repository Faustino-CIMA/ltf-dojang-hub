import { API_URL, apiRequest } from "./api";
import { getToken } from "./auth";

export const CLUB_MANAGEMENT_MODULE_ID = "club_management";

export type MemberRecord = {
  id: number;
  member: number;
  member_name: string;
  social_security_number: string;
  nationality_1: string;
  nationality_2: string;
  joined_at: string | null;
  medical_notes: string;
  publish_facebook: boolean;
  publish_instagram: boolean;
  publish_x: boolean;
  publish_tiktok: boolean;
  publish_webpage: boolean;
  publish_print: boolean;
  invoice_delivery: "email" | "post" | "hand";
  membership_fee: number | null;
  pays_license_fee: boolean;
  emails: Array<{ id: number; email: string; use_for_invoice: boolean }>;
  phones: Array<{ id: number; number: string; label: string }>;
  addresses: Array<{
    id: number;
    street: string;
    house_number: string;
    line2: string;
    postal_code: string;
    locality: string;
    country: string;
    use_for_invoice: boolean;
  }>;
  last_checkup_on: string | null;
  is_underage: boolean;
  family_name: string;
};

export type AddressLookup = {
  postal_code: string;
  localities: string[];
  streets: string[];
  houses: Array<{ house_number: string; street: string; locality: string; postal_code: string; label: string }>;
};

export function getMemberRecord(memberId: number) {
  return apiRequest<MemberRecord>(`/api/club-management/records/for-member/${memberId}/`);
}

export function saveMemberRecord(memberId: number, payload: Record<string, unknown>) {
  return apiRequest<MemberRecord>(`/api/club-management/records/for-member/${memberId}/`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function lookupLuAddress(postalCode: string, street = "") {
  const q = new URLSearchParams({ postal_code: postalCode });
  if (street) q.set("street", street);
  return apiRequest<AddressLookup>(`/api/club-management/addresses/?${q.toString()}`);
}

export function listCheckups(memberId: number) {
  return apiRequest<Array<{ id: number; checked_on: string; valid_until: string | null; notes: string }>>(
    `/api/club-management/checkups/?member=${memberId}`,
  );
}

export function createCheckup(payload: { member: number; checked_on: string; valid_until?: string; notes?: string }) {
  return apiRequest("/api/club-management/checkups/", { method: "POST", body: JSON.stringify(payload) });
}

export type ContactMemberMatch = {
  id: number;
  name: string;
  ltf_licenseid: string;
  is_active: boolean;
};

export type MemberContactRow = {
  id: number;
  relation: string;
  is_emergency: boolean;
  is_primary: boolean;
  person: number;
  person_detail: {
    first_name: string;
    last_name: string;
    sex: string;
    converted_member: number | null;
    emails: Array<{ email: string; use_for_invoice: boolean }>;
    phones: Array<{ number: string; label: string }>;
    addresses: Array<{
      street: string;
      house_number: string;
      line2: string;
      postal_code: string;
      locality: string;
      country: string;
      use_for_invoice: boolean;
    }>;
  };
};

export function listContacts(memberId: number) {
  return apiRequest<MemberContactRow[]>(`/api/club-management/contacts/?member=${memberId}`);
}

export function findContactMemberMatches(clubId: number, firstName: string, lastName: string, excludeMemberId: number) {
  const search = new URLSearchParams({
    club: String(clubId),
    first_name: firstName,
    last_name: lastName,
    exclude_member: String(excludeMemberId),
  });
  return apiRequest<{ matches: ContactMemberMatch[] }>(`/api/club-management/people/matches/?${search.toString()}`).then(
    (payload) => payload.matches,
  );
}

export function linkContact(payload: Record<string, unknown>) {
  return apiRequest<{ already_member: boolean; linked_member_name: string }>(`/api/club-management/contacts/link/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createPerson(payload: Record<string, unknown>) {
  return apiRequest<{ id: number }>(`/api/club-management/people/`, { method: "POST", body: JSON.stringify(payload) });
}

export function updatePerson(personId: number, payload: Record<string, unknown>) {
  return apiRequest<{ id: number }>(`/api/club-management/people/${personId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createContact(payload: Record<string, unknown>) {
  return apiRequest("/api/club-management/contacts/", { method: "POST", body: JSON.stringify(payload) });
}

export function updateContact(contactId: number, payload: Record<string, unknown>) {
  return apiRequest(`/api/club-management/contacts/${contactId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function convertPersonToMember(personId: number) {
  return apiRequest<{ member_id: number }>(`/api/club-management/people/${personId}/convert-to-member/`, { method: "POST" });
}

export type FamilyGuardian = {
  person_id: number;
  member_id: number | null;
  name: string;
  relation: string;
  email: string;
  phone: string;
  is_primary: boolean;
};

export type FamilyRecord = {
  id: number;
  name: string;
  invoice_member: number | null;
  bill_to_person: number | null;
  bill_to_name: string;
  bill_to_delivery: "" | "email" | "post" | "hand";
  needs_recipient: boolean;
  guardians: FamilyGuardian[];
  memberships: Array<{
    member: number;
    member_name: string;
    sort_order: number;
    date_of_birth: string | null;
    is_underage: boolean;
    dob_missing: boolean;
  }>;
};

export function listFamilies(clubId: number) {
  return apiRequest<FamilyRecord[]>(`/api/club-management/families/?club=${clubId}`);
}

export function getFamily(familyId: number, clubId: number) {
  return apiRequest<FamilyRecord>(`/api/club-management/families/${familyId}/?club=${clubId}`);
}

export function updateFamily(familyId: number, payload: Record<string, unknown>) {
  return apiRequest<FamilyRecord>(`/api/club-management/families/${familyId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function addFamilyParent(familyId: number, payload: Record<string, unknown>) {
  return apiRequest<FamilyRecord | { matches: ContactMemberMatch[] }>(`/api/club-management/families/${familyId}/add-parent/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createFamily(payload: Record<string, unknown>) {
  return apiRequest(`/api/club-management/families/`, { method: "POST", body: JSON.stringify(payload) });
}

export function addFamilyMember(familyId: number, memberId: number) {
  return apiRequest(`/api/club-management/families/${familyId}/add-member/`, {
    method: "POST",
    body: JSON.stringify({ member: memberId }),
  });
}

export function removeFamilyMember(familyId: number, memberId: number) {
  return apiRequest(`/api/club-management/families/${familyId}/remove-member/`, {
    method: "POST",
    body: JSON.stringify({ member: memberId }),
  });
}

export type FamilyInvoicePreview = {
  year: number;
  fee_id: number;
  fee_name: string;
  unit_amount: string;
  payer_id: number | null;
  payer_name: string;
  payer_kind?: "member" | "person" | "missing";
  needs_recipient?: boolean;
  installment?: number;
  billings?: MembershipBillingRow[];
  lines: Array<{
    member_id: number;
    member_name: string;
    rank: number;
    percent_off: string;
    amount_off?: string;
    amount: string;
    fee_name?: string;
    supplementary?: boolean;
    rebate_carried?: boolean;
    pays_license_fee?: boolean;
  }>;
  total: string;
  license_fee?: { name: string; amount: string };
  already_invoiced: boolean;
  already_confirmed?: boolean;
  name?: string;
  household_id?: string;
  kind?: string;
};

export function previewFamilyInvoice(familyId: number, year: number, installment = 1) {
  return apiRequest<FamilyInvoicePreview>(
    `/api/club-management/families/${familyId}/invoice-preview/?year=${year}&installment=${installment}`,
  );
}

export function previewHousehold(clubId: number, householdId: string, year: number, installment = 1) {
  const params = new URLSearchParams({
    club: String(clubId),
    household: householdId,
    year: String(year),
    installment: String(installment),
  });
  return apiRequest<FamilyInvoicePreview>(`/api/club-management/billing/household/?${params.toString()}`);
}

export function createFamilyInvoice(familyId: number, year: number, installment = 1) {
  return apiRequest<{ invoice_number: string; total: string; invoice_id: number; order_id: number }>(
    `/api/club-management/families/${familyId}/create-invoice/`,
    {
      method: "POST",
      body: JSON.stringify({ year, installment }),
    },
  );
}

export type MembershipBillingRow = {
  id: number;
  sequence: number;
  label: string;
  charges_license_fee?: boolean;
};

export type LicenseFee = {
  id: number | null;
  name: string;
  amount: string;
  prices: Array<{ id: number; amount: string; effective_from: string; created_at: string }>;
};

export function listBillings(clubId: number, year: number) {
  return apiRequest<{ year: number; billings: MembershipBillingRow[] }>(
    `/api/club-management/billings/?club=${clubId}&year=${year}`,
  );
}

export function addBilling(clubId: number, year: number, label = "") {
  return apiRequest<{ year: number; billings: MembershipBillingRow[] }>(
    `/api/club-management/billings/?club=${clubId}`,
    { method: "POST", body: JSON.stringify({ year, label }) },
  );
}

export function updateBillingLabel(clubId: number, billingId: number, label: string) {
  return apiRequest<MembershipBillingRow>(`/api/club-management/billings/${billingId}/?club=${clubId}`, {
    method: "PATCH",
    body: JSON.stringify({ label }),
  });
}

export function setLicenseFeeBilling(clubId: number, billingId: number) {
  return apiRequest<MembershipBillingRow>(`/api/club-management/billings/${billingId}/?club=${clubId}`, {
    method: "PATCH",
    body: JSON.stringify({ charges_license_fee: true }),
  });
}

export function deleteBilling(clubId: number, billingId: number) {
  return apiRequest<void>(`/api/club-management/billings/${billingId}/?club=${clubId}`, { method: "DELETE" });
}

export function getLicenseFee(clubId: number) {
  return apiRequest<LicenseFee>(`/api/club-management/license-fee/?club=${clubId}`);
}

export function saveLicenseFee(clubId: number, payload: { name: string; amount: string }) {
  return apiRequest<LicenseFee>(`/api/club-management/license-fee/?club=${clubId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function addLicenseFeePrice(clubId: number, payload: { amount: string; effective_from?: string }) {
  return apiRequest<LicenseFee>(`/api/club-management/license-fee/add-price/?club=${clubId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listFees(clubId: number) {
  return apiRequest<
    Array<{
      id: number;
      name: string;
      amount: string;
      year: number | null;
      prices: Array<{ id: number; amount: string; effective_from: string; created_at: string }>;
    }>
  >(`/api/club-management/membership-fees/?club=${clubId}`);
}

export function addMembershipFeePrice(feeId: number, payload: { amount: string; effective_from?: string }) {
  return apiRequest(`/api/club-management/membership-fees/${feeId}/add-price/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createFee(payload: Record<string, unknown>) {
  return apiRequest(`/api/club-management/membership-fees/`, { method: "POST", body: JSON.stringify(payload) });
}

export function updateFee(feeId: number, payload: { name: string; amount: string }) {
  return apiRequest(`/api/club-management/membership-fees/${feeId}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteFee(feeId: number) {
  return apiRequest<void>(`/api/club-management/membership-fees/${feeId}/`, { method: "DELETE" });
}

export type RebateRule = {
  id: number;
  member_rank: number;
  percent_off: string;
  amount_off: string | null;
  applies_to_later: boolean;
};

export function listRebateRules(clubId: number) {
  return apiRequest<RebateRule[]>(`/api/club-management/rebate-rules/?club=${clubId}`);
}

export function createRebateRule(payload: Record<string, unknown>) {
  return apiRequest(`/api/club-management/rebate-rules/`, { method: "POST", body: JSON.stringify(payload) });
}

export function updateRebateRule(ruleId: number, payload: Record<string, unknown>) {
  return apiRequest(`/api/club-management/rebate-rules/${ruleId}/`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteRebateRule(ruleId: number) {
  return apiRequest<void>(`/api/club-management/rebate-rules/${ruleId}/`, { method: "DELETE" });
}

export type BillingHousehold = {
  id: string;
  kind: "family" | "member";
  name: string;
  member_count: number;
  payer: {
    id: number | null;
    kind?: "member" | "person" | "missing";
    member_id?: number | null;
    name: string;
    delivery: "email" | "post" | "hand";
    emails: string[];
    address: { formatted: string } | null;
    contact_label: string;
  };
  lines: Array<FamilyInvoicePreview["lines"][number] & { fee_id?: number | null; fee_name?: string; unit_amount?: string }>;
  total: string;
  status: "ready" | "blocked" | "invoiced" | "paid" | "complimentary" | "confirmed" | "separate";
  invoice_id: number | null;
  invoice_number: string | null;
  invoice_status: string | null;
  member_invoices?: Array<{
    id: number;
    invoice_number: string;
    total: string;
    status: string;
    member_name: string;
  }>;
  delivery: "email" | "post" | "hand";
  needs_recipient?: boolean;
  blocker: string;
  fee_id: number | null;
  fee_name: string;
  confirmed?: boolean;
};

export type BillingFeeOption = { id: number; name: string; amount: string };

export type BillingPreview = {
  year: number;
  installment: number;
  billings: MembershipBillingRow[];
  license_fee: { name: string; amount: string };
  fee_set: boolean;
  fees: BillingFeeOption[];
  households: BillingHousehold[];
  summary: {
    ready_count: number;
    ready_total: string;
    email_count: number;
    post_count: number;
    hand_count: number;
    invoiced_count: number;
    complimentary_count?: number;
    confirmed_count?: number;
    print_pack_count: number;
  };
};

export function getClubBilling(clubId: number, year: number, installment = 1) {
  return apiRequest<BillingPreview>(
    `/api/club-management/billing/?club=${clubId}&year=${year}&installment=${installment}`,
  );
}

export function issueClubBilling(clubId: number, year: number, householdIds: string[], installment = 1) {
  return apiRequest<{
    year: number;
    installment: number;
    created: Array<{
      id: string;
      order_id?: number;
      invoice_id: number;
      invoice_number: string;
      delivery: string;
      total: string;
    }>;
    skipped: Array<{ id: string; reason: string }>;
    created_count: number;
    email_count: number;
    post_count: number;
    hand_count: number;
  }>(`/api/club-management/billing/?club=${clubId}`, {
    method: "POST",
    body: JSON.stringify({ year, installment, household_ids: householdIds }),
  });
}

export function confirmClubBilling(clubId: number, year: number, householdIds: string[], installment = 1) {
  return apiRequest<{
    year: number;
    installment: number;
    confirmed: Array<{ id: string }>;
    skipped: Array<{ id: string; reason: string }>;
    confirmed_count: number;
  }>(`/api/club-management/billing/confirm/?club=${clubId}`, {
    method: "POST",
    body: JSON.stringify({ year, installment, household_ids: householdIds }),
  });
}

export type PublicationConsentRow = {
  member: number;
  last_name: string;
  first_name: string;
  date_of_birth: string | null;
  age: number | null;
  publish_facebook: boolean;
  publish_instagram: boolean;
  publish_x: boolean;
  publish_tiktok: boolean;
  publish_webpage: boolean;
  publish_print: boolean;
};

export type PublicationField = Exclude<keyof PublicationConsentRow, "member" | "last_name" | "first_name" | "date_of_birth" | "age">;

export function listPublicationConsent(clubId: number) {
  return apiRequest<{ members: PublicationConsentRow[] }>(`/api/club-management/publication-consent/?club=${clubId}`);
}

export function setPublicationConsent(clubId: number, memberId: number, flags: Partial<Record<PublicationField, boolean>>) {
  return apiRequest<PublicationConsentRow>(`/api/club-management/publication-consent/?club=${clubId}`, {
    method: "POST",
    body: JSON.stringify({ member: memberId, ...flags }),
  });
}

export function setPublicationColumn(clubId: number, field: PublicationField, value: boolean) {
  return apiRequest<{ members: PublicationConsentRow[] }>(`/api/club-management/publication-consent/column/?club=${clubId}`, {
    method: "POST",
    body: JSON.stringify({ field, value }),
  });
}

export type PublicationPdfRule = "all" | "allowed" | "denied" | "denied_any";

export async function downloadPublicationConsent(
  clubId: number,
  format: "csv" | "xlsx" | "pdf",
  pdf?: { rule: PublicationPdfRule; channels: PublicationField[] },
) {
  const token = getToken();
  const params = new URLSearchParams({ club: String(clubId) });
  if (format === "pdf" && pdf) {
    params.set("rule", pdf.rule);
    if (pdf.channels.length > 0) params.set("channels", pdf.channels.join(","));
  }
  const response = await fetch(`${API_URL}/api/club-management/publication-consent/export.${format}?${params.toString()}`, {
    headers: { ...(token ? { Authorization: `Token ${token}` } : {}) },
  });
  if (!response.ok) {
    let message = "Could not download the file.";
    try {
      const parsed = (await response.json()) as { detail?: string };
      if (parsed?.detail) message = parsed.detail;
    } catch {
      /* keep fallback */
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `publication-consent.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 10000);
}

export function setMemberLicenseFee(clubId: number, memberId: number, paysLicenseFee: boolean) {
  return apiRequest<{ member: number; pays_license_fee: boolean }>(
    `/api/club-management/billing/member-license-fee/?club=${clubId}`,
    {
      method: "POST",
      body: JSON.stringify({ member: memberId, pays_license_fee: paysLicenseFee }),
    },
  );
}

export function assignBillingFee(clubId: number, memberId: number, feeId: number) {
  return apiRequest<{ member: number; fee: number; fee_name: string }>(
    `/api/club-management/billing/assign-fee/?club=${clubId}`,
    {
      method: "POST",
      body: JSON.stringify({ club: clubId, member: memberId, fee: feeId }),
    },
  );
}

export async function downloadBillingPrintPack(
  clubId: number,
  year: number,
  method: "paper" | "post" | "hand" = "paper",
  installment = 1,
) {
  const token = getToken();
  const response = await fetch(
    `${API_URL}/api/club-management/billing/print-pack/?club=${clubId}&year=${year}&method=${method}&installment=${installment}`,
    { headers: { ...(token ? { Authorization: `Token ${token}` } : {}) } },
  );
  if (!response.ok) {
    let message = "There are no postal or in-person invoices to print yet. Issue invoices first, then print this pack.";
    try {
      const parsed = (await response.json()) as { detail?: string };
      if (typeof parsed?.detail === "string" && parsed.detail.trim()) {
        message = parsed.detail;
      }
    } catch {
      /* keep the friendly fallback */
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => window.URL.revokeObjectURL(url), 10000);
}

export function getClubFinanceAccess(clubId: number | null) {
  const suffix = clubId != null ? `?club=${clubId}` : "";
  return apiRequest<{ can_record_payments: boolean; mandate_role: string | null }>(
    `/api/club-management/finance-access/${suffix}`,
  );
}

export function listCommittees(params: { scope: string; club?: number }) {
  const q = new URLSearchParams({ scope: params.scope });
  if (params.club) q.set("club", String(params.club));
  return apiRequest<Array<{ id: number; name: string; scope: string; mandates: Array<{ id: number; role: string; title: string; member: number | null; member_name: string; person: number | null; person_name: string; started_on: string; ended_on: string | null }> }>>(
    `/api/club-management/committees/?${q.toString()}`,
  );
}

export function createCommittee(payload: Record<string, unknown>) {
  return apiRequest(`/api/club-management/committees/`, { method: "POST", body: JSON.stringify(payload) });
}

export function createMandate(payload: Record<string, unknown>) {
  return apiRequest<{ id: number }>(`/api/club-management/mandates/`, { method: "POST", body: JSON.stringify(payload) });
}

export function updateMandate(id: number, payload: Record<string, unknown>) {
  return apiRequest(`/api/club-management/mandates/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteMandate(id: number) {
  return apiRequest<void>(`/api/club-management/mandates/${id}/`, {
    method: "DELETE",
  });
}

export type ShopVariant = {
  id: number;
  label: string;
  quantity: number;
  reorder_level: number;
  is_active: boolean;
  low_stock: boolean;
  qr_payload: string;
  qr_png?: string;
  sale_price: string;
  cost_price?: string | null;
};

export type ShopItem = {
  id: number;
  sku: string;
  name: string;
  description: string;
  category: string;
  photo_url: string;
  sale_price: string;
  cost_price?: string | null;
  track_stock: boolean;
  is_active: boolean;
  quantity: number;
  variants: ShopVariant[];
};

export type ShopSizeInput = {
  label: string;
  sale_price?: string;
  cost_price?: string;
  quantity?: string | number;
  reorder_level?: string | number;
};

export type ShopSale = {
  id: number;
  sale_number: string;
  member: number | null;
  member_name: string;
  walk_in_name: string;
  status: string;
  payment_method: string;
  total: string;
  income: number | null;
  lines: Array<{ id: number; variant: number; quantity: number; unit_price: string; name_snapshot: string }>;
  created_at: string;
  paid_at: string | null;
};

export type ShopSnapshot = {
  id: number;
  taken_at: string;
  note: string;
  line_count: number;
  units: number;
};

export type ShopOverview = {
  item_count: number;
  units_on_hand: number;
  low_stock_count: number;
  low_stock: Array<{
    id: number;
    item_id: number;
    sku: string;
    name: string;
    label: string;
    quantity: number;
    reorder_level: number;
  }>;
  sales_today: number;
};

export function getShopOverview(clubId: number) {
  return apiRequest<ShopOverview>(`/api/club-management/shop/overview/?club=${clubId}`);
}

export function listShopItems(clubId: number, q = "") {
  const params = new URLSearchParams({ club: String(clubId), active: "1" });
  if (q.trim()) params.set("q", q.trim());
  return apiRequest<ShopItem[] | { results: ShopItem[] }>(`/api/club-management/shop/items/?${params.toString()}`);
}

export function getShopItem(clubId: number, itemId: number) {
  return apiRequest<ShopItem>(`/api/club-management/shop/items/${itemId}/?club=${clubId}`);
}

function formatShopSaveError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") {
    return fallback;
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.detail === "string" && obj.detail.trim()) {
    return obj.detail;
  }
  const parts: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") {
      const text = value.trim();
      if (text) parts.push(text);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  };
  walk(obj);
  return parts.join(" ") || fallback;
}

export async function prepareShopPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) return file;
    return new File([blob], "item.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function shopPriceRange(item: ShopItem): { min: string; max: string } {
  const prices = (item.variants.length ? item.variants : [])
    .filter((row) => row.is_active)
    .map((row) => row.sale_price)
    .filter(Boolean);
  if (prices.length === 0) {
    return { min: item.sale_price, max: item.sale_price };
  }
  const sorted = [...prices].sort((a, b) => Number(a) - Number(b));
  return { min: sorted[0], max: sorted[sorted.length - 1] };
}

export async function saveShopItem(clubId: number, payload: FormData, itemId?: number) {
  payload.append("club", String(clubId));
  const token = getToken();
  const url = itemId
    ? `${API_URL}/api/club-management/shop/items/${itemId}/?club=${clubId}`
    : `${API_URL}/api/club-management/shop/items/?club=${clubId}`;
  const response = await fetch(url, {
    method: itemId ? "PATCH" : "POST",
    headers: { ...(token ? { Authorization: `Token ${token}` } : {}) },
    body: payload,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(formatShopSaveError(data, "Could not save the item."));
  }
  return data as ShopItem;
}

export function receiveShopStock(
  clubId: number,
  itemId: number,
  payload: {
    variant?: number;
    quantity?: number;
    note?: string;
    lines?: Array<{ variant: number; quantity: number }>;
  },
) {
  return apiRequest<ShopItem>(`/api/club-management/shop/items/${itemId}/receive/?club=${clubId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function scanShopCode(clubId: number, code: string) {
  return apiRequest<{
    variant_id: number;
    item_id: number;
    sku: string;
    name: string;
    label: string;
    sale_price: string;
    quantity: number;
    photo_url: string;
  }>(`/api/club-management/shop/scan/?club=${clubId}&code=${encodeURIComponent(code)}`);
}

export function createShopSale(
  clubId: number,
  payload: {
    member?: number | null;
    walk_in_name?: string;
    payment_method: string;
    lines: Array<{ variant: number; quantity: number; unit_price?: string }>;
  },
) {
  return apiRequest<ShopSale>(`/api/club-management/shop/sales/?club=${clubId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listShopSales(clubId: number) {
  return apiRequest<ShopSale[] | { results: ShopSale[] }>(`/api/club-management/shop/sales/?club=${clubId}`);
}

export function markShopSalePaid(clubId: number, saleId: number, paymentMethod: string) {
  return apiRequest<ShopSale>(`/api/club-management/shop/sales/${saleId}/mark-paid/?club=${clubId}`, {
    method: "POST",
    body: JSON.stringify({ payment_method: paymentMethod }),
  });
}

export function listShopSnapshots(clubId: number) {
  return apiRequest<ShopSnapshot[] | { results: ShopSnapshot[] }>(`/api/club-management/shop/snapshots/?club=${clubId}`);
}

export function createShopSnapshot(clubId: number, note = "") {
  return apiRequest<ShopSnapshot>(`/api/club-management/shop/snapshots/?club=${clubId}`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

async function openShopPdf(path: string) {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    headers: { ...(token ? { Authorization: `Token ${token}` } : {}) },
  });
  if (!response.ok) {
    let message = "Could not open the PDF.";
    try {
      const parsed = (await response.json()) as { detail?: string };
      if (parsed?.detail) message = parsed.detail;
    } catch {
      /* keep fallback */
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => window.URL.revokeObjectURL(url), 10000);
}

export function downloadShopStickers(
  clubId: number,
  itemId: number,
  copies: number,
  variantId?: number | "all",
  options?: { start?: number; printerProfileId?: number | null },
) {
  const params = new URLSearchParams({ club: String(clubId), copies: String(copies) });
  if (variantId === "all") params.set("all", "1");
  else if (variantId) params.set("variant", String(variantId));
  if (options?.start && options.start > 1) params.set("start", String(options.start));
  if (options?.printerProfileId) params.set("printer_profile", String(options.printerProfileId));
  return openShopPdf(`/api/club-management/shop/items/${itemId}/stickers/?${params.toString()}`);
}

export function downloadShopCatalogue(clubId: number) {
  return openShopPdf(`/api/club-management/shop/catalogue.pdf?club=${clubId}`);
}

export function downloadShopSnapshotPdf(clubId: number, snapshotId: number) {
  return openShopPdf(`/api/club-management/shop/snapshots/${snapshotId}/pdf/?club=${clubId}`);
}

export function asShopList<T>(payload: T[] | { results: T[] }): T[] {
  return Array.isArray(payload) ? payload : payload.results ?? [];
}

export type SubsidyChecklistItem = { id: string; ok: boolean };
export type SubsidyCoach = {
  user_id: number;
  name: string;
  eqf_level: string;
  coaches_under_16: boolean;
  diploma_status: string;
  has_diploma: boolean;
  diploma_name: string;
  points: number;
};
export type SubsidyYouth = {
  id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: string;
  licence: string;
  national_id: string;
};
export type SubsidyCase = {
  id: number;
  kind: string;
  title: string;
  place: string;
  starts_on: string;
  ends_on: string;
  status: string;
  account_due: string;
  athlete_ids: number[];
  official_ids: number[];
  travel_mode: string;
  travel_units: string;
  travel_rate: string;
  stay_people: number;
  stay_days: number;
  stay_rate: string;
  entry_fee: string;
  medical_fee: string;
  supplies_fee: string;
  notes: string;
};
export type SubsidyDossier = {
  year: number;
  deadline: string;
  dates: { file_by: string; inaps_by: string; diplomas_by: string };
  season: {
    season_complete: boolean;
    myguichet_users: number;
    rib_attached: boolean;
    has_rib: boolean;
    rib_name: string;
    non_licensed_count: number;
    status: string;
    submitted_on: string;
    paid_on: string;
    paid_amount: string;
    income_number: string;
    income_needs_officer: boolean;
  };
  training_place: string;
  checklist: SubsidyChecklistItem[];
  effectifs: {
    male_under_16: number;
    female_under_16: number;
    male_16_plus: number;
    female_16_plus: number;
    licensed_total: number;
    non_licensed: number;
    headcount: number;
    volunteer_points: number;
  };
  headcount_rows: {
    kind: "section" | "count" | "total";
    label: string;
    male: number | null;
    female: number | null;
    total: number | null;
  }[];
  coach_points: number;
  eligible_youth: number;
  qualite_estimate: string;
  coaches: SubsidyCoach[];
  youth: SubsidyYouth[];
  members: { id: number; name: string; under_16: boolean; adult: boolean }[];
  cases: SubsidyCase[];
};

export function getSubsidyDossier(clubId: number, year: number) {
  return apiRequest<SubsidyDossier>(`/api/club-management/subsidies/?club=${clubId}&year=${year}`);
}

export function saveSubsidySeason(clubId: number, year: number, payload: Record<string, unknown>) {
  return apiRequest<SubsidyDossier>(`/api/club-management/subsidies/?club=${clubId}&year=${year}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function saveSubsidyCoach(clubId: number, year: number, payload: Record<string, unknown>) {
  return apiRequest<SubsidyDossier>(`/api/club-management/subsidies/coaches/?club=${clubId}&year=${year}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function saveSubsidyYouthId(clubId: number, year: number, memberId: number, nationalId: string) {
  return apiRequest<SubsidyDossier>(`/api/club-management/subsidies/youth-id/?club=${clubId}&year=${year}`, {
    method: "POST",
    body: JSON.stringify({ member_id: memberId, national_id: nationalId }),
  });
}

export function createExtraordinarySubsidy(clubId: number, year: number, payload: Record<string, unknown>) {
  return apiRequest<SubsidyDossier & { id: number }>(`/api/club-management/subsidies/cases/?club=${clubId}&year=${year}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function downloadSubsidyYouthCsv(clubId: number, year: number) {
  return openShopPdf(`/api/club-management/subsidies/youth.csv?club=${clubId}&year=${year}`);
}

export async function downloadSubsidyYouthXlsx(clubId: number, year: number) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/club-management/subsidies/youth.xlsx?club=${clubId}&year=${year}`, {
    headers: { ...(token ? { Authorization: `Token ${token}` } : {}) },
  });
  if (!response.ok) {
    throw new Error("Could not download the Excel file.");
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `effectifs-${year}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 10000);
}

function pdfFilename(prefix: string, clubName: string, year: number) {
  const safe = clubName
    .replace(/[\\/:*?"<>|]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${prefix}-${safe || "club"}-${year}.pdf`;
}

function trainersListFilename(clubName: string, year: number) {
  const safe = clubName
    .replace(/[\\/:*?"<>|]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `liste-entraineurs-${safe || "club"}-${year}.pdf`;
}

async function fetchTrainersList(clubId: number, year: number) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/club-management/subsidies/trainers.pdf?club=${clubId}&year=${year}`, {
    headers: { ...(token ? { Authorization: `Token ${token}` } : {}) },
  });
  if (!response.ok) {
    throw new Error("Could not download the trainers list.");
  }
  return response.blob();
}

export async function downloadTrainersList(clubId: number, year: number, clubName: string) {
  const blob = await fetchTrainersList(clubId, year);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = trainersListFilename(clubName, year);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 10000);
}

export async function previewTrainersList(clubId: number, year: number) {
  const blob = await fetchTrainersList(clubId, year);
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => window.URL.revokeObjectURL(url), 120000);
}

async function fetchTrainingList(clubId: number, year: number) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/club-management/subsidies/trainings.pdf?club=${clubId}&year=${year}`, {
    headers: { ...(token ? { Authorization: `Token ${token}` } : {}) },
  });
  if (!response.ok) {
    throw new Error("Could not download the training list.");
  }
  return response.blob();
}

export async function downloadTrainingList(clubId: number, year: number, clubName: string) {
  const blob = await fetchTrainingList(clubId, year);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = pdfFilename("liste-entrainements", clubName, year);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 10000);
}

export async function previewTrainingList(clubId: number, year: number) {
  const blob = await fetchTrainingList(clubId, year);
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => window.URL.revokeObjectURL(url), 120000);
}

export function downloadExtraordinaryForm(clubId: number, caseId: number) {
  return openShopPdf(`/api/club-management/subsidies/cases/${caseId}/form.pdf?club=${clubId}`);
}

export function updateExtraordinarySubsidy(clubId: number, caseId: number, payload: Record<string, unknown>) {
  return apiRequest<SubsidyDossier>(`/api/club-management/subsidies/cases/${caseId}/?club=${clubId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteExtraordinarySubsidy(clubId: number, caseId: number) {
  return apiRequest<SubsidyDossier>(`/api/club-management/subsidies/cases/${caseId}/?club=${clubId}`, {
    method: "DELETE",
  });
}

export function uploadSubsidyRib(clubId: number, year: number, file: File) {
  const body = new FormData();
  body.set("file", file);
  return apiRequest<SubsidyDossier>(`/api/club-management/subsidies/rib/?club=${clubId}&year=${year}`, {
    method: "POST",
    body,
  });
}

export function downloadSubsidyRib(clubId: number, year: number) {
  return openShopPdf(`/api/club-management/subsidies/rib/?club=${clubId}&year=${year}`);
}

export function removeSubsidyRib(clubId: number, year: number) {
  return apiRequest<SubsidyDossier>(`/api/club-management/subsidies/rib/?club=${clubId}&year=${year}`, {
    method: "DELETE",
  });
}

export function uploadSubsidyDiploma(clubId: number, year: number, userId: number, file: File) {
  const body = new FormData();
  body.set("file", file);
  return apiRequest<SubsidyDossier>(`/api/club-management/subsidies/coaches/${userId}/diploma/?club=${clubId}&year=${year}`, {
    method: "POST",
    body,
  });
}

export function downloadSubsidyDiploma(clubId: number, year: number, userId: number) {
  return openShopPdf(`/api/club-management/subsidies/coaches/${userId}/diploma/?club=${clubId}&year=${year}`);
}

export function removeSubsidyDiploma(clubId: number, year: number, userId: number) {
  return apiRequest<SubsidyDossier>(`/api/club-management/subsidies/coaches/${userId}/diploma/?club=${clubId}&year=${year}`, {
    method: "DELETE",
  });
}
