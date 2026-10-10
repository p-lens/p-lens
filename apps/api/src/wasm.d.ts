// Wrangler's CompiledWasm rule turns a `.wasm` import into a compiled module.
declare module "*.wasm" {
  const module: WebAssembly.Module
  export default module
}
