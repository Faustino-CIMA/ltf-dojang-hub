const STAFF_ERROR_KEYS: Record<string, string> = {
  past_year: "staffPastYear",
  year_not_allowed: "staffYearNotAllowed",
  licence_exists_for_year: "staffLicenceExists",
  active_licence_exists: "staffActiveLicenceExists",
};

export function staffActionErrorMessage(
  error: unknown,
  t: (key: string) => string,
  fallback: string,
) {
  const raw = error instanceof Error ? error.message.trim() : "";
  const key = STAFF_ERROR_KEYS[raw];
  if (key) {
    return t(key);
  }
  return raw || fallback;
}
