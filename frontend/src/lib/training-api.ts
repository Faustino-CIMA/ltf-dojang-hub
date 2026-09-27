import { apiRequest } from "./api";

export type TrainingAudience = "kids" | "adults" | "belt_test" | "competition" | "other";

export type TrainingSeries = {
  id: number;
  name: string;
  audience: TrainingAudience;
  weekday: number;
  start_time: string;
  end_time: string;
  valid_from: string;
  valid_until: string;
  skip_public_holidays: boolean;
  skip_school_holidays: boolean;
  counts_for_under_16: boolean;
  place: string;
  active: boolean;
  coach_ids: number[];
  coach_names: string[];
  regular_ids: number[];
};

export type TrainingSession = {
  id: number;
  series_id: number | null;
  name: string;
  audience: TrainingAudience;
  held_on: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "held" | "cancelled";
  hours: string;
  coach_ids: number[];
  coach_names: string[];
  present_ids: number[];
  notes: string;
};

export type TrainingRoll = {
  session: TrainingSession;
  suggested_ids: number[];
  coaches: { id: number; name: string }[];
  members: { id: number; name: string; date_of_birth: string; age: number | null }[];
};

const clubQuery = (clubId: number) => `club=${clubId}`;

export function getTrainingSeries(clubId: number) {
  return apiRequest<TrainingSeries[]>(`/api/club-management/training/series/?${clubQuery(clubId)}`);
}

export function saveTrainingSeries(clubId: number, payload: Record<string, unknown>, seriesId?: number) {
  return apiRequest<TrainingSeries>(
    seriesId
      ? `/api/club-management/training/series/${seriesId}/?${clubQuery(clubId)}`
      : `/api/club-management/training/series/?${clubQuery(clubId)}`,
    { method: seriesId ? "PATCH" : "POST", body: JSON.stringify({ ...payload, generate: true }) },
  );
}

export function getTrainingWeek(clubId: number) {
  return apiRequest<TrainingSession[]>(`/api/club-management/training/sessions/?${clubQuery(clubId)}&week=1`);
}

export function getTrainingSessions(clubId: number, from: string, to: string) {
  return apiRequest<TrainingSession[]>(
    `/api/club-management/training/sessions/?${clubQuery(clubId)}&from=${from}&to=${to}`,
  );
}

export function createTrainingSession(clubId: number, payload: Record<string, unknown>) {
  return apiRequest<TrainingSession>(`/api/club-management/training/sessions/?${clubQuery(clubId)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getTrainingRoll(clubId: number, sessionId: number) {
  return apiRequest<TrainingRoll>(`/api/club-management/training/sessions/${sessionId}/?${clubQuery(clubId)}`);
}

export function saveTrainingAttendance(clubId: number, sessionId: number, memberIds: number[], coachIds: number[]) {
  return apiRequest<TrainingRoll>(`/api/club-management/training/sessions/${sessionId}/attendance/?${clubQuery(clubId)}`, {
    method: "PUT",
    body: JSON.stringify({ member_ids: memberIds, coach_ids: coachIds }),
  });
}

export function updateTrainingSession(clubId: number, sessionId: number, payload: Record<string, unknown>) {
  return apiRequest<TrainingSession>(`/api/club-management/training/sessions/${sessionId}/?${clubQuery(clubId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getTrainingHolidays(clubId: number, year: number) {
  return apiRequest<{
    public: { date: string; name: string }[];
    school: { id: number; school_year: number; name: string; starts_on: string; ends_on: string }[];
  }>(`/api/club-management/training/holidays/?${clubQuery(clubId)}&year=${year}`);
}

export function addSchoolHoliday(clubId: number, payload: Record<string, unknown>) {
  return apiRequest(`/api/club-management/training/holidays/?${clubQuery(clubId)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteSchoolHoliday(clubId: number, holidayId: number) {
  return apiRequest<void>(`/api/club-management/training/holidays/${holidayId}/?${clubQuery(clubId)}`, {
    method: "DELETE",
  });
}

export type PayFrequency = "monthly" | "quarterly" | "twice";

export type CoachHourReport = {
  pay_frequency: PayFrequency;
  payday_day: number;
  quarter_anchor_month: number;
  first_payday_month: number;
  first_payday_day: number;
  second_payday_month: number;
  second_payday_day: number;
  periods: { label: string; starts_on: string; ends_on: string; coaches: { user_id: number; name: string; hours: string }[] }[];
};

export function getCoachHours(clubId: number, year: number) {
  return apiRequest<CoachHourReport>(`/api/club-management/training/coach-hours/?${clubQuery(clubId)}&year=${year}`);
}

export type PromotionRule = {
  id: number;
  to_grade: string;
  required_hours: string;
  audience: string;
};

export type BeltTestSummary = {
  id: number;
  name: string;
  held_on: string;
  notes: string;
  passed_count: number;
};

export type PromotionCandidate = {
  member_id: number;
  name: string;
  age: number | null;
  from_grade: string;
  to_grade: string;
  since: string;
  hours: string;
  required_hours: string;
  audience: string;
  ready: boolean;
  result: string;
};

export function getPromotionRules(clubId: number) {
  return apiRequest<{ grades: string[]; rules: PromotionRule[] }>(
    `/api/club-management/training/promotion/rules/?${clubQuery(clubId)}`,
  );
}

export function savePromotionRule(clubId: number, payload: Record<string, unknown>, ruleId?: number) {
  return apiRequest<PromotionRule>(
    ruleId
      ? `/api/club-management/training/promotion/rules/${ruleId}/?${clubQuery(clubId)}`
      : `/api/club-management/training/promotion/rules/?${clubQuery(clubId)}`,
    { method: ruleId ? "PATCH" : "POST", body: JSON.stringify(payload) },
  );
}

export function deletePromotionRule(clubId: number, ruleId: number) {
  return apiRequest<void>(`/api/club-management/training/promotion/rules/${ruleId}/?${clubQuery(clubId)}`, {
    method: "DELETE",
  });
}

export function getBeltTests(clubId: number) {
  return apiRequest<BeltTestSummary[]>(`/api/club-management/training/promotion/tests/?${clubQuery(clubId)}`);
}

export function createBeltTest(clubId: number, payload: Record<string, unknown>) {
  return apiRequest<BeltTestSummary>(`/api/club-management/training/promotion/tests/?${clubQuery(clubId)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getBeltTest(clubId: number, testId: number) {
  return apiRequest<BeltTestSummary & { candidates: PromotionCandidate[] }>(
    `/api/club-management/training/promotion/tests/${testId}/?${clubQuery(clubId)}`,
  );
}

export function recordBeltResult(clubId: number, testId: number, memberId: number, result: "passed" | "failed") {
  return apiRequest(`/api/club-management/training/promotion/tests/${testId}/result/?${clubQuery(clubId)}`, {
    method: "PUT",
    body: JSON.stringify({ member_id: memberId, result }),
  });
}

export function savePaydays(clubId: number, year: number, payload: Record<string, unknown>) {
  return apiRequest<CoachHourReport>(`/api/club-management/training/coach-hours/?${clubQuery(clubId)}&year=${year}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
