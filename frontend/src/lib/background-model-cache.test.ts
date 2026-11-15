import { BackgroundFetchError, backoffMs, fetchModelAsset, modelChunkUrls, prefetchBackgroundModel } from "./background-model-cache";

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
});
