import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PrintLicenceCardsPanel } from "@/components/club-admin/print-licence-cards-panel";
import { downloadLicenseCardPdf, printFederationLicenseCards } from "@/lib/license-card-api";
import { downloadPdfFile, openPdfPreview } from "@/lib/print-job-pdf";

jest.mock("next-intl", () => {
  const translate = (key: string, values?: { count?: number; name?: string; version?: number; index?: number }) => {
    if (values && typeof values.name === "string" && values.version != null) {
      return `${values.name} · v${values.version}`;
    }
    if (values && typeof values.index === "number") {
      return `${key}:${values.index}`;
    }
    return values && typeof values.count === "number" ? `${key}:${values.count}` : key;
  };
  return { useTranslations: () => translate };
});

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

jest.mock("@/lib/license-card-api", () => ({
  getCardTemplates: jest.fn(),
  getPrinterProfiles: jest.fn().mockResolvedValue([]),
  getPaperProfiles: jest.fn().mockResolvedValue([]),
  printFederationLicenseCards: jest.fn(),
  downloadLicenseCardPdf: jest.fn(),
  createPrintJob: jest.fn(),
  executePrintJob: jest.fn(),
  downloadPrintJobPdf: jest.fn(),
}));

jest.mock("@/lib/print-job-pdf", () => ({
  openPdfPreview: jest.fn(),
  downloadPdfFile: jest.fn(),
}));

const { getCardTemplates, getPaperProfiles, downloadPrintJobPdf } = jest.requireMock(
  "@/lib/license-card-api",
) as {
  getCardTemplates: jest.Mock;
  getPaperProfiles: jest.Mock;
  downloadPrintJobPdf: jest.Mock;
};

