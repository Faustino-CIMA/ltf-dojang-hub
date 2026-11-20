/**
 * @jest-environment node
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { createWorker } from "tesseract.js";

const frontendRoot = path.resolve(__dirname, "../..");
const langPath = path.join(frontendRoot, "node_modules/@tesseract.js-data/eng/4.0.0_best_int");
const coreFiles = [
  "tesseract-core-relaxedsimd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm",
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-lstm.wasm",
];

describe("on-device English card reader", () => {
  it("keeps the English model and the local engine files", () => {
    expect(existsSync(path.join(langPath, "eng.traineddata.gz"))).toBe(true);
    expect(existsSync(path.join(frontendRoot, "node_modules/tesseract.js/dist/worker.min.js"))).toBe(true);
    for (const name of coreFiles) {
      expect(existsSync(path.join(frontendRoot, "node_modules/tesseract.js-core", name))).toBe(true);
    }
  });

  it("reads a synthetic card with the local English model", async () => {
    const worker = await createWorker("eng", 1, { langPath, gzip: true, cacheMethod: "none" });
    try {
      const result = await worker.recognize(path.join(__dirname, "fixtures/fake-card.png"));
      expect(result.data.text).toContain("ADA EXAMPLE");
    } finally {
      await worker.terminate();
    }
  }, 30000);
});
