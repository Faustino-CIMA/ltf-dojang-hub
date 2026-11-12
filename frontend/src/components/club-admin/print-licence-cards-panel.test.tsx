import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PrintLicenceCardsPanel } from "@/components/club-admin/print-licence-cards-panel";
import { printFederationLicenseCards } from "@/lib/license-card-api";
import { downloadPdfFile, openPdfPreview } from "@/lib/print-job-pdf";

jest.mock("next-intl", () => {
  const translate = (key: string, values?: { count?: number }) =>
    values && typeof values.count === "number" ? `${key}:${values.count}` : key;
  return { useTranslations: () => translate };
});

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

jest.mock("@/lib/license-card-api", () => ({
  getCardTemplates: jest.fn(),
  getPrinterProfiles: jest.fn().mockResolvedValue([]),
  printFederationLicenseCards: jest.fn(),
  createPrintJob: jest.fn(),
  executePrintJob: jest.fn(),
  downloadPrintJobPdf: jest.fn(),
}));

jest.mock("@/lib/print-job-pdf", () => ({
  openPdfPreview: jest.fn(),
  downloadPdfFile: jest.fn(),
}));

const { getCardTemplates, downloadPrintJobPdf } = jest.requireMock("@/lib/license-card-api") as {
  getCardTemplates: jest.Mock;
  downloadPrintJobPdf: jest.Mock;
};

describe("PrintLicenceCardsPanel", () => {
  beforeEach(() => {
    getCardTemplates.mockReset();
    (printFederationLicenseCards as jest.Mock).mockReset();
    downloadPrintJobPdf.mockReset();
    (openPdfPreview as jest.Mock).mockReset();
    (downloadPdfFile as jest.Mock).mockReset();
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
});
