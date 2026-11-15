/** Bumped so a bad copy stored by the previous download code is never used. */
export const MODEL_CACHE_NAME = "ltf-background-removal-1.7.0-v2";
const RETIRED_CACHE_NAMES = ["ltf-background-removal-1.7.0"];
export const MODEL_ASSET_PATH = "/background-removal/1.7.0/";
export const MODEL_FETCH_ATTEMPTS = 3;
/**
 * A 4MB model piece can sit in the browser buffer before JavaScript sees a
 * byte. That wait is not a dropped connection.
 */
export const MODEL_FIRST_BYTE_MS = 60000;
/** Give up when bytes have started and then nothing new arrives. */
export const MODEL_STALL_MS = 20000;

export class BackgroundFetchError extends Error {
  readonly kind: "network" | "processing";

  constructor(kind: "network" | "processing", message: string) {
    super(message);
    this.name = "BackgroundFetchError";
    this.kind = kind;
  }
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export function modelChunkUrls(resources: Record<string, { chunks?: Array<{ name: string }> }>, publicPath: string): string[] {
  const urls: string[] = [];
  for (const [key, entry] of Object.entries(resources)) {
    const cpuModel = key.includes("isnet_fp16");
    const cpuRuntime = key.includes("ort-wasm-simd-threaded") && !key.includes("jsep");
    if (!cpuModel && !cpuRuntime) {
      continue;
    }
    for (const chunk of entry.chunks ?? []) {
      urls.push(new URL(chunk.name, publicPath).toString());
    }
  }
  return urls;
}

export function backoffMs(attempt: number): number {
  return 200 * 2 ** Math.max(0, attempt - 1);
}

const expectedBytesByPath = new Map<string, number>();

export async function openModelCache(): Promise<Cache | null> {
  try {
    if (typeof caches === "undefined" || !caches.open) {
      return null;
    }
    if (caches.delete) {
      await Promise.all(RETIRED_CACHE_NAMES.map((name) => caches.delete(name).catch(() => false)));
    }
    return await caches.open(MODEL_CACHE_NAME);
  } catch {
    return null;
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function isManifestUrl(url: string): boolean {
  return pathOf(url).endsWith("resources.json");
}

function hashFromUrl(url: string): string | null {
  const name = pathOf(url).split("/").pop() ?? "";
  return /^[0-9a-f]{64}$/.test(name) ? name : null;
}

function rememberManifest(body: ArrayBuffer, resourcesUrl: string): void {
  try {
    const text = new TextDecoder().decode(body);
    const data = JSON.parse(text) as Record<string, { chunks?: Array<{ name?: string; offsets?: number[] }> }>;
    for (const entry of Object.values(data)) {
      for (const chunk of entry.chunks ?? []) {
        const offsets = chunk.offsets ?? [];
        const size = (offsets[1] ?? 0) - (offsets[0] ?? 0);
        if (!chunk.name || size <= 0) {
          continue;
        }
        expectedBytesByPath.set(pathOf(new URL(chunk.name, resourcesUrl).toString()), size);
      }
    }
  } catch {
    // The library reports a bad manifest. Don't block the bytes we already have.
  }
}

function expectedBytesFor(url: string, explicit?: number): number | undefined {
  if (explicit !== undefined && explicit > 0) {
    return explicit;
  }
  return expectedBytesByPath.get(pathOf(url));
}

async function matchesHash(bytes: ArrayBuffer, expected: string): Promise<boolean> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      return true;
    }
    const digest = await subtle.digest("SHA-256", bytes);
    const view = new Uint8Array(digest);
    let hex = "";
    for (const byte of view) {
      hex += byte.toString(16).padStart(2, "0");
    }
    return hex === expected;
  } catch {
    return true;
  }
}

function responseFromBytes(bytes: ArrayBuffer, contentType: string): Response {
  const headers = new Headers();
  headers.set("content-type", contentType || "application/octet-stream");
  return new Response(bytes.slice(0), { status: 200, headers });
}

async function loadCachedBytes(cache: Cache | null, url: string, expected?: number): Promise<ArrayBuffer | null> {
  if (!cache) {
    return null;
  }
  let cached: Response | undefined;
  try {
    cached = (await cache.match(url)) ?? undefined;
  } catch {
    return null;
  }
  if (!cached) {
    return null;
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await cached.arrayBuffer();
  } catch {
    await dropCached(cache, url);
    return null;
  }
  const namedHash = hashFromUrl(url);
  const hashOk = namedHash ? await matchesHash(bytes, namedHash) : true;
  const sizeOk = expected === undefined || bytes.byteLength === expected;
  if (!hashOk || !sizeOk) {
    await dropCached(cache, url);
    return null;
  }
  return bytes;
}

