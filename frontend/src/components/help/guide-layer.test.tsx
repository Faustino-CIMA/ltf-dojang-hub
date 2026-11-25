import { readFileSync } from "node:fs";
import path from "node:path";

import { act, fireEvent, render, screen } from "@testing-library/react";

import { GuideLayer } from "@/components/help/guide-layer";
import type { GuideRun } from "@/lib/guide-run";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${values.current} ${values.total} ${values.title}` : key,
}));

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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
    mockPush.mockClear();
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

  it("highlights the next control inside an opened menu", async () => {
    let run: GuideRun = { id: "add-member", stepId: "open-menu", mode: "walk" };
    const onRunChange = jest.fn((next: GuideRun) => {
      run = next;
    });
    const layer = (current: GuideRun) => (
      <GuideLayer
        desk="club_admin"
        pathname="/en/dashboard/club/members"
        run={current}
        onRunChange={onRunChange}
        onExit={() => undefined}
        onOpenManual={() => undefined}
      />
    );
    const view = render(
      <>
        <button type="button" data-guide="members.menu" data-state="closed">
          Members
        </button>
        <div data-radix-popper-content-wrapper="" style={{ transform: "translate(0, -200%)" }}>
          <button type="button" data-guide="members.create">
            Add member
          </button>
        </div>
        {layer(run)}
      </>,
    );

    expect(document.querySelector("[data-guide-highlight='members.menu']")).not.toBeNull();
    screen.getByRole("button", { name: "Members" }).setAttribute("data-state", "open");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onRunChange).toHaveBeenCalledWith({ id: "add-member", stepId: "open-form", mode: "walk" });

    view.rerender(
      <>
        <button type="button" data-guide="members.menu" data-state="open">
          Members
        </button>
        <div data-radix-popper-content-wrapper="" style={{ transform: "translate(0, -200%)" }}>
          <button type="button" data-guide="members.create">
            Add member
          </button>
        </div>
        {layer(run)}
      </>,
    );
    expect(document.querySelector("[data-guide-highlight='members.create']")).toBeNull();
    expect(document.querySelector("[data-guide-highlight='members.menu']")).not.toBeNull();

    const wrapper = document.querySelector<HTMLElement>("[data-radix-popper-content-wrapper]");
    wrapper?.style.setProperty("transform", "translate(0px, 8px)");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const highlight = document.querySelector<HTMLElement>("[data-guide-highlight='members.create']");
    const ring = highlight?.querySelector(".guide-run");
    expect(ring).not.toBeNull();
    expect(highlight?.className).not.toContain("guide-run");
    const bubble = document.querySelector("aside");
    expect(bubble?.className).toContain("guide-static-border");
    expect(bubble?.className).not.toContain("guide-run");
    const nav = document.querySelector("[data-guide-nav]");
    expect(nav?.className).toContain("guide-static-border");
    expect(nav?.className).not.toContain("guide-run");
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("--guide-run-duration: 2.4s");
    expect(css).toContain("animation: guide-run var(--guide-run-duration) linear infinite");
    expect(css).toContain("mask-clip: padding-box, border-box");
    expect(css).toContain("mask-composite: exclude");
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.guide-run\s*\{[^}]*animation:\s*none/);
  });

  it("stays on a page that already shows Security", () => {
    render(
      <>
        <button type="button" data-guide="mfa.security">
          Security
        </button>
        <GuideLayer
          desk="club_admin"
          pathname="/fr/dashboard/ltf"
          run={{ id: "authenticator", stepId: "security", mode: "walk" }}
          onRunChange={() => undefined}
          onExit={() => undefined}
          onOpenManual={() => undefined}
        />
      </>,
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(document.querySelector("[data-guide-highlight='mfa.security']")).not.toBeNull();
  });

  it("waits for the saved-codes control before leaving Continue", async () => {
    let run: GuideRun = { id: "authenticator", stepId: "confirm", mode: "walk" };
    const onRunChange = jest.fn((next: GuideRun) => {
      run = next;
    });
    const layer = (current: GuideRun) => (
      <GuideLayer
        desk="club_admin"
        pathname="/en/dashboard/club"
        run={current}
        onRunChange={onRunChange}
        onExit={() => undefined}
        onOpenManual={() => undefined}
      />
    );
    const view = render(
      <div>
        {layer(run)}
        <div>
          <button type="button" data-guide="mfa.confirm">
            Continue
          </button>
        </div>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onRunChange).not.toHaveBeenCalled();
    view.rerender(
      <div>
        {layer(run)}
        <div>
          <button type="button" data-guide="mfa.confirm">
            Continue
          </button>
          <button type="button" data-guide="mfa.saved">
            I have saved these codes
          </button>
        </div>
      </div>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onRunChange).toHaveBeenCalledWith({ id: "authenticator", stepId: "saved", mode: "walk" });
  });

  it("opens the members list from a member page", () => {
    render(
      <GuideLayer
        desk="club_admin"
        pathname="/en/dashboard/club/members/43"
        run={{ id: "order-license", stepId: "select-members", mode: "walk" }}
        onRunChange={() => undefined}
        onExit={() => undefined}
        onOpenManual={() => undefined}
      />,
    );
    expect(mockPush).toHaveBeenCalledWith("/en/dashboard/club/members");
    expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining("shop"));
  });
});
