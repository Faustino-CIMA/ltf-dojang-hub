import {
  BackgroundFetchError,
  abortModelDownloads,
  backoffMs,
  fetchModelAsset,
  modelChunkUrls,
  prefetchBackgroundModel,
  runWithModelFetch,
} from "./background-model-cache";

class TestResponse {
  status: number;
  headers: Headers;
  private readonly textBody: string;

  constructor(body: string | ArrayBuffer, init?: { status?: number; headers?: Headers }) {
    this.status = init?.status ?? 200;
    this.headers = init?.headers ?? new Headers();
    if (typeof body === "string") {
      this.textBody = body;
    } else {
      const bytes = new Uint8Array(body);
      this.textBody = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    }
  }

  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const bytes = Uint8Array.from(this.textBody, (char) => char.charCodeAt(0));
    return bytes.buffer;
  }

  async text(): Promise<string> {
    return this.textBody;
  }

  async json(): Promise<unknown> {
    return JSON.parse(this.textBody);
  }

  clone(): TestResponse {
    return this;
  }
}

beforeAll(() => {
  globalThis.Response = TestResponse as unknown as typeof Response;
});

function ok(body: string): Response {
  return new TestResponse(body) as unknown as Response;
}

describe("background model download", () => {
  it("retries a failed chunk and then keeps the bytes", async () => {
    const fetchImpl = jest
      .fn<Promise<Response>, [string]>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockRejectedValueOnce(new TypeError("reset"))
      .mockResolvedValueOnce(ok("weights"));
    const response = await fetchModelAsset("https://app.example/background-removal/1.7.0/models/isnet", {
      fetchImpl: (url) => fetchImpl(url),
      attempts: 3,
      sleep: async () => undefined,
      cache: null,
    });
    expect(await response.text()).toBe("weights");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(backoffMs(1)).toBe(200);
    expect(backoffMs(2)).toBe(400);
  });

  it("does not retry a normal missing file", async () => {
    const fetchImpl = jest.fn(async () => new TestResponse("no", { status: 404 }) as unknown as Response);
    await expect(
      fetchModelAsset("https://app.example/background-removal/1.7.0/missing", {
        fetchImpl,
        attempts: 3,
        sleep: async () => undefined,
        cache: null,
      }),
    ).rejects.toBeInstanceOf(BackgroundFetchError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("uses a cached file and does not touch the network", async () => {
    const stored = ok("cached-weights");
    const cache = {
      match: jest.fn(async () => stored),
      put: jest.fn(),
    } as unknown as Cache;
    const fetchImpl = jest.fn();
    const response = await fetchModelAsset("https://app.example/background-removal/1.7.0/models/isnet", {
      fetchImpl,
      cache,
    });
    expect(await response.text()).toBe("cached-weights");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("still returns the file when the device refuses to store it", async () => {
    const cache = {
      match: jest.fn(async () => undefined),
      put: jest.fn(async () => {
        throw new DOMException("quota", "QuotaExceededError");
      }),
    } as unknown as Cache;
    const response = await fetchModelAsset("https://app.example/background-removal/1.7.0/models/isnet", {
      fetchImpl: async () => ok("weights"),
      cache,
      attempts: 1,
    });
    expect(await response.text()).toBe("weights");
  });

  it("prefetches the cpu model after the connection returns", async () => {
    let online = false;
    const fetchImpl = jest.fn(async (url: string) => {
      if (!online) {
        throw new TypeError("offline");
      }
      if (url.endsWith("resources.json")) {
        return ok(JSON.stringify({
          "models/isnet_fp16": { chunks: [{ name: "models/isnet_fp16/chunk" }] },
          "onnxruntime-web/ort-wasm-simd-threaded.wasm": { chunks: [{ name: "onnxruntime-web/ort.wasm" }] },
          "onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm": { chunks: [{ name: "onnxruntime-web/skip.wasm" }] },
        }));
      }
      return ok(url);
    });
    await expect(
      prefetchBackgroundModel({
        publicPath: "https://app.example/background-removal/1.7.0/",
        fetchImpl,
        cache: null,
        attempts: 1,
        sleep: async () => undefined,
      }),
    ).rejects.toMatchObject({ kind: "network" });
    online = true;
    const seen: number[] = [];
    await prefetchBackgroundModel({
      publicPath: "https://app.example/background-removal/1.7.0/",
      fetchImpl,
      cache: null,
      attempts: 1,
      sleep: async () => undefined,
      onProgress: (percent) => seen.push(percent),
    });
    expect(seen.at(-1)).toBe(100);
    const urls = modelChunkUrls(
      {
        "models/isnet_fp16": { chunks: [{ name: "models/isnet_fp16/chunk" }] },
        "onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm": { chunks: [{ name: "onnxruntime-web/skip.wasm" }] },
      },
      "https://app.example/background-removal/1.7.0/",
    );
    expect(urls).toEqual(["https://app.example/background-removal/1.7.0/models/isnet_fp16/chunk"]);
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).includes("skip.wasm"))).toBe(false);
  });

  it("keeps reading while bytes are still arriving", async () => {
    let reads = 0;
    const response = await fetchModelAsset("https://app.example/background-removal/1.7.0/models/isnet", {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: {
          getReader: () => ({
            read: async () => {
              reads += 1;
              await new Promise((resolve) => setTimeout(resolve, 15));
              if (reads < 3) {
                return { done: false, value: new Uint8Array([reads]) };
              }
              return { done: true };
            },
            cancel: async () => undefined,
          }),
        },
      }) as unknown as Response,
      cache: null,
      attempts: 1,
      stallMs: 200,
    });
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2]);
  });

  it("gives up when the request itself never answers", async () => {
    await expect(
      fetchModelAsset("https://app.example/background-removal/1.7.0/models/isnet", {
        fetchImpl: () => new Promise(() => undefined),
        cache: null,
        attempts: 1,
        stallMs: 30,
      }),
    ).rejects.toMatchObject({ kind: "network" });
  });

  it("gives up when a download accepts the request and then sends no more bytes", async () => {
    const fetchImpl = jest.fn(async () => stalledResponse());
    const cache = { match: jest.fn(async () => undefined), put: jest.fn(), delete: jest.fn() } as unknown as Cache;
    await expect(
      fetchModelAsset("https://app.example/background-removal/1.7.0/models/isnet", {
        fetchImpl,
        cache,
        attempts: 1,
        stallMs: 30,
      }),
    ).rejects.toMatchObject({ kind: "network" });
    expect(cache.put).not.toHaveBeenCalled();
    expect(cache.delete).toHaveBeenCalled();
  });

  it("keeps a finished chunk and fetches the one that failed again", async () => {
    const stored = new Map<string, Response>([
      ["https://app.example/background-removal/1.7.0/onnxruntime-web/ort.wasm", ok("wasm")],
    ]);
    const cache = {
      match: jest.fn(async (url: string) => stored.get(url)),
      put: jest.fn(async (url: string, response: Response) => {
        stored.set(url, response);
      }),
      delete: jest.fn(),
    } as unknown as Cache;
    const fetchImpl = jest.fn<Promise<Response>, [string]>(async () => ok("model"));
    const wasm = await fetchModelAsset("https://app.example/background-removal/1.7.0/onnxruntime-web/ort.wasm", {
      fetchImpl,
      cache,
    });
    const model = await fetchModelAsset("https://app.example/background-removal/1.7.0/models/isnet", {
      fetchImpl,
      cache,
      attempts: 1,
      stallMs: 1000,
    });
    expect(await wasm.text()).toBe("wasm");
    expect(await model.text()).toBe("model");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain("isnet");
  });

  it("drops a stalled download when Retry starts another one", async () => {
    const url = "https://app.example/background-removal/1.7.0/models/isnet";
    const hung = fetchModelAsset(url, {
      fetchImpl: async () => stalledResponse(),
      cache: null,
      attempts: 1,
      stallMs: 10000,
    });
    abortModelDownloads();
    await expect(hung).rejects.toMatchObject({ kind: "network" });
    const fetchImpl = jest.fn(async () => ok("weights"));
    const again = await fetchModelAsset(url, {
      fetchImpl,
      cache: null,
      attempts: 1,
      stallMs: 1000,
    });
    expect(await again.text()).toBe("weights");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sends the library's model fetch through the cached download", async () => {
    const original = globalThis.fetch;
    const inner = jest.fn<Promise<Response>, [string]>(async () => ok("chunk"));
    globalThis.fetch = inner as unknown as typeof fetch;
    try {
      await runWithModelFetch(
        async () => {
          const response = await fetch("https://app.example/background-removal/1.7.0/models/isnet", {});
          expect(await response.text()).toBe("chunk");
          const other = await fetch("https://app.example/photo.png");
          expect(await other.text()).toBe("chunk");
        },
        { cache: null },
      );
    } finally {
      globalThis.fetch = original;
    }
    expect(inner).toHaveBeenCalledTimes(2);
    expect(String(inner.mock.calls[0][0])).toContain("/background-removal/1.7.0/");
  });
});

function stalledResponse(): Response {
  const reader = {
    read: () => new Promise<{ done: boolean; value?: Uint8Array }>(() => undefined),
    cancel: async () => undefined,
  };
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-length": "1000" }),
    body: { getReader: () => reader },
    arrayBuffer: () => new Promise<ArrayBuffer>(() => undefined),
    clone() {
      return this;
    },
  } as unknown as Response;
}
