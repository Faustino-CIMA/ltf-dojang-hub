import { deskHeaderValue, fallbackOpenDesk, readActiveDeskHeader, rememberActiveDesk, type DeskChoice } from "./active-desk";
import { refreshWithClientRouter, replaceWithClientRouter } from "./app-navigate";
import { AuthApiError, presentAuthError, readUiLocale } from "./auth-errors";
import { clearToken, getToken } from "./auth";
import { routeForDesk } from "./dashboard-routing";

type RequestOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

const DEFAULT_API_URL = "http://localhost:8000";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const API_REQUEST_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS ?? "15000");
const inFlightGetRequests = new Map<string, Promise<unknown>>();

function resolveApiUrl(configuredUrl?: string): string {
  const fallback = configuredUrl?.trim() || DEFAULT_API_URL;
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const parsed = new URL(fallback);
    if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
      return fallback;
    }
    const runtimeHost = window.location.hostname;

    // In deployed environments, a loopback-configured API URL is usually a misconfiguration.
    // Prefer api.<domain> when frontend runs on app.<domain>.
    if (!LOOPBACK_HOSTS.has(runtimeHost)) {
      const runtimeProtocol = window.location.protocol || "https:";
      if (runtimeHost.startsWith("app.")) {
        return `${runtimeProtocol}//${runtimeHost.replace(/^app\./, "api.")}`;
      }
      return `${runtimeProtocol}//${runtimeHost}`;
    }

    const protocol = parsed.protocol || window.location.protocol;
    const port = parsed.port || "8000";
    return `${protocol}//${runtimeHost}:${port}`;
  } catch {
    return fallback;
  }
}

const API_URL = resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
export { API_URL };

/** Django CSRF cookie name (default). Used when the API origin exposes `csrftoken` to JS (e.g. shared cookie domain). */
function readCsrfCookie(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function buildRequestSignal(externalSignal?: AbortSignal | null) {
  const hasFiniteTimeout = Number.isFinite(API_REQUEST_TIMEOUT_MS) && API_REQUEST_TIMEOUT_MS > 0;
  if (!hasFiniteTimeout && !externalSignal) {
    return {
      signal: undefined,
      didTimeout: () => false,
      cleanup: () => {},
    };
  }

  const controller = new AbortController();
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const onExternalAbort = () => {
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  if (hasFiniteTimeout) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, API_REQUEST_TIMEOUT_MS);
  }

  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    cleanup: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
    },
  };
}

function collectJsonMessage(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(collectJsonMessage).filter(Boolean).join(" ");
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  const record = value as Record<string, unknown>;
  const preferred = ["non_field_errors", "detail", "message", "error"];
  for (const key of preferred) {
    const found = collectJsonMessage(record[key]);
    if (found) {
      return found;
    }
  }
  for (const nested of Object.values(record)) {
    const found = collectJsonMessage(nested);
    if (found) {
      return found;
    }
  }
  return "";
}

const SIGNED_OUT_KEY = "ltf_signed_out_reason";

let recoveringDesk = false;

function leaveDeletedLogin(code: string) {
  clearToken();
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(SIGNED_OUT_KEY, code);
  const locale = readUiLocale();
  const target = `/${locale}/login`;
  if (!window.location.pathname.startsWith(target)) {
    replaceWithClientRouter(target);
  }
}

