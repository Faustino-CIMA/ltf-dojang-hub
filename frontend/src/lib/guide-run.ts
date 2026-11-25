export type GuideAdvance = "click" | "value" | "route" | "dialog" | "success" | "manual";

export type GuideStep = {
  id: string;
  anchor: string;
  route: string;
  titleKey: string;
  bodyKey: string;
  advance: GuideAdvance;
  /** What a typed value must look like before the step moves on. */
  shape?: "text" | "date";
};

export type GuideDefinition = {
  id: string;
  desks: string[];
  titleKey: string;
  manual: string;
  steps: GuideStep[];
};

export type GuideMode = "walk" | "map";

export type GuideRun = {
  id: string;
  stepId: string;
  mode: GuideMode;
};

export const GUIDE_RUN_KEY = "ltf.guide";
export const GUIDE_DONE_KEY = "ltf.guideDone";

/** Desks that have a guide. The shell uses this for the first-visit hint and does not load the guide file. */
export const GUIDE_DESKS = ["club_admin"];

export function deskHasGuide(desk: string | null): boolean {
  return desk != null && GUIDE_DESKS.includes(desk);
}

export function parseGuideRun(raw: string | null): GuideRun | null {
  if (!raw) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as Partial<GuideRun>;
    if (!value.id || typeof value.stepId !== "string") {
      return null;
    }
    if (value.mode !== "walk" && value.mode !== "map") {
      return null;
    }
    return { id: value.id, stepId: value.stepId, mode: value.mode };
  } catch {
    return null;
  }
}

export function parseGuideDone(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function withGuideDone(done: string[], id: string): string[] {
  return done.includes(id) ? done : [...done, id];
}

export function sameRoute(route: string, pathname: string): boolean {
  const bare = pathname.split("?")[0].replace(/^\/(en|fr|de|lb)(?=\/|$)/, "") || "/";
  const path = bare.length > 1 && bare.endsWith("/") ? bare.slice(0, -1) : bare;
  return path === route;
}

export function valueReady(value: string, shape?: "text" | "date"): boolean {
  const text = value.trim();
  if (shape === "date") {
    return /^\d{2}\.\d{2}\.\d{4}$/.test(text);
  }
  if (shape === "text") {
    return text.length > 0;
  }
  return /\d{4}/.test(text);
}

export function advanceOnClick(
  steps: GuideStep[],
  currentId: string,
  anchor: string,
  disabled: boolean,
): { stepId: string; wait: boolean } | null {
  if (disabled) {
    return null;
  }
  const currentIndex = steps.findIndex((step) => step.id === currentId);
  const index = steps.findIndex((step) => step.anchor === anchor);
  if (currentIndex < 0 || index < 0 || steps[index].advance !== "click") {
    return null;
  }
  const direct = index === currentIndex;
  const throughOpenMenu = index === currentIndex + 1 && steps[currentIndex].advance === "dialog";
  if (!direct && !throughOpenMenu) {
    return null;
  }
  const next = steps[index + 1];
  if (next?.advance === "success") {
    return { stepId: steps[index].id, wait: true };
  }
  return { stepId: next?.id ?? steps[index].id, wait: false };
}
