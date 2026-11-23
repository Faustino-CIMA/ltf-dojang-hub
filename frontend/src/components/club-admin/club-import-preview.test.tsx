import { fireEvent, render, screen } from "@testing-library/react";

import en from "@/messages/en.json";

import { ClubImportPreview } from "./club-import-preview";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const catalog = en.ClubAdmin as Record<string, string>;
    let text = catalog[key] ?? key;
    if (values) {
      for (const [name, value] of Object.entries(values)) {
        text = text.replace(`{${name}}`, value);
      }
    }
    return text;
  },
}));

const rows = [
  {
    sheet: "addresses",
    line: 2,
    status: "ok" as const,
    action: "create" as const,
    codes: [],
    stored_date: "",
    preview: {
      member_ref: "LTF-EX-0001",
      street: "Rue Factice",
      member_last_name: "EXAMPLE",
      member_first_name: "Ada",
      member_known: "yes",
    },
  },
  {
    sheet: "addresses",
    line: 3,
    status: "error" as const,
    action: "skip" as const,
    codes: ["unknown_member"],
    stored_date: "",
    preview: {
      member_ref: "LTF-OTHER",
      street: "Rue Factice",
      member_last_name: "",
      member_first_name: "",
      member_known: "no",
    },
  },
];

describe("club import preview", () => {
  it("shows this club's member as last name then first name, and an unknown member", () => {
    render(<ClubImportPreview rows={rows} />);
    expect(screen.getByRole("columnheader", { name: "Member" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByText("EXAMPLE Ada")).toBeInTheDocument();
    expect(screen.getByText("Unknown member")).toBeInTheDocument();
    expect(screen.queryByText("SECRET")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Error (1)" }));
    expect(screen.queryByText("EXAMPLE Ada")).not.toBeInTheDocument();
    expect(screen.getByText("Unknown member")).toBeInTheDocument();
  });
});