async function recoverClosedDesk() {
  if (recoveringDesk || typeof window === "undefined") {
    return;
  }
  recoveringDesk = true;
  const token = getToken();
  if (!token) {
    leaveDeletedLogin("account_unavailable");
    recoveringDesk = false;
    return;
  }
  try {
    const response = await fetch(`${API_URL}/api/auth/me/`, {
      headers: { Authorization: `Token ${token}` },
      credentials: "same-origin",
    });
    if (response.status === 401 || response.status === 403) {
      const body = (await response.json().catch(() => ({}))) as { detail?: string };
      const detail = String(body.detail || "");
      leaveDeletedLogin(detail === "token_sunset" ? "token_sunset" : "account_unavailable");
      return;
    }
    if (!response.ok) {
      return;
    }
    const me = (await response.json()) as {
      is_superuser?: boolean;
      role?: string;
      home_club_id?: number | null;
      desks?: DeskChoice[];
    };
    const choice = fallbackOpenDesk({
      isSuperuser: Boolean(me.is_superuser),
      desks: me.desks ?? [],
      role: me.role ?? "",
      homeClubId: me.home_club_id ?? null,
    });
    if (!choice) {
      rememberActiveDesk(null);
      const home = `/${readUiLocale()}/dashboard`;
      if (!window.location.pathname.startsWith(home)) {
        replaceWithClientRouter(home);
      }
      return;
    }
    rememberActiveDesk(deskHeaderValue(choice));
    if (choice.club_id) {
      window.sessionStorage.setItem("selected_club_id", String(choice.club_id));
    } else {
      window.sessionStorage.removeItem("selected_club_id");
    }
    const header = deskHeaderValue(choice);
    await fetch(`${API_URL}/api/auth/desk/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        "X-Desk": header,
      },
      credentials: "same-origin",
      body: JSON.stringify({ desk: choice.desk, club_id: choice.club_id }),
    }).catch(() => undefined);
    const route = routeForDesk(choice.desk, readUiLocale()) ?? `/${readUiLocale()}/dashboard`;
    if (window.location.pathname.startsWith(route)) {
      refreshWithClientRouter();
      return;
    }
    replaceWithClientRouter(route);
  } catch {
    return;
  } finally {
    recoveringDesk = false;
  }
}

async function executeApiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const requestUrl = `${API_URL}${path}`;
  const isFormDataRequest =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  const skipAuthHeader =
    path.startsWith("/api/auth/login/") ||
    path.startsWith("/api/auth/mfa/confirm/") ||
    path.startsWith("/api/auth/mfa/webauthn/login/") ||
    path.startsWith("/api/auth/verify-email/") ||
    path.startsWith("/api/auth/resend-verification/") ||
    path.startsWith("/api/auth/password-reset/") ||
    path.startsWith("/api/auth/account-setup/") ||
    path.startsWith("/api/module-renewals/");
  const deskHeader = !skipAuthHeader ? readActiveDeskHeader() : null;
  const defaultHeaders: Record<string, string> = {
    ...(token && !skipAuthHeader ? { Authorization: `Token ${token}` } : {}),
    ...(deskHeader ? { "X-Desk": deskHeader } : {}),
  };
  if (!isFormDataRequest) {
    defaultHeaders["Content-Type"] = "application/json";
  }
  const isLoginPath = path.startsWith("/api/auth/login/");
  const csrfToken = isLoginPath ? readCsrfCookie() : null;
  if (csrfToken) {
    defaultHeaders["X-CSRFToken"] = csrfToken;
  }
  const { signal, didTimeout, cleanup } = buildRequestSignal(options.signal);
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      ...options,
      signal,
      credentials:
        csrfToken != null ? "include" : (options.credentials ?? "same-origin"),
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });
  } catch (error) {
    cleanup();
    if (didTimeout()) {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  }
  cleanup();

  if (!response.ok) {
    const contentType = response.headers.get("content-type");
    const message = await response.text();
    let normalizedMessage = message;
    if (contentType?.includes("text/html")) {
      if (response.status === 413) {
        normalizedMessage = "Upload is too large. Please choose a smaller image.";
      } else if (response.status >= 500) {
        normalizedMessage = `Server error (${response.status}). Please try again.`;
      } else {
        normalizedMessage = `Request failed (${response.status}). Please try again.`;
      }
    }
    if (contentType?.includes("application/json") && message) {
      try {
        const parsed = JSON.parse(message) as {
          non_field_errors?: string[];
          detail?: string;
          message?: string;
          error?: string;
        };
        const fieldMessage = collectJsonMessage(parsed);
        if (fieldMessage) {
          normalizedMessage = fieldMessage;
        }
      } catch {
        normalizedMessage = message;
      }
    }
    const presented = presentAuthError(normalizedMessage || `Request failed with ${response.status}`);
    const sentDesk = options.headers?.["X-Desk"] ?? deskHeader;
    if (
      presented.code === "desk_not_granted" &&
      sentDesk &&
      sentDesk === readActiveDeskHeader() &&
      !path.startsWith("/api/auth/desk/")
    ) {
      void recoverClosedDesk();
      throw new AuthApiError("desk_not_granted", "", "info");
    }
    // Session auth is listed first, so DRF returns these sign-out codes as 403.
    if (
      (response.status === 401 || response.status === 403) &&
      !isLoginPath &&
      (presented.code === "account_unavailable" || presented.code === "token_sunset")
    ) {
      leaveDeletedLogin(presented.code);
    }
    if (presented.code) {
      throw new AuthApiError(presented.code, presented.text, presented.tone);
    }
    throw new Error(presented.text);
  }

  if (response.status === 204) {
    return null as T;
  }
  return (await response.json()) as T;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const requestUrl = `${API_URL}${path}`;
  const method = (options.method ?? "GET").toUpperCase();
  const token = getToken() ?? "";
  const shouldDedupeGetRequest = method === "GET" && !options.signal;
  const dedupeKey = shouldDedupeGetRequest ? `${method}:${requestUrl}:${token}` : null;
  if (!dedupeKey) {
    return executeApiRequest<T>(path, options);
  }

  const existingPromise = inFlightGetRequests.get(dedupeKey);
  if (existingPromise) {
    return existingPromise as Promise<T>;
  }

  const requestPromise = executeApiRequest<T>(path, options).finally(() => {
    inFlightGetRequests.delete(dedupeKey);
  });
  inFlightGetRequests.set(dedupeKey, requestPromise);
  return requestPromise;
}
