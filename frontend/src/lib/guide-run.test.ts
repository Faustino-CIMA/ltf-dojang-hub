import orderLicense from "@/content/guides/order-license.json";

import { advanceOnClick, parseGuideDone, parseGuideRun, sameRoute, withGuideDone, type GuideStep } from "./guide-run";

const steps = orderLicense.steps as GuideStep[];

describe("sameRoute", () => {
  it("keeps the members list and the order page apart", () => {
    expect(sameRoute("/dashboard/club/members", "/en/dashboard/club/members")).toBe(true);
    expect(sameRoute("/dashboard/club/members", "/en/dashboard/club/members?page=2")).toBe(true);
    expect(sameRoute("/dashboard/club/members", "/fr/dashboard/club/members/order-licenses")).toBe(false);
    expect(sameRoute("/dashboard/club/members/order-licenses", "/de/dashboard/club/members/order-licenses")).toBe(true);
  });
});

describe("advanceOnClick", () => {
  it("moves on only after the real control is used", () => {
    expect(advanceOnClick(steps, "select-members", "members.select-row", false)?.stepId).toBe("open-actions");
    expect(advanceOnClick(steps, "select-members", "members.select-row", true)).toBeNull();
    expect(advanceOnClick(steps, "select-members", "members.order-license", false)).toBeNull();
  });

  it("accepts the menu item once the menu step is current", () => {
    expect(advanceOnClick(steps, "open-actions", "members.order-license", false)?.stepId).toBe("choose-year");
  });

  it("waits on the order button until the page says the order exists", () => {
    expect(advanceOnClick(steps, "place-order", "order.submit", false)).toEqual({ stepId: "place-order", wait: true });
  });
});

describe("guide storage", () => {
  it("ignores a broken run and remembers a finished guide once", () => {
    expect(parseGuideRun("nope")).toBeNull();
    expect(parseGuideRun(JSON.stringify({ id: "order-license", stepId: "select-members", mode: "walk" }))?.id).toBe(
      "order-license",
    );
    expect(parseGuideDone("[]")).toEqual([]);
    expect(withGuideDone(["order-license"], "order-license")).toEqual(["order-license"]);
  });
});
