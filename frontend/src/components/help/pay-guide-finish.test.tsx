import { render } from "@testing-library/react";

import { PayGuideFinish } from "@/components/help/pay-guide-finish";
import { GUIDE_DONE_KEY, GUIDE_RUN_KEY } from "@/lib/guide-run";

jest.mock("@/lib/mfa-celebration", () => ({
  playMfaCelebration: jest.fn(),
}));

describe("PayGuideFinish", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("remembers a finished pay guide and does not start a payment", () => {
    window.sessionStorage.setItem(
      GUIDE_RUN_KEY,
      JSON.stringify({ id: "pay-invoice", stepId: "pay", mode: "walk" }),
    );
    render(<PayGuideFinish active />);
    expect(JSON.parse(window.sessionStorage.getItem(GUIDE_RUN_KEY) ?? "")).toMatchObject({ stepId: "paid" });
    expect(JSON.parse(window.localStorage.getItem(GUIDE_DONE_KEY) ?? "")).toEqual(["pay-invoice"]);
  });

  it("leaves the guide alone before the payment page is ready", () => {
    window.sessionStorage.setItem(
      GUIDE_RUN_KEY,
      JSON.stringify({ id: "pay-invoice", stepId: "pay", mode: "walk" }),
    );
    render(<PayGuideFinish active={false} />);
    expect(JSON.parse(window.sessionStorage.getItem(GUIDE_RUN_KEY) ?? "")).toMatchObject({ stepId: "pay" });
    expect(window.localStorage.getItem(GUIDE_DONE_KEY)).toBeNull();
  });
});
