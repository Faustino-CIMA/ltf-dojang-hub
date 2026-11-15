declare module "onnxruntime-web/wasm" {
  // Browser WASM build of onnxruntime-web. The caller narrows the runtime it uses.
  const runtime: unknown;
  export default runtime;
}
