import type { SetupStatus } from "./setup-api";

export const SETUP_STEPS = ["welcome", "clubs", "members", "admins", "done"] as const;
export type SetupStepId = (typeof SETUP_STEPS)[number];

export function setupStepIndex(status: Pick<SetupStatus, "started" | "completed" | "current_step">): number {
  if (status.completed || status.current_step === "done") {
    return 4;
  }
  if (!status.started) {
    return 0;
  }
  if (status.current_step === "admins") {
    return 3;
  }
  if (status.current_step === "members") {
    return 2;
  }
  return 1;
}
