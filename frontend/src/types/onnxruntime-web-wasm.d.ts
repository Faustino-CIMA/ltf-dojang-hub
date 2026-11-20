declare module "onnxruntime-web/wasm" {
  // Browser WASM build of onnxruntime-web 1.21.0. The caller narrows the runtime it uses.
  const runtime: unknown;
  export default runtime;
}

declare module "onnxruntime-web-portrait/wasm" {
  // Portrait model runtime, onnxruntime-web 1.31.1. The caller narrows the runtime it uses.
  const runtime: unknown;
  export default runtime;
}
