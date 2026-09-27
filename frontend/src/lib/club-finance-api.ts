import { API_URL, apiRequest } from "./api";
import { getToken } from "./auth";
import type {
  BankMatchCandidate,
  BankStatement,
  ExpenseCategory,
  FinanceBudgetResponse,
  FinanceExpense,
  FinanceIncome,
  FinanceInvoice,
  FinanceOrder,
  FinanceReportResponse,
  IncomeCategory,
  Payment,
} from "./ltf-finance-api";
import { PaginatedResponse, unwrapListResponse } from "./pagination";

type ApiCallOptions = {
  signal?: AbortSignal;
};

type ClubListQueryParams = {
  clubId?: number | null;
  q?: string;
  status?: string;
  issue?: string;
  ledger?: string;
};

type ClubPageParams = ClubListQueryParams & {
  page: number;
  pageSize: number;
};

function buildClubListQuery(params?: ClubListQueryParams) {
  const search = new URLSearchParams();
  if (params?.clubId) {
    search.set("club_id", String(params.clubId));
  }
  if (params?.q) {
    search.set("q", params.q);
  }
  if (params?.status) {
    search.set("status", params.status);
  }
  if (params?.issue) {
    search.set("issue", params.issue);
  }
  if (params?.ledger) {
    search.set("ledger", params.ledger);
  }
  return search;
}

export type CheckoutSession = {
  id: string;
  url: string;
};

export type PayconiqPayment = {
  id: number;
  invoice: number;
  order: number;
  amount: string;
  currency: string;
  status: string;
  reference: string;
  payconiq_payment_id: string;
  payconiq_payment_url: string;
  payconiq_status: string;
  created_at: string;
};

export function getClubOrders(clubId?: number | null, options?: ApiCallOptions) {
  return getClubOrdersList({ clubId }, options);
}

export function getClubOrdersList(
  params?: ClubListQueryParams,
  options?: ApiCallOptions
) {
  const search = buildClubListQuery(params);
  const suffix = search.toString();
  return apiRequest<FinanceOrder[] | PaginatedResponse<FinanceOrder>>(
    `/api/club-orders/${suffix ? `?${suffix}` : ""}`,
    {
      signal: options?.signal,
    }
  ).then((response) => unwrapListResponse(response));
}

export function getClubOrdersPage(
  params: ClubPageParams,
  options?: ApiCallOptions
) {
  const search = buildClubListQuery(params);
  search.set("page", String(params.page));
  search.set("page_size", String(params.pageSize));
  const suffix = search.toString();
  return apiRequest<PaginatedResponse<FinanceOrder>>(`/api/club-orders/${suffix ? `?${suffix}` : ""}`, {
    signal: options?.signal,
  });
}

export function getClubOrder(orderId: number) {
  return apiRequest<FinanceOrder>(`/api/club-orders/${orderId}/`);
}

export function getClubInvoices(clubId?: number | null, options?: ApiCallOptions) {
  return getClubInvoicesList({ clubId }, options);
}

export function getClubInvoicesList(
  params?: ClubListQueryParams,
  options?: ApiCallOptions
) {
  const search = buildClubListQuery(params);
  const suffix = search.toString();
  return apiRequest<FinanceInvoice[] | PaginatedResponse<FinanceInvoice>>(
    `/api/club-invoices/${suffix ? `?${suffix}` : ""}`,
    {
      signal: options?.signal,
    }
  ).then((response) => unwrapListResponse(response));
}

export function getClubInvoicesPage(
  params: ClubPageParams,
  options?: ApiCallOptions
) {
  const search = buildClubListQuery(params);
  search.set("page", String(params.page));
  search.set("page_size", String(params.pageSize));
  const suffix = search.toString();
  return apiRequest<PaginatedResponse<FinanceInvoice>>(
    `/api/club-invoices/${suffix ? `?${suffix}` : ""}`,
    {
      signal: options?.signal,
    }
  );
}

export function getClubInvoice(invoiceId: number) {
  return apiRequest<FinanceInvoice>(`/api/club-invoices/${invoiceId}/`);
}

