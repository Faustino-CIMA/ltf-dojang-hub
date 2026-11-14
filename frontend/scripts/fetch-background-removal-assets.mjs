/**
 * Download the pinned @imgly/background-removal 1.7.0 weights into public/.
 *
 * Coolify (and docker compose) run this while building the frontend image.
 * The files are served from this app's origin at runtime. They are not
 * committed, and nothing is copied onto a live container by hand.
 *
 * Only the CPU build is kept: isnet_fp16 plus the non-WebGPU WASM runtime.
 */
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.7.0";
const SOURCE = `https://staticimgly.com/@imgly/background-removal-data/${VERSION}/dist/`;
const KEEP = [
  "/models/isnet_fp16",
  "/onnxruntime-web/ort-wasm-simd-threaded.wasm",
  "/onnxruntime-web/ort-wasm-simd-threaded.mjs",
];

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(frontendRoot, "public", "background-removal", VERSION);

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "ltf-dojang-hub-build" },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function downloadChunk(name, expectedSize) {
  const target = path.join(destination, name);
  try {
    const existing = await stat(target);
    if (existing.size === expectedSize) {
      return;
    }
  } catch {
    // Missing file. Download it.
  }
  const url = new URL(name, SOURCE).toString();
  const response = await fetch(url, {
    headers: { "user-agent": "ltf-dojang-hub-build" },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== expectedSize) {
    throw new Error(`${name} is ${bytes.length} bytes, expected ${expectedSize}`);
  }
  const temporary = `${target}.partial`;
  await writeFile(temporary, bytes);
  await rename(temporary, target);
}

const manifestBytes = await fetchBuffer(new URL("resources.json", SOURCE));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const filtered = {};
await mkdir(destination, { recursive: true });

for (const key of KEEP) {
  const entry = manifest[key];
  if (!entry || !Array.isArray(entry.chunks)) {
    throw new Error(`Model manifest has no ${key}`);
  }
  filtered[key] = entry;
  let bytes = 0;
  for (const chunk of entry.chunks) {
    const size = chunk.offsets[1] - chunk.offsets[0];
    bytes += size;
    await downloadChunk(chunk.name, size);
  }
  if (bytes !== entry.size) {
    throw new Error(`${key} chunks add up to ${bytes}, manifest says ${entry.size}`);
  }
}

const manifestPath = path.join(destination, "resources.json");
await writeFile(manifestPath, JSON.stringify(filtered));
const written = JSON.parse(await readFile(manifestPath, "utf8"));
for (const key of KEEP) {
  if (!written[key]) {
    throw new Error(`Wrote a manifest without ${key}`);
  }
}

const megabytes = KEEP.reduce((sum, key) => sum + filtered[key].size, 0) / 1e6;
console.log(`Background removal assets ready (${megabytes.toFixed(1)} MB) in ${destination}`);