async function storeCached(cache: Cache | null, url: string, body: ArrayBuffer, contentType: string): Promise<void> {
  if (!cache) {
    return;
  }
  try {
    await cache.put(url, responseFromBytes(body, contentType));
  } catch {
    // iOS may refuse the Cache API when storage is full. The download still succeeds.
  }
}

async function dropCached(cache: Cache | null, url: string): Promise<void> {
  if (!cache) {
    return;
  }
  try {
    await cache.delete(url);
  } catch {
    // Storage may already be gone. The next try starts from the network.
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

type ByteReader = {
  read: () => Promise<{ done: boolean; value?: Uint8Array }>;
  cancel: () => Promise<void>;
};

const activeDownloads = new Set<AbortController>();
let downloadGeneration = 0;

/** Stop every model download that is still open, including one that never reports an error. */
export function abortModelDownloads(): void {
  downloadGeneration += 1;
  for (const controller of activeDownloads) {
    controller.abort();
  }
  activeDownloads.clear();
}

function raceStall<T>(work: Promise<T>, stallMs: number, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      settle();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new BackgroundFetchError("network", "stalled")));
    }, stallMs);
    const onAbort = () => {
      finish(() => reject(new BackgroundFetchError("network", "aborted")));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort);
    work.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

function concatBytes(parts: Uint8Array[]): ArrayBuffer {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes.buffer;
}

function openReader(response: Response): ByteReader | null {
  const body = response.body as { getReader?: () => ByteReader } | null;
  if (!body || typeof body.getReader !== "function") {
    return null;
  }
  return body.getReader();
}

/** Read until the body ends. The first byte may wait while the browser buffers a chunk. */
async function readBody(
  response: Response,
  firstByteMs: number,
  stallMs: number,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  const reader = openReader(response);
  if (!reader) {
    return raceStall(response.arrayBuffer(), firstByteMs, signal);
  }
  const parts: Uint8Array[] = [];
  let seen = 0;
  try {
    while (!signal.aborted) {
      const budget = seen === 0 ? firstByteMs : stallMs;
      const next = await raceStall(reader.read(), budget, signal);
      if (next.done) {
        break;
      }
      if (next.value && next.value.byteLength > 0) {
        seen += next.value.byteLength;
        parts.push(next.value);
      }
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  }
  if (signal.aborted) {
    void reader.cancel().catch(() => undefined);
    throw new BackgroundFetchError("network", "aborted");
  }
  return concatBytes(parts);
}

type AssetFetchOptions = {
  fetchImpl?: FetchLike;
  cache?: Cache | null;
  attempts?: number;
  stallMs?: number;
  firstByteMs?: number;
  expectedBytes?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: () => void;
};

function budgets(options: AssetFetchOptions): { firstByteMs: number; stallMs: number } {
  const stallMs = options.stallMs ?? MODEL_STALL_MS;
  const firstByteMs = options.firstByteMs ?? (options.stallMs !== undefined ? options.stallMs : MODEL_FIRST_BYTE_MS);
  return { firstByteMs, stallMs };
}

/**
 * Cache-first download of one self-hosted model file.
 * A finished, complete file stays in the cache. A short or wrong file is dropped
 * and fetched again. A stalled body is a network failure. A normal HTTP error is not.
 * The returned response is a fresh body the removal library can read.
 */
export async function fetchModelAsset(url: string, options: AssetFetchOptions = {}): Promise<Response> {
  const generation = downloadGeneration;
  const expected = expectedBytesFor(url, options.expectedBytes);
  const cachedBytes = await loadCachedBytes(options.cache ?? null, url, expected);
  if (generation !== downloadGeneration) {
    throw new BackgroundFetchError("network", "aborted");
  }
  if (cachedBytes) {
    if (isManifestUrl(url)) {
      rememberManifest(cachedBytes, url);
    }
    return responseFromBytes(cachedBytes, isManifestUrl(url) ? "application/json" : "application/octet-stream");
  }
  const fetchImpl = options.fetchImpl ?? ((address, init) => fetch(address, init));
  const attempts = options.attempts ?? MODEL_FETCH_ATTEMPTS;
  const { firstByteMs, stallMs } = budgets(options);
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (generation !== downloadGeneration) {
      throw new BackgroundFetchError("network", "aborted");
    }
    if (attempt > 1) {
      options.onRetry?.();
      await sleep(backoffMs(attempt - 1));
      if (generation !== downloadGeneration) {
        throw new BackgroundFetchError("network", "aborted");
      }
    }
    const controller = new AbortController();
    activeDownloads.add(controller);
    try {
      const response = await raceStall(fetchImpl(url, { signal: controller.signal }), firstByteMs, controller.signal);
      if (!response.ok) {
        if (response.status >= 500 || response.status === 408 || response.status === 429) {
          lastError = new BackgroundFetchError("network", `status ${response.status}`);
          continue;
        }
        throw new BackgroundFetchError("processing", `status ${response.status}`);
      }
      const body = await readBody(response, firstByteMs, stallMs, controller.signal);
      const wanted = expectedBytesFor(url, options.expectedBytes);
      const namedHash = hashFromUrl(url);
      const hashOk = namedHash ? await matchesHash(body, namedHash) : true;
      if ((wanted !== undefined && body.byteLength !== wanted) || !hashOk) {
        lastError = new BackgroundFetchError("network", "downloaded file is incomplete");
        continue;
      }
      const contentType = isManifestUrl(url) ? "application/json" : response.headers.get("content-type") || "application/octet-stream";
      if (isManifestUrl(url)) {
        rememberManifest(body, url);
      }
      await storeCached(options.cache ?? null, url, body, contentType);
      return responseFromBytes(body, contentType);
    } catch (error) {
      await dropCached(options.cache ?? null, url);
      if (controller.signal.aborted) {
        throw new BackgroundFetchError("network", "aborted");
      }
      if (error instanceof BackgroundFetchError && error.kind === "processing") {
        throw error;
      }
      lastError = error;
    } finally {
      activeDownloads.delete(controller);
    }
  }
  throw new BackgroundFetchError("network", lastError instanceof Error ? lastError.message : "download failed");
}

