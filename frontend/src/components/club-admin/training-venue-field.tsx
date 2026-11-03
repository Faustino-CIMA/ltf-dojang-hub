"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { TrainingVenuePicker, type VenueChoice } from "@/components/club-admin/training-venue-picker";
import { Label } from "@/components/ui/label";
import { listTrainingVenues, type TrainingVenue } from "@/lib/training-venues";

export function useClubTrainingVenues(clubId: number | null, enabled: boolean) {
  const [venues, setVenues] = useState<TrainingVenue[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  const [failedFor, setFailedFor] = useState<number | null>(null);

  useEffect(() => {
    if (!clubId || !enabled) {
      return;
    }
    let cancelled = false;
    listTrainingVenues(clubId)
      .then((rows) => {
        if (cancelled) return;
        setVenues(rows);
        setLoadedFor(clubId);
        setFailedFor(null);
      })
      .catch(() => {
        if (cancelled) return;
        setVenues(null);
        setLoadedFor(clubId);
        setFailedFor(clubId);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId, enabled]);

  if (!enabled || clubId == null || loadedFor !== clubId) {
    return { venues: null, loadFailed: false };
  }
  return { venues, loadFailed: failedFor === clubId };
}

export function TrainingVenueField({
  venues,
  loadFailed = false,
  venueId,
  place,
  knownName = "",
  onChange,
}: {
  venues: TrainingVenue[] | null;
  loadFailed?: boolean;
  venueId: number | null;
  place: string;
  knownName?: string;
  onChange: (choice: VenueChoice) => void;
}) {
  const t = useTranslations("ClubAdmin");
  const locale = useLocale();
  return (
    <div>
      <Label>{t("trainingPlace")}</Label>
      <p className="mt-1 text-xs text-muted">{t("trainingPlaceHint")}</p>
      <div className="mt-2">
        <TrainingVenuePicker
          venues={venues}
          venueId={venueId}
          place={place}
          knownName={knownName}
          loadFailed={loadFailed}
          settingsHref={`/${locale}/dashboard/club/settings#training-venues`}
          onChange={onChange}
          ariaLabel={t("trainingVenueAria")}
          searchPlaceholder={t("trainingVenueSearch")}
          emptySearch={t("trainingVenueSearchEmpty")}
          noneLabel={t("trainingVenueNone")}
          legacyHint={t("trainingVenueLegacyHint")}
          inactiveLabel={t("trainingVenueInactive")}
          emptyTitle={t("trainingVenueEmptyTitle")}
          emptyBody={t("trainingVenueEmptyBody")}
          emptyLink={t("trainingVenueEmptyLink")}
          loadError={t("trainingVenueLoadError")}
          loadingLabel={t("trainingVenueLoading")}
        />
      </div>
    </div>
  );
}
