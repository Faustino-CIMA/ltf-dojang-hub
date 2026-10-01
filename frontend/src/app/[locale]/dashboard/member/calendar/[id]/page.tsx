"use client";

import { useParams } from "next/navigation";

import { EventFormPage } from "@/components/events/event-form-page";

export default function MemberCalendarEventPage() {
  const params = useParams();
  const eventId = Number(params.id);
  return <EventFormPage variant="member" eventId={eventId} />;
}
