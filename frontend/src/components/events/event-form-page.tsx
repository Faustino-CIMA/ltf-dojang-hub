"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { ClubAdminLayout } from "@/components/club-admin/club-admin-layout";
import { useClubSelection } from "@/components/club-selection-provider";
import { LtfAdminLayout } from "@/components/ltf-admin/ltf-admin-layout";
import { MemberLayout } from "@/components/member/member-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionNotices, FormPanel } from "@/components/ui/list-page-chrome";
import { createEvent, deleteEvent, getEvent, updateEvent, type EventVisibility } from "@/lib/events-api";

type FormVariant = "ltf" | "club" | "member";

type EventFormPageProps = {
  variant: FormVariant;
  eventId?: number;
};

const schema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  venue_name: z.string().optional(),
  venue_address: z.string().optional(),
  starts_local: z.string().min(1),
  ends_local: z.string().min(1),
  all_day: z.boolean(),
  visibility: z.enum(["public", "internal", "private"]),
});

type FormValues = z.infer<typeof schema>;

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

export function EventFormPage({ variant, eventId }: EventFormPageProps) {
  const t = useTranslations("Events");
  const locale = useLocale();
  const router = useRouter();
  const { selectedClubId } = useClubSelection();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(variant !== "member");
  const listHref =
    variant === "ltf"
      ? `/${locale}/dashboard/ltf/calendar`
      : variant === "club"
        ? `/${locale}/dashboard/club/calendar`
        : `/${locale}/dashboard/member/calendar`;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      venue_name: "",
      venue_address: "",
      starts_local: "",
      ends_local: "",
      all_day: false,
      visibility: "public",
    },
  });
  const allDay = form.watch("all_day");

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    getEvent(eventId)
      .then((event) => {
        if (cancelled) return;
        setCanEdit(event.can_edit && variant !== "member");
        form.reset({
          title: event.title,
          description: event.description,
          venue_name: event.venue_name,
          venue_address: event.venue_address,
          all_day: event.all_day,
          visibility: event.visibility,
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
  }, [eventId, form, t, variant]);

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
      visibility: values.visibility as EventVisibility,
      starts_at: fromLocalValue(values.starts_local, values.all_day, false),
      ends_at: fromLocalValue(values.ends_local, values.all_day, true),
      owner_scope: variant === "club" ? ("club" as const) : ("federation" as const),
      club: variant === "club" ? selectedClubId : null,
      kind: "calendar" as const,
    };
    try {
      if (eventId) {
        await updateEvent(eventId, payload);
      } else {
        await createEvent(payload);
      }
      router.push(listHref);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("calendarSaveError"));
    }
  });

  const onDelete = async () => {
    if (!eventId) return;
    setErrorMessage(null);
    try {
      await deleteEvent(eventId);
      router.push(listHref);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("calendarSaveError"));
    }
  };

  const readOnly = !canEdit;
  const title = eventId ? t("calendarEditTitle") : t("calendarNewTitle");

  const body = (
    <>
      <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />
      <FormPanel>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div>
            <Label htmlFor="title">{t("calendarFieldTitle")}</Label>
            <Input id="title" className="mt-1" disabled={readOnly} {...form.register("title")} />
          </div>
          <div>
            <Label htmlFor="description">{t("calendarFieldDescription")}</Label>
            <textarea
              id="description"
              disabled={readOnly}
              className="mt-1 min-h-28 w-full rounded-[var(--radius-form)] border border-[var(--border)] bg-[var(--field-background)] px-3 py-2 text-sm"
              {...form.register("description")}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="all_day"
              checked={allDay}
              disabled={readOnly}
              onCheckedChange={(checked) => form.setValue("all_day", Boolean(checked))}
            />
            <Label htmlFor="all_day">{t("calendarAllDay")}</Label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="starts_local">{t("calendarFieldStart")}</Label>
              <Input
                id="starts_local"
                type={allDay ? "date" : "datetime-local"}
                className="mt-1"
                disabled={readOnly}
                {...form.register("starts_local")}
              />
            </div>
            <div>
              <Label htmlFor="ends_local">{t("calendarFieldEnd")}</Label>
              <Input
                id="ends_local"
                type={allDay ? "date" : "datetime-local"}
                className="mt-1"
                disabled={readOnly}
                {...form.register("ends_local")}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="venue_name">{t("calendarFieldVenue")}</Label>
            <Input id="venue_name" className="mt-1" disabled={readOnly} {...form.register("venue_name")} />
          </div>
          <div>
            <Label htmlFor="venue_address">{t("calendarFieldAddress")}</Label>
            <Input id="venue_address" className="mt-1" disabled={readOnly} {...form.register("venue_address")} />
          </div>
          {variant !== "member" ? (
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium leading-none">{t("calendarFieldVisibility")}</legend>
              <p className="text-sm text-muted">{t("calendarVisibilityIntro")}</p>
              {(["public", "internal", "private"] as const).map((value) => {
                const checked = form.watch("visibility") === value;
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
                      <span className="block font-medium text-foreground">
                        {t(`calendarVisibility_${value}`)}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {t(`calendarVisibilityDetail_${value}_${scope}`)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {readOnly ? null : (
              <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
                {t("calendarSave")}
              </Button>
            )}
            {readOnly || !eventId ? null : (
              <Button type="button" variant="destructive" onClick={() => void onDelete()}>
                {t("calendarDelete")}
              </Button>
            )}
            <Button type="button" variant="outline" asChild>
              <Link href={listHref}>{t("calendarBack")}</Link>
            </Button>
          </div>
        </form>
      </FormPanel>
    </>
  );

  if (variant === "ltf") {
    return (
      <LtfAdminLayout title={title} subtitle={t("calendarFormSubtitle")}>
        {body}
      </LtfAdminLayout>
    );
  }
  if (variant === "club") {
    return (
      <ClubAdminLayout title={title} subtitle={t("calendarFormSubtitle")}>
        {body}
      </ClubAdminLayout>
    );
  }
  return (
    <MemberLayout title={title} subtitle={t("calendarFormSubtitle")}>
      {body}
    </MemberLayout>
  );
}
