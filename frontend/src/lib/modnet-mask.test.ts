import { applyMaskOnce } from "./photo-background";
import { modnetInputSize, modnetTensor, portraitRuntime, rasterWithMatte, removalMaskFromSearch } from "./modnet-mask";

describe("portrait runtime", () => {
  it("stays on one fixed-SIMD thread and does not use the graphics chip", () => {
    expect(portraitRuntime).toEqual({
      threads: 1,
      proxy: false,
      simd: "fixed",
      providers: ["wasm"],
    });
  });
});

describe("portrait mask flag", () => {
  it("uses the usual model unless the page asks for the portrait model", () => {
    expect(removalMaskFromSearch("")).toBe("server");
    expect(removalMaskFromSearch("?mask=server")).toBe("server");
    expect(removalMaskFromSearch("?mask=isnet")).toBe("isnet");
    expect(removalMaskFromSearch("?mask=modnet")).toBe("modnet");
    expect(removalMaskFromSearch("mask=isnet")).toBe("isnet");
  });

  it("scales a drawn face to a 512 portrait input and keeps black at -1", () => {
    const width = 64;
    const height = 32;
    const data = new Uint8ClampedArray(width * height * 4);
    data[0] = 255;
    data[1] = 255;
    data[2] = 255;
    const size = modnetInputSize(width, height);
    expect(size.width % 32).toBe(0);
    expect(size.height % 32).toBe(0);
    expect(Math.max(size.width, size.height)).toBe(512);
    const tensor = modnetTensor({ width: 1, height: 1, data });
    expect(tensor[0]).toBeCloseTo(1);
    expect(tensor[1]).toBeCloseTo(1);
    expect(tensor[2]).toBeCloseTo(1);
    const black = new Uint8ClampedArray(4);
    const dark = modnetTensor({ width: 1, height: 1, data: black });
    expect(dark[0]).toBeCloseTo(-1);
  });

  it("puts a drawn matte on the full-size photo without changing its colour", () => {
    const width = 4;
    const height = 4;
    const colour = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      colour[index * 4] = 20;
      colour[index * 4 + 1] = 30;
      colour[index * 4 + 2] = 40;
      colour[index * 4 + 3] = 255;
    }
    const matte = new Float32Array(width * height);
    matte[0] = 1;
    const small = rasterWithMatte({ width, height, data: colour }, matte);
    expect(small.data[0]).toBe(20);
    expect(small.data[3]).toBe(255);
    expect(small.data[7]).toBe(0);
    const full = new Uint8ClampedArray(colour);
    full[0] = 9;
    const restored = applyMaskOnce({ width, height, data: full }, small);
    expect(restored.data[0]).toBe(9);
    expect(restored.data[3]).toBe(255);
    expect(restored.data[7]).toBe(0);
  });
});
