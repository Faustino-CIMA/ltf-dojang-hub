import { MEMBER_PHOTO_ASPECT, MEMBER_PHOTO_HEIGHT, MEMBER_PHOTO_WIDTH, memberPhotoAspectRatio } from "@/lib/member-photo-frame";

describe("member photo frame", () => {
  it("uses the license-card print size, width over height", () => {
    expect(MEMBER_PHOTO_WIDTH).toBe(945);
    expect(MEMBER_PHOTO_HEIGHT).toBe(1181);
    expect(MEMBER_PHOTO_ASPECT).toBe(MEMBER_PHOTO_WIDTH / MEMBER_PHOTO_HEIGHT);
    expect(memberPhotoAspectRatio).toBe("945 / 1181");
    expect(MEMBER_PHOTO_ASPECT).toBeLessThan(1);
  });
});