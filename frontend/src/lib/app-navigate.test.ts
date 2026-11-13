import { readFileSync } from "node:fs";
import path from "node:path";

import { chooseClientRefresh, chooseClientReplace, registerClientNavigation, replaceWithClientRouter, refreshWithClientRouter } from "./app-navigate";

describe("client navigation for a closed desk", () => {
  afterEach(() => {
    registerClientNavigation({ replace: () => undefined, refresh: () => undefined })();
  });

  it("uses the registered router instead of a full page load", () => {
    const replace = jest.fn();
    const refresh = jest.fn();
    const assign = jest.fn();
    const reload = jest.fn();
    const navigation = { replace, refresh };

    chooseClientReplace("/en/login", navigation, assign);
    chooseClientRefresh(navigation, reload);

    expect(replace).toHaveBeenCalledWith("/en/login");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("keeps a full page load when the router is not registered yet", () => {
    const assign = jest.fn();
    const reload = jest.fn();
    chooseClientReplace("/en/dashboard", null, assign);
    chooseClientRefresh(null, reload);
    expect(assign).toHaveBeenCalledWith("/en/dashboard");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("sends a live call through the router registered by the app shell", () => {
    const replace = jest.fn();
    const refresh = jest.fn();
    const unregister = registerClientNavigation({ replace, refresh });
    replaceWithClientRouter("/en/login");
    refreshWithClientRouter();
    expect(replace).toHaveBeenCalledWith("/en/login");
    expect(refresh).toHaveBeenCalledTimes(1);
    unregister();
  });

  it("does not send a closed desk through window.location", () => {
    const api = readFileSync(path.join(process.cwd(), "src/lib/api.ts"), "utf8");
    const shell = readFileSync(path.join(process.cwd(), "src/components/app-shell.tsx"), "utf8");
    expect(api).not.toContain("window.location.reload");
    expect(api).not.toContain("window.location.assign");
    expect(shell).not.toContain("window.location.reload");
  });

  it("reserves the page scrollbar gutter", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/html\s*\{[^}]*scrollbar-gutter:\s*stable/);
  });
});
