/**
 * Put the pinned MODNet portrait model and the CPU ONNX runtime on this origin.
 *
 * The weights are the photographic MODNet export (Apache-2.0, ZHKKKe/MODNet).
 * They are not committed. Coolify runs this while building the frontend image.
 * The runtime files are copied from the locked onnxruntime-web 1.31.1 package
 * (installed as onnxruntime-web-portrait) so the page does not call a CDN.
 * The usual removal tool keeps onnxruntime-web 1.21.0 and its own files.
 */
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODEL_URL =
  "https://huggingface.co/DavG25/modnet-pretrained-models/resolve/main/models/modnet_photographic_portrait_matting.onnx";
const MODEL_FILE = "modnet_photographic_portrait_matting.onnx";
const MODEL_SHA256 = "07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9";
const MODEL_BYTES = 25888640;

const WASM_FILES = [
  { name: "ort-wasm-simd-threaded.wasm", sha256: "4b884c203b0fa48d057be3332c65513ff85aa3c5bddd6946acc0fab7ecda001d" },
  { name: "ort-wasm-simd-threaded.mjs", sha256: "30ed0b5cd1182ede931fea448afb567d4dc705ec957af09f108a2be5f770dac3" },
];

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(frontendRoot, "public", "background-removal", "modnet");
const licenceSource = path.join(frontendRoot, "licenses", "modnet");
const wasmSource = path.join(frontendRoot, "node_modules", "onnxruntime-web-portrait", "dist");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

await mkdir(destination, { recursive: true });
await copyFile(path.join(licenceSource, "LICENSE"), path.join(destination, "LICENSE"));
await copyFile(path.join(licenceSource, "NOTICE"), path.join(destination, "NOTICE"));

for (const file of WASM_FILES) {
  const bytes = await readFile(path.join(wasmSource, file.name));
  if (sha256(bytes) !== file.sha256) {
    throw new Error(`${file.name} does not match the pinned onnxruntime-web 1.31.1 hash`);
  }
  await writeFile(path.join(destination, file.name), bytes);
}

const modelPath = path.join(destination, MODEL_FILE);
let haveModel = false;
try {
  const existing = await readFile(modelPath);
  haveModel = existing.length === MODEL_BYTES && sha256(existing) === MODEL_SHA256;
} catch {
  haveModel = false;
}
if (!haveModel) {
  const response = await fetch(MODEL_URL, { headers: { "user-agent": "ltf-dojang-hub-build" } });
  if (!response.ok) {
    throw new Error(`GET ${MODEL_URL} failed with ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== MODEL_BYTES || sha256(bytes) !== MODEL_SHA256) {
    throw new Error(`${MODEL_FILE} does not match the pinned portrait model`);
  }
  const temporary = `${modelPath}.partial`;
  await writeFile(temporary, bytes);
  await rename(temporary, modelPath);
}

const saved = await stat(modelPath);
if (saved.size !== MODEL_BYTES) {
  await rm(modelPath, { force: true });
  throw new Error(`${MODEL_FILE} was not saved`);
}
