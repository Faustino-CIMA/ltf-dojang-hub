import type { HealthCheck } from "./ops-api";

export type OrderedHealthCheck = {
  key: string;
  check: HealthCheck | null;
};

export function orderOpsHealthChecks(
  reported: Record<string, HealthCheck | null | undefined> | null | undefined,
  knownKeys: readonly string[],
): OrderedHealthCheck[] {
  const entries = reported ? Object.entries(reported) : [];
  const known = knownKeys.map((key) => {
    const found = entries.find(([name]) => name === key);
    return { key, check: asHealthCheck(found?.[1]) };
  });
  const extras = entries
    .filter(([name]) => !knownKeys.includes(name))
    .map(([name, check]) => ({ key: name, check: asHealthCheck(check) }));
  return [...known, ...extras];
}

function asHealthCheck(value: HealthCheck | null | undefined): HealthCheck | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value;
}

export function healthDetailText(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }
  if (detail == null) {
    return "";
  }
  if (typeof detail === "number" || typeof detail === "boolean") {
    return String(detail);
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return "";
  }
}
