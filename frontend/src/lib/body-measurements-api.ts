import { apiRequest } from "@/lib/api";

export type MeasurementKind = "weight" | "height" | "both";

export type BodyMeasurement = {
  id: number;
  member: number;
  measured_on: string;
  weight_kg: string | null;
  height_cm: number | null;
  note: string;
  recorded_by: number | null;
  created_at: string;
  updated_at: string;
};

export type WeightSuggestion = {
  age_class: string;
  category: string;
  weight_kg: string;
  measured_on: string;
};

export type MeasurementList = {
  results: BodyMeasurement[];
  suggestion: WeightSuggestion | null;
};

export type MeasurementInput = {
  member: number;
  measured_on: string;
  weight_kg?: string | null;
  height_cm?: number | null;
  note?: string;
};

export function getBodyMeasurements(memberId: number) {
  return apiRequest<MeasurementList>(`/api/club-management/measurements/?member=${memberId}`);
}

export function saveBodyMeasurement(id: number | null, input: MeasurementInput) {
  return apiRequest<BodyMeasurement>(`/api/club-management/measurements/${id ? `${id}/` : ""}`, {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(input),
  });
}

export function deleteBodyMeasurement(id: number) {
  return apiRequest<null>(`/api/club-management/measurements/${id}/`, { method: "DELETE" });
}

export function todayIsoDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function measurementKind(row: Pick<BodyMeasurement, "weight_kg" | "height_cm">): MeasurementKind {
  if (row.weight_kg && row.height_cm) return "both";
  if (row.height_cm) return "height";
  return "weight";
}
