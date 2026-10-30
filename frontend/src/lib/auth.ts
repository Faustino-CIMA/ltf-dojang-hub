export type AuthUser = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_superuser: boolean;
  is_email_verified: boolean;
  consent_given: boolean;
  consent_given_at: string | null;
  home_club_id?: number | null;
};

export type AuthDesk = {
  desk: string;
  level: string;
  club_id: number | null;
  club_name?: string;
};

export type MfaStatus = {
  required: boolean;
  enrolled: boolean;
  recovery_codes: boolean;
  grace: boolean;
  grace_until: string | null;
  blocked: boolean;
  email_available: boolean;
  email_enabled: boolean;
  passkeys: number;
};

export type AuthResponse = {
  token: string;
  user?: AuthUser;
  desks?: AuthDesk[];
  last_desk?: { desk: string; level: string; club_id: number | null } | null;
  mfa?: MfaStatus;
  mfa_pending?: boolean;
  mfa_methods?: string[];
};

const TOKEN_KEY = "ltf_token";

export function setToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token);
    window.dispatchEvent(new Event("auth-changed"));
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event("auth-changed"));
  }
}
