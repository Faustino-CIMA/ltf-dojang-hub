import { apiRequest } from "./api";
import { getToken, setToken, type AuthResponse, type MfaStatus } from "./auth";

export function confirmMfa(token: string, code: string) {
  return apiRequest<AuthResponse>("/api/auth/mfa/confirm/", {
    method: "POST",
    body: JSON.stringify({ token, code }),
  });
}

export function beginTotp(fresh = false) {
  const path = fresh ? "/api/auth/mfa/totp/?fresh=1" : "/api/auth/mfa/totp/";
  return apiRequest<{ secret: string; otpauth_url: string; qr_svg: string }>(path);
}

export function totpDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function mfaFailureKey(message: string) {
  if (message.includes("mfa_sign_in_again") || message.includes("mfa_not_pending")) {
    return "mfaSignInAgain" as const;
  }
  if (message.includes("rate_limited") || message.includes("too_many_login_attempts")) {
    return "mfaRateLimited" as const;
  }
  if (message.includes("email_not_accepted")) {
    return "mfaEmailEnableHint" as const;
  }
  if (message.includes("incorrect_password") || message.includes("Incorrect password")) {
    return "mfaReauthFailed" as const;
  }
  if (message.includes("incorrect_code") || message.includes("Incorrect code")) {
    return "mfaFailed" as const;
  }
  return "mfaUnexpected" as const;
}

export async function reauthenticate(password: string) {
  const token = getToken() ?? "";
  const result = await apiRequest<{ meta?: { session_token?: string } }>("/_allauth/app/v1/auth/reauthenticate", {
    method: "POST",
    body: JSON.stringify({ password }),
    headers: { "X-Session-Token": token },
  });
  const nextToken = result.meta?.session_token;
  if (nextToken && nextToken !== token) {
    setToken(nextToken);
  }
  return result;
}

export function activateTotp(code: string) {
  return apiRequest<{ recovery_codes: string[]; mfa: MfaStatus }>("/api/auth/mfa/totp/", {
    method: "POST",
    body: JSON.stringify({ code: totpDigits(code) }),
  });
}

export function beginPasskeyRegistration() {
  return apiRequest<PublicKeyCredentialCreationOptionsJSON>("/api/auth/mfa/webauthn/");
}

export function finishPasskeyRegistration(name: string, credential: unknown) {
  return apiRequest<{ recovery_codes: string[]; mfa: MfaStatus }>("/api/auth/mfa/webauthn/", {
    method: "POST",
    body: JSON.stringify({ name, credential }),
  });
}

export function beginPasskeyLogin() {
  return apiRequest<{ token: string; options: PublicKeyCredentialRequestOptionsJSON }>("/api/auth/mfa/webauthn/login/");
}

export function finishPasskeyLogin(token: string, credential: unknown) {
  return apiRequest<AuthResponse>("/api/auth/mfa/webauthn/login/", {
    method: "POST",
    body: JSON.stringify({ token, credential }),
  });
}

export function sendEmailMfaCode() {
  return apiRequest<{ detail: string }>("/api/auth/mfa/email/", {
    method: "POST",
    body: JSON.stringify({ action: "send" }),
  });
}

export function enableEmailMfa(code: string) {
  return apiRequest<MfaStatus>("/api/auth/mfa/email/", {
    method: "POST",
    body: JSON.stringify({ action: "enable", code }),
  });
}

export function disableEmailMfa() {
  return apiRequest<MfaStatus>("/api/auth/mfa/email/", {
    method: "POST",
    body: JSON.stringify({ action: "disable" }),
  });
}
