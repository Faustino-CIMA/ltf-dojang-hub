/**
 * Copy the on-device card reader onto this origin.
 *
 * The files come from the locked npm packages. The card photo is not among them.
 * Coolify builds the frontend image with this script, the same way it copies the portrait model.
 */
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(frontendRoot, "public", "ocr");
const core = path.join(frontendRoot, "node_modules", "tesseract.js-core");
const worker = path.join(frontendRoot, "node_modules", "tesseract.js", "dist", "worker.min.js");
const trained = path.join(
  frontendRoot,
  "node_modules",
  "@tesseract.js-data",
  "eng",
  "4.0.0_best_int",
  "eng.traineddata.gz",
);

const cores = [
  "tesseract-core.wasm.js",
  "tesseract-core.wasm",
  "tesseract-core-simd.wasm.js",
  "tesseract-core-simd.wasm",
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-lstm.wasm",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm",
];

const files = [
  [worker, "worker.min.js"],
  ...cores.map((name) => [path.join(core, name), name]),
  [trained, "eng.traineddata.gz"],
];

await mkdir(destination, { recursive: true });
for (const [source, name] of files) {
  await copyFile(source, path.join(destination, name));
}
