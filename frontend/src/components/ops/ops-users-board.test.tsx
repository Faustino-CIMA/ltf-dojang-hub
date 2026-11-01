import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { OpsUsersBoard } from "@/components/ops/ops-users-board";
import type { OpsUser } from "@/lib/ops-api";

const createBulkLoginLinks = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (!values) {
      return key;
    }
    return `${key}:${Object.values(values).join("|")}`;
  },
  useLocale: () => "en",
}));

jest.mock("@/lib/ops-api", () => ({
  createBulkLoginLinks: (...args: unknown[]) => createBulkLoginLinks(...args),
  runOpsUserAction: jest.fn(),
}));

function user(partial: Partial<OpsUser> & Pick<OpsUser, "id" | "username">): OpsUser {
  return {
    email: "",
    first_name: "Ada",
    last_name: "Ng",
    role: "member",
    is_active: true,
    is_superuser: false,
    is_staff: false,
    is_email_verified: false,
    last_login: null,
    date_joined: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("ops login link selection", () => {
  beforeEach(() => {
    createBulkLoginLinks.mockReset();
    URL.createObjectURL = jest.fn(() => "blob:login-links");
    URL.revokeObjectURL = jest.fn();
    HTMLAnchorElement.prototype.click = jest.fn();
  });

  it("ticks only the visible rows and asks before downloading one file", async () => {
    const ada = user({ id: 1, username: "ada" });
    const idle = user({ id: 2, username: "idle", is_active: false, first_name: "Idle", last_name: "Gone" });
    const hidden = user({ id: 3, username: "hidden" });
    const { rerender } = render(
      <OpsUsersBoard users={[ada, idle, hidden]} isLoading={false} query="" onQueryChange={() => undefined} onChanged={() => undefined} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "bulkSelectPage" }));
    expect(screen.getByRole("checkbox", { name: "ada" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "hidden" })).toBeChecked();

    rerender(
      <OpsUsersBoard users={[ada, idle]} isLoading={false} query="a" onQueryChange={() => undefined} onChanged={() => undefined} />,
    );
    expect(screen.queryByRole("checkbox", { name: "hidden" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "ada" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "idle" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "bulkFirstLogin" }));
    expect(screen.getByRole("dialog", { name: "bulkConfirmFirstLogin:1" })).toBeInTheDocument();
    expect(screen.getByText("bulkSensitiveWarning")).toBeInTheDocument();
    expect(screen.getByText("bulkSkippedInactive:1")).toBeInTheDocument();

    createBulkLoginLinks.mockResolvedValue({
      created_count: 1,
      skipped_count: 1,
      csv: "username,name\nada,NG Ada\n",
      pdf_base64: btoa("pdf"),
    });
    fireEvent.click(screen.getByRole("button", { name: "bulkDownloadCsv" }));
    await waitFor(() => expect(createBulkLoginLinks).toHaveBeenCalledTimes(1));
    expect(createBulkLoginLinks).toHaveBeenCalledWith({
      link_type: "first_login",
      user_ids: [1, 2],
      locale: "en",
    });
    expect(await screen.findByText("bulkDownloaded:1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "bulkDownloadPdf" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2));
    expect(createBulkLoginLinks).toHaveBeenCalledTimes(1);
  });

  it("does not download when every ticked account is inactive", () => {
    const idle = user({ id: 2, username: "idle", is_active: false });
    render(
      <OpsUsersBoard users={[idle]} isLoading={false} query="" onQueryChange={() => undefined} onChanged={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "idle" }));
    fireEvent.click(screen.getByRole("button", { name: "bulkResetPassword" }));
    expect(screen.getByRole("dialog", { name: "bulkNothingToCreate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "bulkDownloadCsv" })).not.toBeInTheDocument();
    expect(createBulkLoginLinks).not.toHaveBeenCalled();
  });
});
