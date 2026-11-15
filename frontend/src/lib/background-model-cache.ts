export const MODEL_CACHE_NAME = "ltf-background-removal-1.7.0";
export const MODEL_ASSET_PATH = "/background-removal/1.7.0/";
export const MODEL_FETCH_ATTEMPTS = 3;
export const MODEL_FETCH_TIMEOUT_MS = 20000;

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

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

/**
 * Cache-first download of one self-hosted model file.
 * Network and timeout failures are retried. A normal HTTP error is not.
 */
export async function fetchModelAsset(
  url: string,
  options: {
    fetchImpl?: FetchLike;
    cache?: Cache | null;
    attempts?: number;
    timeoutMs?: number;
    sleep?: (ms: number) => Promise<void>;
    onRetry?: () => void;
  } = {},
): Promise<Response> {
  const cached = await readCached(options.cache ?? null, url);
  if (cached) {
    return cached;
  }
  const fetchImpl = options.fetchImpl ?? ((address, init) => fetch(address, init));
  const attempts = options.attempts ?? MODEL_FETCH_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? MODEL_FETCH_TIMEOUT_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) {
      options.onRetry?.();
      await sleep(backoffMs(attempt - 1));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response.ok) {
        if (response.status >= 500 || response.status === 408 || response.status === 429) {
          lastError = new BackgroundFetchError("network", `status ${response.status}`);
          continue;
        }
        throw new BackgroundFetchError("processing", `status ${response.status}`);
      }
      const body = await response.arrayBuffer();
      const headers = new Headers(response.headers);
      await storeCached(options.cache ?? null, url, body, headers);
      return new Response(body, { status: 200, headers });
    } catch (error) {
      if (error instanceof BackgroundFetchError && error.kind === "processing") {
        throw error;
      }
      lastError = error;
    } finally {
      clearTimeout(timer);
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
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
  const resourcesUrl = new URL("resources.json", options.publicPath).toString();
  const shared = {
    fetchImpl: options.fetchImpl,
    cache: options.cache,
    attempts: options.attempts,
    timeoutMs: options.timeoutMs,
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

export async function runWithModelFetch<T>(
  run: () => Promise<T>,
  hooks: { onRetry?: () => void; cache?: Cache | null } = {},
): Promise<T> {
  const cache = hooks.cache === undefined ? await openModelCache() : hooks.cache;
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (!url.includes(MODEL_ASSET_PATH)) {
      return original(input, init);
    }
    return fetchModelAsset(url, {
      cache,
      fetchImpl: (address, next) => original(address, { ...init, signal: next?.signal }),
      onRetry: hooks.onRetry,
    });
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}
