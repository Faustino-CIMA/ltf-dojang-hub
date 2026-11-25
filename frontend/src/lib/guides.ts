import orderLicense from "@/content/guides/order-license.json";

import type { GuideDefinition } from "@/lib/guide-run";

export const guides: GuideDefinition[] = [orderLicense as GuideDefinition];

export function guideById(id: string): GuideDefinition | null {
  return guides.find((guide) => guide.id === id) ?? null;
}

export function guideForManual(manual: string, desk: string | null): GuideDefinition | null {
  return (
    guides.find((guide) => guide.manual === manual && (desk == null || guide.desks.includes(desk))) ?? null
  );
}
