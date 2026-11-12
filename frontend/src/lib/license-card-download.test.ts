import { downloadLicenseCardPdf, downloadPrintJobPdf } from "@/lib/license-card-api";

describe("license card download", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    sessionStorage.setItem("ltf_active_desk", "ltf_admin");
    localStorage.setItem("ltf_token", "token-1");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    sessionStorage.clear();
    localStorage.clear();
  });

  it("downloads one license card with the desk header and the server filename", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-disposition"
            ? "attachment; filename=\"LTF-2026-00123_Holder_Sample.pdf\"; filename*=UTF-8''LTF-2026-00123_Holder_Sample.pdf"
            : "application/pdf",
      },
      blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
    }) as unknown as typeof fetch;

    const file = await downloadLicenseCardPdf(15);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/licenses/15/card-pdf/"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Token token-1",
          "X-Desk": "ltf_admin",
        }),
      })
    );
    expect(file.filename).toBe("LTF-2026-00123_Holder_Sample.pdf");
  });

  it("sends the open desk when a print-job PDF is downloaded", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
    }) as unknown as typeof fetch;

    await downloadPrintJobPdf(8);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/print-jobs/8/pdf/"),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Desk": "ltf_admin" }),
      })
    );
  });
});
