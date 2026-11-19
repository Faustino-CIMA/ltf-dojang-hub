/**
 * Portrait matte. MODNet (Apache-2.0) runs at 512 on a small copy.
 * The server removes the background unless the page asks for this model
 * or the usual tool. WebGPU is off.
 *
 * Brave on an iPhone is WebKit and this page is not cross-origin isolated,
 * so the runtime stays on one thread and the fixed-SIMD build. JSPI and
 * relaxed SIMD are not used. The files are copied onto this site.
 */

import { fetchModelAsset } from "@/lib/background-model-cache";

import { fitLongSide, resampleCrop, type PhotoRaster } from "./photo-background";

export const MODNET_FILE = "modnet_photographic_portrait_matting.onnx";
export const MODNET_ASSET_DIR = "/background-removal/modnet/";
export const MODNET_SHA256 = "07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9";
export const MODNET_BYTES = 25888640;
export const MODNET_LONG_SIDE = 512;

/** One thread, fixed SIMD, wasm only. The usual removal tool stays on onnxruntime-web 1.21.0. */
export const portraitRuntime = {
  threads: 1,
  proxy: false,
  simd: "fixed",
  providers: ["wasm"],
} as const;

export type RemovalMask = "isnet" | "modnet" | "server";

export function removalMaskFromSearch(search: string): RemovalMask {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const mask = new URLSearchParams(query).get("mask");
  if (mask === "isnet") return "isnet";
  if (mask === "modnet") return "modnet";
  return "server";
}

export function modnetInputSize(width: number, height: number): { width: number; height: number } {
  const fitted = fitLongSide(width, height, MODNET_LONG_SIDE);
  const round32 = (value: number) => Math.max(32, Math.round(value / 32) * 32);
  return { width: round32(fitted.width), height: round32(fitted.height) };
}

/** RGB, NCHW, (pixel - 127.5) / 127.5. The same scale the portrait model was exported with. */
export function modnetTensor(raster: PhotoRaster): Float32Array {
  const { width, height, data } = raster;
  const tensor = new Float32Array(3 * width * height);
  const plane = width * height;
  for (let index = 0; index < plane; index += 1) {
    const offset = index * 4;
    tensor[index] = (data[offset] - 127.5) / 127.5;
    tensor[plane + index] = (data[offset + 1] - 127.5) / 127.5;
    tensor[plane * 2 + index] = (data[offset + 2] - 127.5) / 127.5;
  }
  return tensor;
}

export function rasterWithMatte(colour: PhotoRaster, matte: Float32Array): PhotoRaster {
  if (matte.length !== colour.width * colour.height) {
    throw new Error("Portrait model returned an unexpected mask.");
  }
  const data = new Uint8ClampedArray(colour.data);
  for (let index = 0; index < matte.length; index += 1) {
    const value = Math.max(0, Math.min(1, matte[index]));
    data[index * 4 + 3] = Math.round(value * 255);
  }
  return { width: colour.width, height: colour.height, data };
}

type OrtTensor = { data: Float32Array };
type OrtSession = {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, OrtTensor>>;
};
type OrtModule = {
  env: {
    wasm: {
      wasmPaths?: string;
      numThreads?: number;
      proxy?: boolean;
      simd?: "fixed";
    };
  };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => unknown;
  InferenceSession: {
    create: (buffer: ArrayBuffer, options: { executionProviders: string[] }) => Promise<OrtSession>;
  };
};

let sessionPromise: Promise<OrtSession> | null = null;

function assetUrl(origin: string, file: string): string {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${base}${MODNET_ASSET_DIR}${file}`;
}

async function loadOrt(origin: string): Promise<OrtModule> {
  const ort = (await import("onnxruntime-web-portrait/wasm")) as unknown as OrtModule;
  ort.env.wasm.wasmPaths = assetUrl(origin, "");
  ort.env.wasm.numThreads = portraitRuntime.threads;
  ort.env.wasm.proxy = portraitRuntime.proxy;
  ort.env.wasm.simd = portraitRuntime.simd;
  return ort;
}

async function loadSession(origin: string, ort: OrtModule): Promise<OrtSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const response = await fetchModelAsset(assetUrl(origin, MODNET_FILE), {
        expectedBytes: MODNET_BYTES,
        expectedHash: MODNET_SHA256,
      });
      const bytes = await response.arrayBuffer();
      return ort.InferenceSession.create(bytes, { executionProviders: [...portraitRuntime.providers] });
    })().catch((error: unknown) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

/** Small colour copy with the portrait matte in the alpha channel. The caller feathers and scales it. */
export async function portraitMatte(full: PhotoRaster, origin: string): Promise<PhotoRaster> {
  const size = modnetInputSize(full.width, full.height);
  const small = resampleCrop(
    full,
    { x: 0, y: 0, width: full.width, height: full.height },
    size.width,
    size.height,
  );
  const ort = await loadOrt(origin);
  const session = await loadSession(origin, ort);
  const output = await session.run({
    input: new ort.Tensor("float32", modnetTensor(small), [1, 3, size.height, size.width]),
  });
  const matte = output.output?.data;
  if (!matte) {
    throw new Error("Portrait model returned an unexpected mask.");
  }
  return rasterWithMatte(small, matte);
}