export async function prefetchBackgroundModel(options: {
  publicPath: string;
  fetchImpl?: FetchLike;
  cache?: Cache | null;
  onProgress?: (percent: number) => void;
  onRetry?: () => void;
  attempts?: number;
  stallMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
  const resourcesUrl = new URL("resources.json", options.publicPath).toString();
  const shared = {
    fetchImpl: options.fetchImpl,
    cache: options.cache,
    attempts: options.attempts,
    stallMs: options.stallMs,
    sleep: options.sleep,
    onRetry: options.onRetry,
  };
  const resourcesResponse = await fetchModelAsset(resourcesUrl, shared);
  const resources = (await resourcesResponse.json()) as Record<string, { chunks?: Array<{ name: string }> }>;
  const urls = modelChunkUrls(resources, options.publicPath);
  if (urls.length === 0) {
    options.onProgress?.(100);
    return;
  }
  for (let index = 0; index < urls.length; index += 1) {
    await fetchModelAsset(urls[index], shared);
    options.onProgress?.(Math.round(((index + 1) / urls.length) * 100));
  }
}

type FetchContext = { cache: Cache | null; onRetry?: () => void };

let installedFetch: typeof fetch | null = null;
let fetchDepth = 0;
const fetchStack: FetchContext[] = [];

export async function runWithModelFetch<T>(
  run: () => Promise<T>,
  hooks: { onRetry?: () => void; cache?: Cache | null } = {},
): Promise<T> {
  const cache = hooks.cache === undefined ? await openModelCache() : hooks.cache;
  if (fetchDepth === 0) {
    installedFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const current = fetchStack[fetchStack.length - 1];
      const real = installedFetch ?? globalThis.fetch.bind(globalThis);
      if (!current || !url.includes(MODEL_ASSET_PATH)) {
        return real(input, init);
      }
      return fetchModelAsset(url, {
        cache: current.cache,
        fetchImpl: (address, next) => real(address, { signal: next?.signal }),
        onRetry: current.onRetry,
      });
    }) as typeof fetch;
  }
  fetchDepth += 1;
  fetchStack.push({ cache, onRetry: hooks.onRetry });
  try {
    return await run();
  } finally {
    fetchStack.pop();
    fetchDepth -= 1;
    if (fetchDepth === 0 && installedFetch) {
      globalThis.fetch = installedFetch;
      installedFetch = null;
    }
  }
}
