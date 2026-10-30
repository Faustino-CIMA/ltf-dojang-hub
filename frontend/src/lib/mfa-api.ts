import { apiRequest } from "./api";
import type { AuthResponse, MfaStatus } from "./auth";

export function confirmMfa(token: string, code: string) {
  return apiRequest<AuthResponse>("/api/auth/mfa/confirm/", {
    method: "POST",
    body: JSON.stringify({ token, code }),
  });
}

export function beginTotp() {
  return apiRequest<{ secret: string; otpauth_url: string; qr_svg: string }>("/api/auth/mfa/totp/");
}

export function activateTotp(code: string) {
  return apiRequest<{ recovery_codes: string[]; mfa: MfaStatus }>("/api/auth/mfa/totp/", {
    method: "POST",
    body: JSON.stringify({ code }),
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