export function createClubCreditNote(invoiceId: number, input: { amount: string; reason: string }) {
  return apiRequest<FinanceInvoice>(`/api/club-invoices/${invoiceId}/credit-note/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function sendClubInvoiceReminder(invoiceId: number) {
  return apiRequest<FinanceInvoice>(`/api/club-invoices/${invoiceId}/send-reminder/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function downloadClubStatement(params: {
  clubId: number;
  year: number;
  memberId?: number;
  familyId?: number;
}) {
  const token = getToken();
  const search = new URLSearchParams({
    club: String(params.clubId),
    year: String(params.year),
  });
  if (params.memberId) search.set("member", String(params.memberId));
  if (params.familyId) search.set("family", String(params.familyId));
  const response = await fetch(`${API_URL}/api/club-statements/?${search.toString()}`, {
    headers: { ...(token ? { Authorization: `Token ${token}` } : {}) },
  });
  if (!response.ok) {
    throw new Error("Failed to download the statement.");
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => window.URL.revokeObjectURL(url), 10000);
}

type ClubPaymentQueryParams = ClubListQueryParams & {
  invoiceId?: number;
};

type ClubPaymentPageParams = ClubPaymentQueryParams & {
  page: number;
  pageSize: number;
};

function buildClubPaymentQuery(params?: ClubPaymentQueryParams) {
  const search = buildClubListQuery(params);
  if (params?.invoiceId) {
    search.set("invoice_id", String(params.invoiceId));
  }
  return search;
}

export function getClubPayments(
  params?: ClubPaymentQueryParams,
  options?: ApiCallOptions
) {
  const search = buildClubPaymentQuery(params);
  const suffix = search.toString();
  return apiRequest<Payment[] | PaginatedResponse<Payment>>(
    `/api/club-payments/${suffix ? `?${suffix}` : ""}`,
    { signal: options?.signal },
  ).then((response) => unwrapListResponse(response));
}

export function getClubPaymentsPage(params: ClubPaymentPageParams, options?: ApiCallOptions) {
  const search = buildClubPaymentQuery(params);
  search.set("page", String(params.page));
  search.set("page_size", String(params.pageSize));
  const suffix = search.toString();
  return apiRequest<PaginatedResponse<Payment>>(`/api/club-payments/${suffix ? `?${suffix}` : ""}`, {
    signal: options?.signal,
  });
}

export function confirmClubOrderPayment(
  orderId: number,
  payload: {
    payment_method?: string;
    payment_provider?: string;
    payment_reference?: string;
    payment_notes?: string;
    paid_at?: string;
  } = {},
) {
  return apiRequest<FinanceOrder>(`/api/club-orders/${orderId}/confirm-payment/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createClubCheckoutSession(
  orderId: number,
  payload?: { club_admin_consent_confirmed?: boolean }
) {
  return apiRequest<CheckoutSession>(`/api/club-orders/${orderId}/create-checkout-session/`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export type ConfirmStripeCheckoutResult = {
  status: "paid" | "pending" | "unpaid";
  order_id: number | null;
  invoice_id: number | null;
  order_status?: string | null;
  invoice_status?: string | null;
};

export function confirmStripeCheckout(sessionId: string) {
  return apiRequest<ConfirmStripeCheckoutResult>("/api/stripe/confirm-checkout/", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export function createPayconiqPayment(invoiceId: number) {
  return apiRequest<PayconiqPayment>("/api/payconiq/create/", {
    method: "POST",
    body: JSON.stringify({ invoice_id: invoiceId }),
  });
}

export function getPayconiqPaymentStatus(paymentId: number) {
  return apiRequest<PayconiqPayment>(`/api/payconiq/${paymentId}/status/`);
}

type ClubOrderBatchInput = {
  club: number;
  license_type: number;
  member_ids: number[];
  year: number;
  quantity?: number;
  tax_total?: string;
};

type ClubOrderEligibilityInput = {
  club: number;
  member_ids: number[];
  year: number;
};

export type ClubOrderEligibilityReasonCount = {
  code: string;
  count: number;
  message: string;
};

export type ClubOrderEligibleLicenseType = {
  id: number;
  name: string;
  code: string;
  active_price: {
    amount: string;
    currency: string;
    effective_from: string;
  };
};

export type ClubOrderAvailability = {
  enabled: boolean;
  is_open: boolean;
  window_start: string | null;
  window_end: string | null;
  opens_at: string | null;
};

export type ClubOrderIneligibleLicenseType = {
  id: number;
  name: string;
  code: string;
  reason_counts: ClubOrderEligibilityReasonCount[];
  ineligible_members: ClubOrderIneligibleMember[];
  availability?: ClubOrderAvailability;
};

export type ClubOrderIneligibleMember = {
  member_id: number;
  member_name: string;
  reason_code: string;
  message: string;
  license_status?: "pending" | "active" | "expired" | "revoked" | null;
};

export type ClubOrderEligibilityResponse = {
  summary: {
    selected_member_count: number;
    eligible_license_type_count: number;
    ineligible_license_type_count: number;
  };
  eligible_license_types: ClubOrderEligibleLicenseType[];
  ineligible_license_types: ClubOrderIneligibleLicenseType[];
};

export function createClubOrdersBatch(input: ClubOrderBatchInput) {
  return apiRequest<FinanceOrder>("/api/club-orders/batch/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getClubOrderEligibility(input: ClubOrderEligibilityInput) {
  return apiRequest<ClubOrderEligibilityResponse>("/api/club-orders/eligibility/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

function withClub(search: URLSearchParams, clubId?: number | null) {
  if (clubId) {
    search.set("club", String(clubId));
  }
  return search;
}

export function getClubIncomeCategories(clubId: number | null, options?: ApiCallOptions) {
  const search = withClub(new URLSearchParams({ active: "1" }), clubId);
  return apiRequest<IncomeCategory[] | PaginatedResponse<IncomeCategory>>(
    `/api/club-income-categories/?${search.toString()}`,
    { signal: options?.signal },
  ).then((response) => unwrapListResponse(response));
}

export function getClubExpenseCategories(clubId: number | null, options?: ApiCallOptions) {
  const search = withClub(new URLSearchParams({ active: "1" }), clubId);
  return apiRequest<ExpenseCategory[] | PaginatedResponse<ExpenseCategory>>(
    `/api/club-expense-categories/?${search.toString()}`,
    { signal: options?.signal },
  ).then((response) => unwrapListResponse(response));
}

type ClubBookPageParams = {
  clubId?: number | null;
  page: number;
  pageSize: number;
  q?: string;
  status?: string;
};

function buildClubBookQuery(params: ClubBookPageParams) {
  const search = new URLSearchParams();
  if (params.clubId) search.set("club", String(params.clubId));
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  search.set("page", String(params.page));
  search.set("page_size", String(params.pageSize));
  return search;
}

export function getClubIncomesPage(params: ClubBookPageParams, options?: ApiCallOptions) {
  return apiRequest<PaginatedResponse<FinanceIncome>>(`/api/club-incomes/?${buildClubBookQuery(params)}`, {
    signal: options?.signal,
  });
}

export function getClubIncome(id: number) {
  return apiRequest<FinanceIncome>(`/api/club-incomes/${id}/`);
}

function asJsonOrFormData(input: Record<string, unknown>, receipt?: File | null) {
  if (!receipt) {
    return JSON.stringify(input);
  }
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      continue;
    }
    form.append(key, typeof value === "boolean" ? (value ? "true" : "false") : String(value));
  }
  form.append("receipt", receipt);
  return form;
}

export function createClubIncome(input: Record<string, unknown>, receipt?: File | null) {
  return apiRequest<FinanceIncome>("/api/club-incomes/", {
    method: "POST",
    body: asJsonOrFormData(input, receipt),
  });
}

export function updateClubIncome(id: number, input: Record<string, unknown>, receipt?: File | null) {
  return apiRequest<FinanceIncome>(`/api/club-incomes/${id}/`, {
    method: "PATCH",
    body: asJsonOrFormData(input, receipt),
  });
}

export function voidClubIncome(id: number) {
  return apiRequest<FinanceIncome>(`/api/club-incomes/${id}/void/`, { method: "POST", body: JSON.stringify({}) });
}

export function getClubExpensesPage(params: ClubBookPageParams, options?: ApiCallOptions) {
  return apiRequest<PaginatedResponse<FinanceExpense>>(`/api/club-expenses/?${buildClubBookQuery(params)}`, {
    signal: options?.signal,
  });
}

export function getClubExpense(id: number) {
  return apiRequest<FinanceExpense>(`/api/club-expenses/${id}/`);
}

export function createClubExpense(input: Record<string, unknown>, receipt?: File | null) {
  return apiRequest<FinanceExpense>("/api/club-expenses/", {
    method: "POST",
    body: asJsonOrFormData(input, receipt),
  });
}

export function updateClubExpense(id: number, input: Record<string, unknown>, receipt?: File | null) {
  return apiRequest<FinanceExpense>(`/api/club-expenses/${id}/`, {
    method: "PATCH",
    body: asJsonOrFormData(input, receipt),
  });
}

export function markClubExpensePaid(id: number, input?: Record<string, unknown>) {
  return apiRequest<FinanceExpense>(`/api/club-expenses/${id}/mark-paid/`, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export function voidClubExpense(id: number) {
  return apiRequest<FinanceExpense>(`/api/club-expenses/${id}/void/`, { method: "POST", body: JSON.stringify({}) });
}

export function getClubFinanceReport(clubId: number, year: number, options?: ApiCallOptions) {
  return apiRequest<FinanceReportResponse>(`/api/club-finance-reports/?club=${clubId}&year=${year}`, {
    signal: options?.signal,
  });
}

export function saveClubFinanceYearOpening(input: {
  club: number;
  year: number;
  opening_cash: string;
  notes?: string;
}) {
  return apiRequest(`/api/club-finance-year-openings/?club=${input.club}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function downloadClubFinanceReportExcel(clubId: number, year: number) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/club-finance-reports/export/?club=${clubId}&year=${year}`, {
    headers: { ...(token ? { Authorization: `Token ${token}` } : {}) },
  });
  if (!response.ok) {
    throw new Error("Failed to download the Excel report.");
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `club_financial_report_${year}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 10000);
}

export function getClubBankStatements(clubId: number | null, options?: ApiCallOptions) {
  const search = withClub(new URLSearchParams(), clubId);
  const suffix = search.toString();
  return apiRequest<BankStatement[] | PaginatedResponse<BankStatement>>(
    `/api/club-bank-statements/${suffix ? `?${suffix}` : ""}`,
    { signal: options?.signal },
  ).then((response) => unwrapListResponse(response));
}

export function getClubBankStatement(id: number) {
  return apiRequest<BankStatement>(`/api/club-bank-statements/${id}/`);
}

export function importClubBankStatement(
  clubId: number,
  file: File,
  opening?: string,
  closing?: string,
) {
  const form = new FormData();
  form.append("file", file);
  form.append("club", String(clubId));
  if (opening) form.append("opening_balance", opening);
  if (closing) form.append("closing_balance", closing);
  return apiRequest<BankStatement>(`/api/club-bank-statements/import/?club=${clubId}`, {
    method: "POST",
    body: form,
  });
}

export function matchClubBankLine(statementId: number, input: { line: number; kind: string; id: number }) {
  return apiRequest<BankStatement>(`/api/club-bank-statements/${statementId}/match/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function unmatchClubBankLine(statementId: number, line: number) {
  return apiRequest<BankStatement>(`/api/club-bank-statements/${statementId}/unmatch/`, {
    method: "POST",
    body: JSON.stringify({ line }),
  });
}

export function ignoreClubBankLine(statementId: number, line: number) {
  return apiRequest<BankStatement>(`/api/club-bank-statements/${statementId}/ignore/`, {
    method: "POST",
    body: JSON.stringify({ line }),
  });
}

export function completeClubBankStatement(statementId: number) {
  return apiRequest<BankStatement>(`/api/club-bank-statements/${statementId}/complete/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function getClubBankSuggestions(statementId: number, line: number) {
  return apiRequest<{ line: number; candidates: BankMatchCandidate[] }>(
    `/api/club-bank-statements/${statementId}/suggestions/?line=${line}`
  );
}

export function getClubFinanceBudget(clubId: number, year: number, options?: ApiCallOptions) {
  return apiRequest<FinanceBudgetResponse>(`/api/club-finance-budgets/?club=${clubId}&year=${year}`, {
    signal: options?.signal,
  });
}

export function saveClubFinanceBudget(
  clubId: number,
  year: number,
  lines: Array<{ kind: string; category?: number | null; amount: string }>,
) {
  return apiRequest<FinanceBudgetResponse>(`/api/club-finance-budgets/?club=${clubId}`, {
    method: "PUT",
    body: JSON.stringify({ year, lines }),
  });
}
