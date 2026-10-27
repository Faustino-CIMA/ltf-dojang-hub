import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  BrandingLogosManager,
  resolveLogoContentUrl,
  type BrandingLogoItem,
} from "@/components/branding/branding-logos-manager";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@/lib/api", () => ({
  API_URL: "https://api.ltkdf.org",
}));

jest.mock("@/lib/auth", () => ({
  getToken: () => "test-token",
}));

const FAKE_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

function savedLogo(overrides: Partial<BrandingLogoItem> = {}): BrandingLogoItem {
  return {
    id: 9,
    usage_type: "general",
    label: "Main logo",
    is_selected: true,
    file_name: "crest.png",
    file_size: FAKE_PNG.byteLength,
    content_url: "http://web:8000/api/clubs/4/logos/9/content/",
    ...overrides,
  };
}

function renderManager(logos: BrandingLogoItem[] = []) {
  const onUpload = jest.fn().mockResolvedValue(undefined);
  const onSelect = jest.fn().mockResolvedValue(undefined);
  const onDelete = jest.fn().mockResolvedValue(undefined);
  render(
    <BrandingLogosManager logos={logos} onUpload={onUpload} onSelect={onSelect} onDelete={onDelete} />
  );
  return { onUpload, onSelect, onDelete };
}

describe("organization logo preview", () => {
  beforeEach(() => {
    let blobCount = 0;
    URL.createObjectURL = jest.fn(() => `blob:logo-${++blobCount}`);
    URL.revokeObjectURL = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "image/png" },
      blob: async () => new Blob([FAKE_PNG], { type: "image/png" }),
    }) as jest.Mock;
  });

  it("resolves logo bytes on the public API origin", () => {
    expect(resolveLogoContentUrl("/api/clubs/4/logos/9/content/")).toBe(
      "https://api.ltkdf.org/api/clubs/4/logos/9/content/"
    );
    expect(resolveLogoContentUrl("http://web:8000/api/federation-profile/logos/3/content/")).toBe(
      "https://api.ltkdf.org/api/federation-profile/logos/3/content/"
    );
    expect(resolveLogoContentUrl("https://api.ltkdf.org/api/clubs/4/logos/9/content/")).toBe(
      "https://api.ltkdf.org/api/clubs/4/logos/9/content/"
    );
  });

  it("shows the chosen file before it is uploaded", async () => {
    renderManager();
    const file = new File([FAKE_PNG], "crest.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("chooseLogoFileAction"), {
      target: { files: [file] },
    });

    const preview = await screen.findByAltText("crest.png");
    expect(preview).toHaveAttribute("src", "blob:logo-1");
    expect(screen.getByRole("button", { name: "logoReplaceAction" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "logoRemoveAction" })).toBeEnabled();
  });

  it("shows a saved logo from a relative or internal content URL", async () => {
    renderManager([savedLogo()]);

    const preview = await screen.findByAltText("Main logo");
    expect(preview).toHaveAttribute("src", "blob:logo-1");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.ltkdf.org/api/clubs/4/logos/9/content/",
      expect.objectContaining({
        cache: "no-store",
        headers: { Authorization: "Token test-token" },
      })
    );
    expect(screen.getByRole("button", { name: "logoReplaceAction" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "logoRemoveAction" })).toBeEnabled();
  });

  it("keeps the replacement image visible while the upload is in progress", async () => {
    let finishUpload: (() => void) | undefined;
    const { onUpload, onDelete } = renderManager([savedLogo()]);
    onUpload.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishUpload = resolve;
        })
    );
    await screen.findByAltText("Main logo");

    const file = new File([FAKE_PNG], "next-crest.png", { type: "image/png" });
    fireEvent.click(screen.getByRole("button", { name: "logoReplaceAction" }));
    fireEvent.change(screen.getByLabelText("logoReplaceFileLabel"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByAltText("Main logo")).toHaveAttribute("src", "blob:logo-2");
    });
    expect(screen.getByRole("status", { name: "logoPreviewLoading" })).toBeInTheDocument();
    expect(onUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        file,
        usage_type: "general",
        label: "Main logo",
        is_selected: true,
      })
    );
    expect(onDelete).not.toHaveBeenCalled();

    finishUpload?.();
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(9));
  });

  it("asks before removing a saved logo", async () => {
    const { onDelete } = renderManager([savedLogo()]);
    await screen.findByAltText("Main logo");
    fireEvent.click(screen.getByRole("button", { name: "logoRemoveAction" }));
    expect(screen.getByRole("heading", { name: "logoDeleteTitle" })).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
