/**
 * Copy the pinned MediaPipe 1.2.3 vision WASM from node_modules and download
 * the pinned Face Landmarker task file into public/face-check/1.2.3/.
 *
 * Coolify runs this while building the frontend image, as its own step after
 * the background-removal download. The browser then loads these files from
 * this origin. Nothing here is committed, and the page does not call
 * storage.googleapis.com or jsDelivr.
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_VERSION = "1.2.3";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const MODEL_BYTES = 3758596;
const WASM_FILES = ["vision_wasm_internal.js", "vision_wasm_internal.wasm"];
const BUNDLE = "vision_bundle.mjs";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(frontendRoot, "public", "face-check", PACKAGE_VERSION);
const packageRoot = path.join(frontendRoot, "node_modules", "@mediapipe", "tasks-vision");
const packageWasm = path.join(packageRoot, "wasm");

await mkdir(destination, { recursive: true });

await copyFile(path.join(packageRoot, BUNDLE), path.join(destination, BUNDLE));

for (const name of WASM_FILES) {
  const source = path.join(packageWasm, name);
  const target = path.join(destination, name);
  await copyFile(source, target);
  const copied = await stat(target);
  if (copied.size < 1000) {
    throw new Error(`${name} looks empty (${copied.size} bytes)`);
  }
}

const modelPath = path.join(destination, "face_landmarker.task");
let alreadyThere = false;
try {
  const existing = await stat(modelPath);
  alreadyThere = existing.size === MODEL_BYTES;
} catch {
  alreadyThere = false;
}
if (!alreadyThere) {
  const response = await fetch(MODEL_URL, {
    headers: { "user-agent": "ltf-dojang-hub-build" },
  });
  if (!response.ok) {
    throw new Error(`GET ${MODEL_URL} failed with ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== MODEL_BYTES) {
    throw new Error(`face_landmarker.task is ${bytes.length} bytes, expected ${MODEL_BYTES}`);
  }
  const { writeFile } = await import("node:fs/promises");
  await writeFile(modelPath, bytes);
}

console.log(`Face check assets ready in ${destination}`);
