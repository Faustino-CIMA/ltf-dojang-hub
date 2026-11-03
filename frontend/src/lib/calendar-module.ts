/**
 * A failed module-status request must not hide the calendar.
 * Only an explicit "off" from a successful status response does.
 */
export function calendarModuleAvailable(result: { ok: true; enabled: boolean } | { ok: false }): boolean {
  if (!result.ok) {
    return true;
  }
  return result.enabled;
}
