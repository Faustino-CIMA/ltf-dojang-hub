"use client";

import { useParams } from "next/navigation";

import { HouseholdInvoiceView } from "@/components/clubmgmt/household-invoice-view";

export default function FamilyInvoicePage() {
  const params = useParams<{ id: string }>();
  return <HouseholdInvoiceView householdId={`family-${params.id}`} />;
}
