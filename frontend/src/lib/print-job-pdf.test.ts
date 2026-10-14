import { filenameFromContentDisposition, printJobPdfFilename, printScopeSlug } from "@/lib/print-job-pdf";

describe("print job PDF filenames", () => {
  it("builds license-cards_<club>_<id>_<luxembourg date>.pdf", () => {
    expect(
      printJobPdfFilename({
        clubName: "Red Kang",
        jobId: 42,
        createdAt: "2026-10-14T21:30:00Z",
      })
    ).toBe("license-cards_red-kang_42_2026-10-14.pdf");
  });

  it("uses the Luxembourg calendar date across midnight UTC", () => {
    expect(
      printJobPdfFilename({
        clubName: "Print Club",
        jobId: 7,
        createdAt: "2026-10-14T22:30:00Z",
      })
    ).toBe("license-cards_print-club_7_2026-10-15.pdf");
  });

  it("falls back to LTF when the club name is blank", () => {
    expect(printScopeSlug("   ")).toBe("LTF");
    expect(
      printJobPdfFilename({
        clubName: "",
        jobId: 3,
        createdAt: "2026-01-02T00:30:00+01:00",
      })
    ).toBe("license-cards_LTF_3_2026-01-02.pdf");
  });

  it("folds accents into the club slug", () => {
    expect(printScopeSlug("Dojang Mëtt")).toBe("dojang-mett");
  });

  it("reads the filename from Content-Disposition", () => {
    expect(
      filenameFromContentDisposition(
        "attachment; filename=\"license-cards_print-club_7_2026-10-15.pdf\"; filename*=UTF-8''license-cards_print-club_7_2026-10-15.pdf"
      )
    ).toBe("license-cards_print-club_7_2026-10-15.pdf");
  });
});
