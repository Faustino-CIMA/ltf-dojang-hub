export const MODEL_CACHE_NAME = "ltf-background-removal-1.7.0";
export const MODEL_ASSET_PATH = "/background-removal/1.7.0/";
export const MODEL_FETCH_ATTEMPTS = 3;
/** Give up when a chunk sends no new bytes for this long. A slow trickle keeps going. */
export const MODEL_STALL_MS = 12000;

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

export async function openModelCache(): Promise<Cache | null> {
  try {
    if (typeof caches === "undefined" || !caches.open) {
      return null;
    }
    return await caches.open(MODEL_CACHE_NAME);
  } catch {
    return null;
  }
}

async function readCached(cache: Cache | null, url: string): Promise<Response | null> {
  if (!cache) {
    return null;
  }
  try {
    return (await cache.match(url)) ?? null;
  } catch {
    return null;
  }
}

async function storeCached(cache: Cache | null, url: string, body: ArrayBuffer, headers: Headers): Promise<void> {
  if (!cache) {
    return;
  }
  try {
    await cache.put(url, new Response(body.slice(0), { status: 200, headers }));
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

/** Read until the body ends. Reject if no new bytes arrive, even when the platform ignores abort. */
async function readBody(response: Response, stallMs: number, signal: AbortSignal): Promise<ArrayBuffer> {
  const reader = openReader(response);
  if (!reader) {
    return raceStall(response.arrayBuffer(), stallMs, signal);
  }
  const parts: Uint8Array[] = [];
  try {
    while (!signal.aborted) {
      const next = await raceStall(reader.read(), stallMs, signal);
      if (next.done) {
        break;
      }
      if (next.value && next.value.byteLength > 0) {
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
  sleep?: (ms: number) => Promise<void>;
  onRetry?: () => void;
};

/**
 * Cache-first download of one self-hosted model file.
 * A stalled body is a network failure and is retried. A normal HTTP error is not.
 * A finished file stays in the cache. A file that did not finish is dropped.
 */
export async function fetchModelAsset(url: string, options: AssetFetchOptions = {}): Promise<Response> {
  const generation = downloadGeneration;
  const cached = await readCached(options.cache ?? null, url);
  if (generation !== downloadGeneration) {
    throw new BackgroundFetchError("network", "aborted");
  }
  if (cached) {
    return cached;
  }
  const fetchImpl = options.fetchImpl ?? ((address, init) => fetch(address, init));
  const attempts = options.attempts ?? MODEL_FETCH_ATTEMPTS;
  const stallMs = options.stallMs ?? MODEL_STALL_MS;
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
      const response = await raceStall(fetchImpl(url, { signal: controller.signal }), stallMs, controller.signal);
      if (!response.ok) {
        if (response.status >= 500 || response.status === 408 || response.status === 429) {
          lastError = new BackgroundFetchError("network", `status ${response.status}`);
          continue;
        }
        throw new BackgroundFetchError("processing", `status ${response.status}`);
      }
      const body = await readBody(response, stallMs, controller.signal);
      const headers = new Headers(response.headers);
      await storeCached(options.cache ?? null, url, body, headers);
      return new Response(body, { status: 200, headers });
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