describe("PrintLicenceCardsPanel", () => {
  beforeEach(() => {
    getCardTemplates.mockReset();
    getPaperProfiles.mockReset();
    getPaperProfiles.mockResolvedValue([]);
    (printFederationLicenseCards as jest.Mock).mockReset();
    (downloadLicenseCardPdf as jest.Mock).mockReset();
    downloadPrintJobPdf.mockReset();
    (openPdfPreview as jest.Mock).mockReset();
    (downloadPdfFile as jest.Mock).mockReset();
  });

  it("lists and preselects the published default, not a draft from v2", async () => {
    getCardTemplates.mockResolvedValue([
      {
        id: 8,
        name: "Standard 3C Card - Draft from v2",
        is_active: true,
        is_default: false,
        latest_published_version: null,
      },
      {
        id: 3,
        name: "Standard 3C Card V3",
        is_active: true,
        is_default: true,
        latest_published_version: {
          id: 30,
          version_number: 3,
          label: "Draft from v2",
          status: "published",
        },
      },
    ]);
    render(
      <PrintLicenceCardsPanel
        open
        onClose={jest.fn()}
        locale="en"
        clubId={null}
        source="licenses"
        scope="federation"
        licenseIds={[4]}
      />
    );
    expect(await screen.findByText("Standard 3C Card V3 · v3")).toBeInTheDocument();
    expect(screen.queryByText("Standard 3C Card - Draft from v2")).not.toBeInTheDocument();
    expect(screen.queryByText(/Draft from v2/)).not.toBeInTheDocument();
    (printFederationLicenseCards as jest.Mock).mockResolvedValue({
      jobs: [{ id: 1, job_number: "PJ-1" }],
      skipped_license_ids: [],
    });
    downloadPrintJobPdf.mockResolvedValue({
      blob: new Blob(["%PDF"], { type: "application/pdf" }),
      filename: "card.pdf",
    });
    fireEvent.click(screen.getByRole("button", { name: "printLicenceCardsSubmit" }));
    await waitFor(() => {
      expect(printFederationLicenseCards).toHaveBeenCalledWith({
        license_ids: [4],
        template_version: 30,
      });
    });
  });

  it("keeps the club list on the published template name", async () => {
    getCardTemplates.mockResolvedValue([
      {
        id: 3,
        name: "Standard 3C Card V3",
        is_active: true,
        is_default: true,
        latest_published_version: {
          id: 30,
          version_number: 3,
          label: "Club label",
          status: "published",
        },
      },
      {
        id: 8,
        name: "Draft only",
        is_active: true,
        is_default: false,
        latest_published_version: null,
      },
    ]);
    render(
      <PrintLicenceCardsPanel
        open
        onClose={jest.fn()}
        locale="en"
        clubId={4}
        source="licenses"
        scope="club"
        licenseIds={[4]}
      />
    );
    expect(await screen.findByText("Standard 3C Card V3 · Club label")).toBeInTheDocument();
    expect(screen.queryByText("Draft only")).not.toBeInTheDocument();
  });

  it("keeps a skeleton in place while templates load", async () => {
    let resolveTemplates: (rows: unknown[]) => void = () => undefined;
    getCardTemplates.mockReturnValue(
      new Promise((resolve) => {
        resolveTemplates = resolve;
      }),
    );
    render(
      <PrintLicenceCardsPanel
        open
        onClose={jest.fn()}
        locale="en"
        clubId={null}
        source="licenses"
        scope="federation"
        licenseIds={[4]}
      />
    );
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    resolveTemplates([
      {
        id: 3,
        name: "Standard 3C Card V3",
        is_active: true,
        is_default: true,
        latest_published_version: { id: 30, version_number: 3, label: "V3", status: "published" },
      },
    ]);
    expect(await screen.findByText("Standard 3C Card V3 · v3")).toBeInTheDocument();
    expect(document.querySelector("[aria-busy='true']")).toBeNull();
  });

  it("shows a non-red note when no published template exists", async () => {
    getCardTemplates.mockResolvedValue([]);
    render(
      <PrintLicenceCardsPanel
        open
        onClose={jest.fn()}
        locale="en"
        clubId={null}
        source="licenses"
        scope="federation"
        licenseIds={[4, 9]}
      />
    );
    const note = await screen.findByText("printLicenceCardsNoTemplate");
    expect(note).toHaveClass("text-muted");
    expect(note).not.toHaveClass("text-destructive");
    expect(screen.getAllByRole("button", { name: "modalClose" })).toHaveLength(1);
  });

  it("prints every selected license, including ids from another page", async () => {
    getCardTemplates.mockResolvedValue([
      {
        id: 1,
        name: "Standard",
        is_active: true,
        is_default: true,
        latest_published_version: { id: 9, label: "v1" },
      },
    ]);
    (printFederationLicenseCards as jest.Mock).mockResolvedValue({
      jobs: [
        { id: 31, job_number: "PJ-31" },
        { id: 32, job_number: "PJ-32" },
      ],
      skipped_license_ids: [],
    });
    downloadPrintJobPdf.mockImplementation(async (id: number) => ({
      blob: new Blob([`%PDF-${id}`], { type: "application/pdf" }),
      filename: `license-cards_${id}.pdf`,
    }));
    render(
      <PrintLicenceCardsPanel
        open
        onClose={jest.fn()}
        locale="en"
        clubId={null}
        source="licenses"
        scope="federation"
        licenseIds={[11, 22]}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "printLicenceCardsSubmit" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "printLicenceCardsSubmit" }));
    await waitFor(() => {
      expect(printFederationLicenseCards).toHaveBeenCalledWith({
        license_ids: [11, 22],
        template_version: 9,
      });
    });
    await waitFor(() => {
      expect(downloadPdfFile).toHaveBeenCalledTimes(2);
    });
    expect(openPdfPreview).not.toHaveBeenCalled();
  });

  it("sends the designer's partial slot choice and downloads one card into those slots", async () => {
    getCardTemplates.mockResolvedValue([
      {
        id: 3,
        name: "Standard 3C",
        is_active: true,
        is_default: true,
        latest_published_version: { id: 30, version_number: 3, label: "v3", status: "published", card_format: 1, paper_profile: 5 },
      },
    ]);
    getPaperProfiles.mockResolvedValue([
      { id: 5, code: "sigel-lp798", is_active: true, card_format: 1, slot_count: 4, columns: 2, rows: 2 },
    ]);
    (downloadLicenseCardPdf as jest.Mock).mockResolvedValue({
      blob: new Blob(["%PDF"], { type: "application/pdf" }),
      filename: "LTF-1_Holder_Sample.pdf",
    });
    render(
      <PrintLicenceCardsPanel
        open
        onClose={jest.fn()}
        locale="en"
        clubId={null}
        source="licenses"
        scope="federation"
        intent="download"
        submitLabel="Download PDF"
        licenseIds={[15]}
      />
    );
    const slotZero = await screen.findByRole("button", { name: "licenseCardPreviewSlotLabel:0" });
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(4);
    fireEvent.click(slotZero);
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => {
      expect(downloadLicenseCardPdf).toHaveBeenCalledWith(15, {
        template_version: 30,
        selected_slots: [1, 2, 3],
      });
    });
    expect(downloadPdfFile).toHaveBeenCalled();
  });
});
