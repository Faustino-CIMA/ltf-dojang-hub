import { fireEvent, render, screen } from "@testing-library/react";

import { LtfStaffPanel } from "@/components/ltf-admin/ltf-staff-panel";
import type { LicenseType, Member } from "@/lib/ltf-admin-api";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const licenseType: LicenseType = {
  id: 4,
  name: "Staff",
  code: "staff",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: 9,
    user: null,
    club: null,
    first_name: "Alex",
    last_name: "NAGORNYI",
    sex: "M",
    email: "alex@ltf.lu",
    wt_licenseid: "",
    ltf_licenseid: "LTF-100",
    date_of_birth: null,
    belt_rank: "",
    primary_license_role: "Staff",
    secondary_license_role: "",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    is_ltf_staff: true,
    ltf_staff: { id: 1, function: "photographer", started_on: "2026-01-01", ended_on: null },
    linked_user: null,
    ...overrides,
  };
}

describe("LTF staff panel", () => {
  it("opens a side panel with popovers and no dropdowns", () => {
    render(
      <LtfStaffPanel
        mode="create"
        member={null}
        clubs={[{ id: 2, name: "TKD Esch", city: "", address: "", address_line1: "", address_line2: "", postal_code: "", locality: "", iban: "", bank_name: "", email: "", website: "", is_active: true, communication_language: "fr", max_admins: 2, created_by: 1, admins: [], created_at: "", updated_at: "" }]}
        licenseTypes={[licenseType]}
        busy={false}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />
    );
    expect(screen.getByRole("dialog", { name: "staffAddTitle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "staffFunctionLabel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "staffClubLabel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "staffLoginLabel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "staffLicenseTypeLabel" })).toBeInTheDocument();
    expect(screen.getByText("staffAddHint")).toBeInTheDocument();
    expect(document.querySelector("select")).toBeNull();
  });

  it("asks for a licence type before issuing, and never shows a price", () => {
    const onSubmit = jest.fn();
    render(
      <LtfStaffPanel
        mode="issue"
        member={member()}
        clubs={[]}
        licenseTypes={[licenseType]}
        busy={false}
        onClose={jest.fn()}
        onSubmit={onSubmit}
      />
    );
    expect(screen.getByText("staffIssueHint")).toBeInTheDocument();
    expect(screen.queryByLabelText(/price/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "staffIssueAction" }));
    expect(screen.getByText("staffNeedLicenseType")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("refuses a past year before issuing", () => {
    const onSubmit = jest.fn();
    render(
      <LtfStaffPanel
        mode="issue"
        member={member()}
        clubs={[]}
        licenseTypes={[licenseType]}
        busy={false}
        onClose={jest.fn()}
        onSubmit={onSubmit}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "staffLicenseTypeLabel" }));
    fireEvent.click(screen.getByRole("option", { name: "Staff" }));
    fireEvent.change(screen.getByLabelText("staffLicenseYearLabel"), { target: { value: "2020" } });
    fireEvent.click(screen.getByRole("button", { name: "staffIssueAction" }));
    expect(screen.getByText("staffPastYear")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("puts the destructive action on delete and keeps the person fields off", () => {
    render(
      <LtfStaffPanel
        mode="delete"
        member={member()}
        clubs={[]}
        licenseTypes={[]}
        busy={false}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "staffDeleteAction" })).toBeInTheDocument();
    expect(screen.queryByLabelText("lastNameLabel")).toBeNull();
  });
});
