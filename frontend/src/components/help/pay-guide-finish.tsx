"use client";

import { useEffect } from "react";

import { playMfaCelebration } from "@/lib/mfa-celebration";
import { GUIDE_DONE_KEY, GUIDE_RUN_KEY, parseGuideDone, parseGuideRun, withGuideDone } from "@/lib/guide-run";

/** Marks the pay guide finished once the card page has sent the person back. Does not start or confirm a payment. */
export function PayGuideFinish({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) {
      return;
    }
    const run = parseGuideRun(window.sessionStorage.getItem(GUIDE_RUN_KEY));
    if (!run || run.id !== "pay-invoice" || run.stepId === "paid") {
      return;
    }
    const done = parseGuideDone(window.localStorage.getItem(GUIDE_DONE_KEY));
    if (!done.includes(run.id)) {
      window.localStorage.setItem(GUIDE_DONE_KEY, JSON.stringify(withGuideDone(done, run.id)));
      playMfaCelebration();
    }
    window.sessionStorage.setItem(GUIDE_RUN_KEY, JSON.stringify({ ...run, stepId: "paid" }));
  }, [active]);
  return null;
}
