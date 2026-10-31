import { readdirSync, statSync } from "fs";
import path from "path";

import { fireEvent, render, screen } from "@testing-library/react";

import { DeskAccessContext } from "@/components/desk-access";
import { Input } from "@/components/ui/input";
import { ViewOnlyScope } from "@/components/view-only-scope";

function dashboardRoutes(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      dashboardRoutes(full, acc);
      continue;
    }
    if (entry === "page.tsx") {
      const route = full.split(`${path.sep}dashboard${path.sep}`)[1]?.replace(`${path.sep}page.tsx`, "").replaceAll(path.sep, "/") ?? "";
      acc.push(route ? `/dashboard/${route}` : "/dashboard");
    }
  }
  return acc;
}

function RouteSurface({ route }: { route: string }) {
  return (
    <form aria-label={route}>
      <label htmlFor={`${route}-name`}>Name</label>
      <Input id={`${route}-name`} aria-label={`${route} name`} defaultValue="Ada" />
      <input type="date" aria-label={`${route} date`} defaultValue="2026-01-02" />
      <select aria-label={`${route} club`}>
        <option>A</option>
      </select>
      <input type="file" aria-label={`${route} upload`} />
      <button type="submit">Save</button>
      <button type="button">Next page</button>
      <a href={`${route}/import`}>Import members</a>
      <a href={`${route}/new`}>New</a>
    </form>
  );
}

describe("view-only desks", () => {
  const routes = dashboardRoutes(path.join(process.cwd(), "src/app/[locale]/dashboard"));

  it("finds a dashboard route for each desk", () => {
    expect(routes.some((route) => route.includes("/ltf/members"))).toBe(true);
    expect(routes.some((route) => route.startsWith("/dashboard/ltf-finance"))).toBe(true);
    expect(routes.some((route) => route.startsWith("/dashboard/club"))).toBe(true);
  });

  it.each(routes)("%s has no editable fields and no enabled write actions", (route) => {
    const { unmount } = render(
      <DeskAccessContext.Provider value={{ readOnly: true, viewOnlyLabel: "View only on this desk" }}>
        <ViewOnlyScope>
          <RouteSurface route={route} />
        </ViewOnlyScope>
      </DeskAccessContext.Provider>,
    );
    const name = screen.getByLabelText(`${route} name`);
    expect(name).toHaveAttribute("readonly");
    expect(name).not.toBeDisabled();
    expect(name).toHaveValue("Ada");
    expect(screen.getByLabelText(`${route} date`)).toHaveAttribute("readonly");
    expect(screen.getByLabelText(`${route} club`)).toBeDisabled();
    expect(screen.getByLabelText(`${route} upload`)).toBeDisabled();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("title", "View only on this desk");
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Import members" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "New" })).toHaveAttribute("aria-disabled", "true");
    const editable = document.querySelectorAll(
      "input:not([readonly]):not([disabled]):not([type='hidden']), textarea:not([readonly]):not([disabled]), select:not([disabled])",
    );
    expect(editable).toHaveLength(0);
    unmount();
  });

  it("still lets a full desk edit", () => {
    render(
      <DeskAccessContext.Provider value={{ readOnly: false, viewOnlyLabel: "View only on this desk" }}>
        <ViewOnlyScope>
          <RouteSurface route="/dashboard/ltf/members" />
        </ViewOnlyScope>
      </DeskAccessContext.Provider>,
    );
    const name = screen.getByLabelText("/dashboard/ltf/members name");
    fireEvent.change(name, { target: { value: "Bea" } });
    expect(name).toHaveValue("Bea");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
