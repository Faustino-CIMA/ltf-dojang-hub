/**
 * @jest-environment node
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const frontendRoot = path.resolve(__dirname, "../..");

describe("portrait runtime package", () => {
  it("keeps the usual removal tool on onnxruntime-web 1.21.0", () => {
    const pkg = JSON.parse(readFileSync(path.join(frontendRoot, "node_modules/onnxruntime-web/package.json"), "utf8")) as {
      version: string;
    };
    expect(pkg.version).toBe("1.21.0");
  });

  it("copies onnxruntime-web 1.31.1 from this site and not from a content network", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(frontendRoot, "node_modules/onnxruntime-web-portrait/package.json"), "utf8"),
    ) as { version: string };
    expect(pkg.version).toBe("1.31.1");
    const script = readFileSync(path.join(frontendRoot, "scripts/fetch-modnet-asset.mjs"), "utf8");
    expect(script).toContain('path.join(frontendRoot, "node_modules", "onnxruntime-web-portrait", "dist")');
    expect(script).not.toMatch(/jsdelivr|unpkg/i);
    const files = [...script.matchAll(/name: "([^"]+)", sha256: "([0-9a-f]{64})"/g)];
    expect(files.map((match) => match[1])).toEqual(["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]);
    for (const [, name, hash] of files) {
      const bytes = readFileSync(path.join(frontendRoot, "node_modules/onnxruntime-web-portrait/dist", name));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
      if (name.endsWith(".mjs")) {
        expect(bytes.toString("utf8")).not.toMatch(/jsdelivr|unpkg|cdn\.jsdelivr/i);
        expect(bytes.toString("utf8")).not.toContain("ort-wasm-simd-threaded.jspi");
      }
    }
  });
});
