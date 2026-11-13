import { render, screen } from "@testing-library/react";

import { AppChrome } from "./app-chrome";

let pathname = "/en/account-setup";

jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

describe("public header on auth steps", () => {
  it.each(["/en/login", "/en/forgot-password", "/en/reset-password", "/en/account-setup"])(
    "leaves the public site header off %s",
    (path) => {
      pathname = path;
      render(
        <AppChrome>
          <p>Auth fields</p>
        </AppChrome>,
      );
      expect(screen.getByText("Auth fields")).toBeInTheDocument();
      expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    },
  );

  it("keeps the public site header on other pages", () => {
    pathname = "/en/settings/privacy";
    render(
      <AppChrome>
        <p>Privacy</p>
      </AppChrome>,
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });
});
