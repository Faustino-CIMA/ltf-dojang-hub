import { CLUB_TSHIRT, inchesToCm } from "@/lib/member-gear-api";

describe("Club T-shirt chart", () => {
  it("rounds the attached inch chart to whole centimetres", () => {
    const youth = CLUB_TSHIRT.filter((size) => size.group === "youth").map((size) => size.label);
    const adult = CLUB_TSHIRT.filter((size) => size.group === "adult").map((size) => size.label);
    expect(youth).toEqual(["YXS", "YS", "YM", "YL", "YXL", "Y2XL", "Y3XL"]);
    expect(adult[0]).toBe("XXS");
    expect(adult[adult.length - 1]).toBe("10XL");
    const yxl = CLUB_TSHIRT.find((size) => size.label === "YXL");
    const xl = CLUB_TSHIRT.find((size) => size.label === "XL");
    expect(yxl?.age).toBe("9-10");
    expect(inchesToCm(yxl?.chestIn ?? 0)).toBe(38);
    expect(inchesToCm(yxl?.lengthIn ?? 0)).toBe(48);
    expect(inchesToCm(xl?.chestIn ?? 0)).toBe(56);
    expect(inchesToCm(xl?.lengthIn ?? 0)).toBe(72);
    expect(inchesToCm(34.5)).toBe(88);
  });
});
