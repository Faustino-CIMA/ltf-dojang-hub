"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { useClubSelection } from "@/components/club-selection-provider";
import { EventReminderPanel } from "@/components/events/event-reminder-panel";
import { notifyCalendarAttention } from "@/components/events/use-calendar-attention";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices } from "@/components/ui/list-page-chrome";
import { PopoverSelect } from "@/components/ui/popover-select";
import { SidePanel } from "@/components/ui/side-panel";
import { getClubs } from "@/lib/club-admin-api";
import {
  createEvent,
  getEvent,
  updateEvent,
  type CalendarEvent,
  type EventKind,
  type EventVisibility,
} from "@/lib/events-api";

type FormVariant = "ltf" | "club" | "member";

const FORM_ID = "calendar-event-form";

const schema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    venue_name: z.string().optional(),
    venue_address: z.string().optional(),
    starts_local: z.string().min(1),
    ends_local: z.string().min(1),
    all_day: z.boolean(),
    kind: z.enum(["calendar", "kyorugi", "poomsae"]),
    visibility: z.enum(["public", "internal", "private", "shared", "presidents"]),
    audience_clubs: z.array(z.number()),
  })
  .superRefine((values, ctx) => {
    if (values.visibility === "presidents" && values.audience_clubs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audience_clubs"],
        message: "presidents",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

const emptyValues: FormValues = {
  title: "",
  description: "",
  venue_name: "",
  venue_address: "",
  starts_local: "",
  ends_local: "",
  all_day: false,
  kind: "calendar",
  visibility: "public",
  audience_clubs: [],
};

function toLocalValue(iso: string, allDay: boolean): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  if (allDay) return `${y}-${m}-${d}`;
  return `${y}-${m}-${d}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalValue(value: string, allDay: boolean, end: boolean): string {
  if (allDay) {
    const suffix = end ? "T23:59:00" : "T00:00:00";
    return new Date(`${value}${suffix}`).toISOString();
  }
  return new Date(value).toISOString();
}

export function EventFormPanel({
  open,
  variant,
  eventId,
  onClose,
  onSaved,
  onRequestDelete,
}: {
  open: boolean;
  variant: FormVariant;
  eventId?: number;
  onClose: () => void;
  onSaved: () => void;
  onRequestDelete?: (title: string) => void;
}) {
  const t = useTranslations("Events");
  const { selectedClubId } = useClubSelection();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(variant !== "member");
  const [clubs, setClubs] = useState<Array<{ id: number; name: string }>>([]);
  const [loadedEvent, setLoadedEvent] = useState<CalendarEvent | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  });
  const allDay = form.watch("all_day");
  const visibility = form.watch("visibility");
  const audienceClubs = form.watch("audience_clubs");

  useEffect(() => {
    if (variant !== "ltf") return;
    let cancelled = false;
    getClubs()
      .then((rows) => {
        if (!cancelled) {
          setClubs(rows.filter((club) => club.is_active).map((club) => ({ id: club.id, name: club.name })));
        }
      })
      .catch(() => {
        if (!cancelled) setClubs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [variant]);

  useEffect(() => {
    if (!open) return;
    if (!eventId) {
      setLoadedEvent(null);
      setCanEdit(variant !== "member");
      setErrorMessage(null);
      form.reset(emptyValues);
      return;
    }
    let cancelled = false;
    getEvent(eventId)
      .then((event) => {
        if (cancelled) return;
        setLoadedEvent(event);
        notifyCalendarAttention();
        setCanEdit(event.can_edit && variant !== "member");
        form.reset({
          title: event.title,
          description: event.description,
          venue_name: event.venue_name,
          venue_address: event.venue_address,
          all_day: event.all_day,
          kind: event.kind,
          visibility: event.visibility,
          audience_clubs: event.audience_clubs ?? [],
          starts_local: toLocalValue(event.starts_at, event.all_day),
          ends_local: toLocalValue(event.ends_at, event.all_day),
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : t("calendarLoadError"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, form, open, t, variant]);

  const onSubmit = form.handleSubmit(async (values) => {
    setErrorMessage(null);
    if (variant === "club" && selectedClubId == null) {
      setErrorMessage(t("calendarNeedClub"));
      return;
    }
    const payload = {
      title: values.title,
      description: values.description ?? "",
      venue_name: values.venue_name ?? "",
      venue_address: values.venue_address ?? "",
      all_day: values.all_day,
      kind: values.kind as EventKind,
      visibility: values.visibility as EventVisibility,
      audience_clubs: values.visibility === "presidents" ? values.audience_clubs : [],
      starts_at: fromLocalValue(values.starts_local, values.all_day, false),
      ends_at: fromLocalValue(values.ends_local, values.all_day, true),
      owner_scope: variant === "club" ? ("club" as const) : ("federation" as const),
      club: variant === "club" ? selectedClubId : null,
    };
    try {
      if (eventId) {
        await updateEvent(eventId, payload);
      } else {
        await createEvent(payload);
      }
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("calendarSaveError"));
    }
  });

  const readOnly = !canEdit;
  const title = eventId ? t("calendarEditTitle") : t("calendarNewTitle");
  const visibilityOptions =
    variant === "ltf"
      ? (["public", "internal", "private", "shared", "presidents"] as const)
      : (["public", "internal", "private", "shared"] as const);

  return (
    <SidePanel
      open={open}
      wide
      title={title}
      description={t("calendarFormSubtitle")}
      closeLabel={t("calendarBack")}
      onClose={onClose}
      footer={
        readOnly ? null : (
          <>
            <Button type="button" variant="outline" onClick={onClose} disabled={form.formState.isSubmitting}>
              {t("calendarBack")}
            </Button>
            {eventId && onRequestDelete ? (
              <Button
                type="button"
                variant="destructive"
                disabled={form.formState.isSubmitting}
                onClick={() => onRequestDelete(form.getValues("title"))}
              >
                {t("calendarDelete")}
              </Button>
            ) : null}
            <Button type="submit" form={FORM_ID} variant="primary" disabled={form.formState.isSubmitting}>
              {t("calendarSave")}
            </Button>
          </>
        )
      }
    >
      <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
      {variant === "club" && eventId && loadedEvent ? (
        <div className="mb-4">
          <EventReminderPanel
            eventId={eventId}
            startsAt={loadedEvent.starts_at}
            endsAt={loadedEvent.ends_at}
            initial={loadedEvent.reminder}
          />
        </div>
      ) : null}
      <form id={FORM_ID} onSubmit={onSubmit} className="grid gap-4">
        <div>
          <Label htmlFor="calendar-title" required>
            {t("calendarFieldTitle")}
          </Label>
          <Input id="calendar-title" className="mt-1" disabled={readOnly} {...form.register("title")} />
        </div>
        <div>
          <Label htmlFor="calendar-description">{t("calendarFieldDescription")}</Label>
          <textarea
            id="calendar-description"
            disabled={readOnly}
            className="mt-1 min-h-28 w-full rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 py-2 text-sm"
            {...form.register("description")}
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="calendar-all-day"
            checked={allDay}
            disabled={readOnly}
            onCheckedChange={(checked) => form.setValue("all_day", Boolean(checked))}
          />
          <Label htmlFor="calendar-all-day">{t("calendarAllDay")}</Label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="calendar-starts" required>
              {t("calendarFieldStart")}
            </Label>
            <Input
              id="calendar-starts"
              type={allDay ? "date" : "datetime-local"}
              className="mt-1"
              disabled={readOnly}
              {...form.register("starts_local")}
            />
          </div>
          <div>
            <Label htmlFor="calendar-ends" required>
              {t("calendarFieldEnd")}
            </Label>
            <Input
              id="calendar-ends"
              type={allDay ? "date" : "datetime-local"}
              className="mt-1"
              disabled={readOnly}
              {...form.register("ends_local")}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="calendar-venue">{t("calendarFieldVenue")}</Label>
          <Input id="calendar-venue" className="mt-1" disabled={readOnly} {...form.register("venue_name")} />
        </div>
        <div>
          <Label htmlFor="calendar-address">{t("calendarFieldAddress")}</Label>
          <Input id="calendar-address" className="mt-1" disabled={readOnly} {...form.register("venue_address")} />
        </div>
        <div>
          <Label>{t("calendarFieldKind")}</Label>
          <PopoverSelect
            className="mt-1 w-full"
            value={form.watch("kind")}
            onValueChange={(value) => form.setValue("kind", value as FormValues["kind"])}
            ariaLabel={t("calendarFieldKind")}
            disabled={readOnly}
            options={(["calendar", "kyorugi", "poomsae"] as const).map((value) => ({
              value,
              label: t(`calendarKind_${value}`),
            }))}
          />
        </div>
        {variant !== "member" ? (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium leading-none">{t("calendarFieldVisibility")}</legend>
            <p className="text-sm text-muted">{t("calendarVisibilityIntro")}</p>
            {visibilityOptions.map((value) => {
              const checked = visibility === value;
              const scope = variant === "club" ? "club" : "federation";
              return (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-form)] border p-3 ${
                    checked ? "border-primary bg-[var(--accent-soft)]" : "border-[var(--border)]"
                  } ${readOnly ? "pointer-events-none opacity-70" : ""}`}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={value}
                    checked={checked}
                    disabled={readOnly}
                    onChange={() => form.setValue("visibility", value)}
                    className="mt-1 size-4 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block font-medium text-foreground">{t(`calendarVisibility_${value}`)}</span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {t(`calendarVisibilityDetail_${value}_${scope}`)}
                    </span>
                  </span>
                </label>
              );
            })}
            {visibility === "presidents" && variant === "ltf" ? (
              <fieldset className="grid gap-2 pt-2">
                <legend className="text-sm font-medium leading-none">{t("calendarAudienceClubs")}</legend>
                <p className="text-sm text-muted">{t("calendarAudienceClubsHint")}</p>
                {clubs.map((club) => {
                  const checked = audienceClubs.includes(club.id);
                  const inputId = `audience-club-${club.id}`;
                  return (
                    <div key={club.id} className="flex items-center gap-2">
                      <Checkbox
                        id={inputId}
                        checked={checked}
                        disabled={readOnly}
                        onCheckedChange={(next) => {
                          const current = form.getValues("audience_clubs");
                          const without = current.filter((id) => id !== club.id);
                          form.setValue("audience_clubs", next ? [...without, club.id] : without, {
                            shouldValidate: true,
                          });
                        }}
                      />
                      <Label htmlFor={inputId}>{club.name}</Label>
                    </div>
                  );
                })}
                {form.formState.errors.audience_clubs ? (
                  <p className="text-sm text-destructive">{t("calendarNeedPresidents")}</p>
                ) : null}
              </fieldset>
            ) : null}
          </fieldset>
        ) : null}
      </form>
    </SidePanel>
  );
}
