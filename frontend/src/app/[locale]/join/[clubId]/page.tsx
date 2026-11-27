"use client";

import { useParams } from "next/navigation";

import { ClubJoinOverview } from "@/components/join/club-join-overview";

export default function JoinClubPage() {
  const params = useParams();
  const raw = typeof params?.clubId === "string" ? params.clubId : "";
  const clubId = Number(raw);
  if (!Number.isInteger(clubId) || clubId <= 0) {
    return null;
  }
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <ClubJoinOverview clubId={clubId} />
    </main>
  );
}
