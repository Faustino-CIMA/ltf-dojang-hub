"use client";

import { useParams } from "next/navigation";

import { ClubJoinOverview } from "@/components/join/club-join-overview";

export default function JoinClubPage() {
  const params = useParams();
  const token = typeof params?.token === "string" ? params.token : "";
  if (!token) {
    return null;
  }
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <ClubJoinOverview token={token} />
    </main>
  );
}
