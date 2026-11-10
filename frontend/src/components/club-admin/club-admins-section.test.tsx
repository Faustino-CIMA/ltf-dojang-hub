import { render, screen, waitFor } from "@testing-library/react";

import { ClubAdminsSection } from "@/components/club-admin/club-admins-section";
import { apiRequest } from "@/lib/api";
import { getClubAdminAssignmentBoard } from "@/lib/club-admin-api";

jest.mock("next-intl", () => {
  const translate = (key: string) => key;
  return { useTranslations: () => translate };
});

jest.mock("@/lib/api", () => ({
  apiRequest: jest.fn(),
}));

jest.mock("@/lib/club-access-links", () => ({
  sendClubAdminAccessLink: jest.fn(),
}));

jest.mock("@/lib/club-admin-api", () => ({
  getClubAdminAssignmentBoard: jest.fn(),
  searchClubAdminAssignmentMembers: jest.fn(),
  addClubAdmin: jest.fn(),
  removeClubAdmin: jest.fn(),
}));

const apiRequestMock = apiRequest as jest.Mock;
const boardMock = getClubAdminAssignmentBoard as jest.Mock;

describe("Club admins on the club profile", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    boardMock.mockReset();
  });

  it("stays hidden for a role that did not have the club admins menu", async () => {
    apiRequestMock.mockResolvedValue({ role: "coach" });

    render(<ClubAdminsSection clubId={4} locale="en" />);

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith("/api/auth/me/");
    });
    expect(screen.queryByRole("heading", { name: "adminsTitle" })).not.toBeInTheDocument();
    expect(boardMock).not.toHaveBeenCalled();
  });

  it("lists the selected club's admins for a club admin", async () => {
    apiRequestMock.mockResolvedValue({ role: "club_admin" });
    boardMock.mockResolvedValue({
      clubs: [{ id: 4, name: "Sample Club", locality: "Luxembourg", max_admins: 3, admin_count: 1, admin_ids: [9] }],
      admins: [
        {
          id: 9,
          username: "sample.admin",
          email: "sample.admin@example.com",
          first_name: "Sample",
          last_name: "Admin",
          role: "club_admin",
          member_id: 1,
          member_name: "Sample Admin",
          home_club_id: 4,
          home_club_name: "Sample Club",
          clubs: [{ id: 4, name: "Sample Club" }],
          password_set: true,
        },
      ],
    });

    render(<ClubAdminsSection clubId={4} locale="en" />);

    expect(await screen.findByText("ADMIN Sample")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "adminsTitle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "profileAdminsAdd" })).toBeEnabled();
    expect(boardMock).toHaveBeenCalledWith(4);
  });
});
