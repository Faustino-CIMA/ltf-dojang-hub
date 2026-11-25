import addMember from "@/content/guides/add-member.json";
import importMembers from "@/content/guides/import-members.json";
import orderLicense from "@/content/guides/order-license.json";
import payInvoice from "@/content/guides/pay-invoice.json";

import type { GuideDefinition } from "@/lib/guide-run";

export const guides: GuideDefinition[] = [
  orderLicense as GuideDefinition,
  addMember as GuideDefinition,
  importMembers as GuideDefinition,
  payInvoice as GuideDefinition,
];

export function guideById(id: string): GuideDefinition | null {
  return guides.find((guide) => guide.id === id) ?? null;
}

export function guideForManual(manual: string, desk: string | null): GuideDefinition | null {
  return (
    guides.find((guide) => guide.manual === manual && (desk == null || guide.desks.includes(desk))) ?? null
  );
}
