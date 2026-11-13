import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";

import { AuthFrame } from "./auth-frame";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/en/login",
}));

describe("auth frame", () => {
  it("keeps the fields in one card with a reserved height", () => {
    render(
      <AuthFrame backHref="/en" backLabel="backHome">
        <p>Sign-in fields</p>
      </AuthFrame>,
    );

    const cards = document.querySelectorAll("[data-auth-card]");
    expect(cards).toHaveLength(1);
    const body = cards[0]?.querySelector(".auth-card-body");
    expect(body).not.toBeNull();
    expect(body).toContainElement(screen.getByText("Sign-in fields"));

    const css = readFileSync("src/themes/ltf_theme.css", "utf8");
    expect(css).toMatch(/\.auth-card-body\s*\{[^}]*min-height:\s*46rem/);
  });
});
