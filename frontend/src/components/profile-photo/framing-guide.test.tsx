import { render } from "@testing-library/react";

import { framingGuideShape } from "@/lib/face-check";
import { MEMBER_PHOTO_HEIGHT, MEMBER_PHOTO_WIDTH } from "@/lib/member-photo-frame";

import { FramingGuide } from "./framing-guide";

describe("framing guide", () => {
  it("draws the shared head and shoulders on the print crop", () => {
    const shape = framingGuideShape(MEMBER_PHOTO_WIDTH, MEMBER_PHOTO_HEIGHT);
    const { getByTestId } = render(<FramingGuide reason="closer" />);
    const guide = getByTestId("framing-guide");
    const ellipse = guide.querySelector("ellipse");
    expect(ellipse).toHaveAttribute("cx", String(shape.head.cx));
    expect(ellipse).toHaveAttribute("cy", String(shape.head.cy));
    expect(ellipse).toHaveAttribute("rx", String(shape.head.rx));
    expect(ellipse).toHaveAttribute("ry", String(shape.head.ry));
    expect(guide.querySelector("path")).toHaveAttribute("d", shape.shoulders);
    expect(guide.innerHTML).not.toContain("--danger");
    expect(guide.innerHTML).not.toContain("--accent");
  });
});
