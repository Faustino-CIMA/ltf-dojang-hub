import { fireEvent, render, screen } from "@testing-library/react";

import { GuideLayer } from "@/components/help/guide-layer";
import type { GuideRun } from "@/lib/guide-run";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${values.current} ${values.total} ${values.title}` : key,
}));

jest.mock("@/lib/mfa-celebration", () => ({
  playMfaCelebration: jest.fn(),
}));

describe("GuideLayer", () => {
  const rect = { x: 40, y: 40, width: 24, height: 24, top: 40, left: 40, bottom: 64, right: 64, toJSON() { return {}; } };

  beforeEach(() => {
    Element.prototype.getBoundingClientRect = () => rect as DOMRect;
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
      }) as MediaQueryList;
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("lets the real control receive the click, and moves on only then", () => {
    const clicked = jest.fn();
    const onRunChange = jest.fn();
    let run: GuideRun = { id: "order-license", stepId: "select-members", mode: "walk" };
    const view = render(
      <>
        <button type="button" data-guide="members.select-row" onClick={clicked}>
          Tick
        </button>
        <GuideLayer
          desk="club_admin"
          pathname="/en/dashboard/club/members"
          run={run}
          onRunChange={(next) => {
            run = next;
            onRunChange(next);
          }}
          onExit={() => undefined}
          onOpenManual={() => undefined}
        />
      </>,
    );
    expect(screen.getByLabelText(/guideStepName 1 8 orderLicenseTitle/)).toBeInTheDocument();
    expect(onRunChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tick" }));
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(onRunChange).toHaveBeenCalledWith({ id: "order-license", stepId: "open-actions", mode: "walk" });
    view.rerender(
      <>
        <button type="button" data-guide="members.select-row" onClick={clicked}>
          Tick
        </button>
        <GuideLayer
          desk="club_admin"
          pathname="/en/dashboard/club/members"
          run={run}
          onRunChange={onRunChange}
          onExit={() => undefined}
          onOpenManual={() => undefined}
        />
      </>,
    );
    expect(screen.getByLabelText(/guideStepName 2 8 orderLicenseTitle/)).toBeInTheDocument();
    expect(document.querySelector("[data-guide-layer]")?.className).toContain("pointer-events-none");
  });
});
