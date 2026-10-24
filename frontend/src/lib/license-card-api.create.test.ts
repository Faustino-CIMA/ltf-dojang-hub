import { apiRequest } from "@/lib/api";
import { createPrintJob } from "@/lib/license-card-api";

jest.mock("@/lib/api", () => ({
  apiRequest: jest.fn(),
  API_URL: "http://localhost:8000",
}));

const apiRequestMock = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe("createPrintJob", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({ id: 7, job_number: "PJ-7" });
  });

  it("posts member ids and maps the printer profile id", async () => {
    await createPrintJob({
      club: 2,
      template_version: 4,
      member_ids: [6, 8],
      printer_profile_id: 3,
      metadata: { quick_print: true, source: "members" },
    });

    expect(apiRequestMock).toHaveBeenCalledWith("/api/print-jobs/", {
      method: "POST",
      body: JSON.stringify({
        club: 2,
        template_version: 4,
        member_ids: [6, 8],
        metadata: { quick_print: true, source: "members" },
        printer_profile: 3,
      }),
    });
  });

  it("posts licence ids without a printer profile", async () => {
    await createPrintJob({
      club: 2,
      template_version: 4,
      license_ids: [11],
    });

    expect(apiRequestMock).toHaveBeenCalledWith("/api/print-jobs/", {
      method: "POST",
      body: JSON.stringify({
        club: 2,
        template_version: 4,
        license_ids: [11],
      }),
    });
  });
});
