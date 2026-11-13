import { fireEvent, render, screen } from "@testing-library/react";

import { PhotoRejectionNote } from "./photo-rejection-note";

describe("photo rejection note", () => {
  it("shows the warning note without a reason and offers another photo", () => {
    const send = jest.fn();
    render(
      <PhotoRejectionNote
        title="Photo not approved"
        body="The club did not approve this photo. Your current photo stays. You can send another one."
        info="Photos for someone under 18 are checked by the club before they replace the current photo."
        infoLabel="About photo not approved"
        actionLabel="Send another photo"
        onSendAnother={send}
      />,
    );
    const badge = screen.getByText("Photo not approved");
    expect(badge.className).toContain("badge-warning");
    expect(badge.className).not.toContain("badge-danger");
    expect(screen.getByText(/Your current photo stays/)).toBeInTheDocument();
    expect(screen.queryByText(/Reason:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send another photo" }));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("shows the reason when one was given", () => {
    render(
      <PhotoRejectionNote
        title="Photo not approved"
        body="The club did not approve this photo. Your current photo stays. You can send another one."
        reason="Reason: Too dark"
        info="Photos for someone under 18 are checked by the club."
        infoLabel="About photo not approved"
        actionLabel="Send another photo"
        onSendAnother={() => undefined}
      />,
    );
    expect(screen.getByText("Reason: Too dark")).toBeInTheDocument();
    expect(screen.getByText("Reason: Too dark").className).not.toContain("badge-danger");
  });
});
