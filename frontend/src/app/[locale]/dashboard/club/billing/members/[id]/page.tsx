"use client";

import { useParams } from "next/navigation";

import { HouseholdInvoiceView } from "@/components/clubmgmt/household-invoice-view";

export default function MemberInvoicePage() {
  const params = useParams<{ id: string }>();
  return <HouseholdInvoiceView householdId={`member-${params.id}`} />;
}
