import { apiRequest } from "./api";

export type TrainingVenue = {
  id: number;
  club: number;
  name: string;
  street: string;
  house_number: string;
  line2: string;
  postal_code: string;
  locality: string;
  country: string;
  notes: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TrainingVenueInput = {
  name: string;
  street?: string;
  house_number?: string;
  line2?: string;
  postal_code?: string;
  locality?: string;
  country?: string;
  notes?: string;
  is_active?: boolean;
  sort_order?: number;
};

export function listTrainingVenues(clubId: number) {
  return apiRequest<TrainingVenue[]>(`/api/clubs/${clubId}/training-venues/`);
}

export function createTrainingVenue(clubId: number, input: TrainingVenueInput) {
  return apiRequest<TrainingVenue>(`/api/clubs/${clubId}/training-venues/`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTrainingVenue(clubId: number, venueId: number, input: Partial<TrainingVenueInput>) {
  return apiRequest<TrainingVenue>(`/api/clubs/${clubId}/training-venues/${venueId}/`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteTrainingVenue(clubId: number, venueId: number) {
  return apiRequest<void>(`/api/clubs/${clubId}/training-venues/${venueId}/`, {
    method: "DELETE",
  });
}

export function venueShortAddress(venue: Pick<TrainingVenue, "house_number" | "street" | "postal_code" | "locality">) {
  const street = [venue.house_number, venue.street].filter(Boolean).join(" ");
  const place = [venue.postal_code, venue.locality].filter(Boolean).join(" ");
  return [street, place].filter(Boolean).join(", ");
}
