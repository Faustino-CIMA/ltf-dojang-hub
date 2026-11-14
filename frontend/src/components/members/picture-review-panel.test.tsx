import { render, screen, waitFor } from "@testing-library/react";

import { apiRequest } from "@/lib/api";

import { PictureReviewPanel } from "./picture-review-panel";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

jest.mock("@/lib/api", () => ({
  API_URL: "http://localhost",
  apiRequest: jest.fn(),
}));

const request = apiRequest as jest.Mock;

describe("PictureReviewPanel face check notice", () => {
  beforeEach(() => {
    request.mockReset();
  });

  it("shows the skipped notice when an older photo has no face check", async () => {
    request.mockResolvedValue({
      id: 1,
      first_name: "Ada",
      last_name: "Young",
      current_url: "",
      pending_url: "",
    });
    render(
      <PictureReviewPanel open memberId={1} namespace="ClubAdmin" onClose={() => undefined} onDecided={() => undefined} />,
    );
    expect(await screen.findByText("pictureReviewFaceCheckSkipped")).toBeInTheDocument();
  });

  it("hides the notice when the automatic check passed", async () => {
    request.mockResolvedValue({
      id: 1,
      first_name: "Ada",
      last_name: "Young",
      current_url: "",
      pending_url: "",
      face_check: "pass",
    });
    render(
      <PictureReviewPanel open memberId={1} namespace="LtfAdmin" onClose={() => undefined} onDecided={() => undefined} />,
    );
    await waitFor(() => expect(screen.getByText("Young Ada")).toBeInTheDocument());
    expect(screen.queryByText("pictureReviewFaceCheckSkipped")).not.toBeInTheDocument();
  });
});
