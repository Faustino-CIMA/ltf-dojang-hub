"use client";

import { useParams } from "next/navigation";

import { EventFormPage } from "@/components/events/event-form-page";

export default function LtfCalendarEventPage() {
  const params = useParams();
  const eventId = Number(params.id);
  return <EventFormPage variant="ltf" eventId={eventId} />;
}
