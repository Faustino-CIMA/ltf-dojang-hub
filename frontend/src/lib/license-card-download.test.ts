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

  it("sends the chosen slots on the download URL", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
    }) as unknown as typeof fetch;

    await downloadLicenseCardPdf(15, { template_version: 30, selected_slots: [2, 9] });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("/api/licenses/15/card-pdf/?");
    expect(url).toContain("template_version=30");
    expect(url).toContain("selected_slots=2");
    expect(url).toContain("selected_slots=9");
    expect((global.fetch as jest.Mock).mock.calls[0][1]).toEqual(
      expect.objectContaining({ method: "GET" }),
    );
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
