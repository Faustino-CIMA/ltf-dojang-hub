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

export function unlockMemberCard(memberId: number, reason: string) {
  return apiRequest<VerificationState>(`/api/members/${memberId}/verification/unlock/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
