import { apiRequest } from "./api";
import type { CardCountry } from "./card-read";

export type VerificationState = {
  status: "verified" | "unverified";
  verified: boolean;
  method: string;
  verified_at: string | null;
  locked_fields: string[];
  country: CardCountry | "";
  has_number: boolean;
  challenge_open?: boolean;
  challenge_expires_at?: string | null;
};

export type CardCompareBody = {
  first_names: string;
  last_names: string;
  number: string;
  date_of_birth?: string;
  sex?: string;
  confirm_names?: boolean;
  keep_usual_name?: boolean;
};

export type CardCompareResult = {
  match?: boolean;
  verified?: boolean;
  needs_confirmation?: boolean;
  card_first_name?: string;
  card_last_name?: string;
  fields?: string[];
  reason?: string;
  status?: string;
  locked_fields?: string[];
};

export function getMemberVerification(memberId: number) {
  return apiRequest<VerificationState>(`/api/members/${memberId}/verification/`);
}

export function compareMemberCard(memberId: number, body: CardCompareBody) {
  return apiRequest<CardCompareResult>(`/api/members/${memberId}/verification/compare/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type CardChallenge = {
  token: string;
  expires_at: string;
};

export function cardCheckPath(locale: string, token: string) {
  return `/${locale}/card-check/${encodeURIComponent(token)}`;
}

export function createMemberChallenge(memberId: number) {
  return apiRequest<CardChallenge>(`/api/members/${memberId}/verification-challenges/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function cancelMemberChallenge(memberId: number, token: string) {
  return apiRequest<VerificationState>(`/api/members/${memberId}/verification-challenges/cancel/`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function getCardChallenge(token: string) {
  return apiRequest<{
    open: boolean;
    expires_at: string;
    country: CardCountry | "";
    has_number: boolean;
    verified: boolean;
  }>(`/api/verification-challenges/${encodeURIComponent(token)}/`);
}

export function compareCardChallenge(token: string, body: CardCompareBody) {
  return apiRequest<CardCompareResult>(`/api/verification-challenges/${encodeURIComponent(token)}/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function unlockMemberCard(memberId: number, reason: string) {
  return apiRequest<VerificationState>(`/api/members/${memberId}/verification/unlock/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
