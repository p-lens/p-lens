// The glue wasm-bindgen generates for crates/pachinko-wasm, written here by
// scripts/build-pachinko.sh. Each call takes and returns JSON text in the
// shapes of @p-lens/contracts.
export default function init(module?: { module_or_path?: URL | string | BufferSource | WebAssembly.Module }): Promise<unknown>
export function initSync(module: { module: BufferSource | WebAssembly.Module }): unknown
export function normalize(request: string): string
export function analyze(request: string): string
export function simulateChunk(request: string): string
export function estimateChunk(request: string): string
export function hyenaHuntChunk(request: string): string
export function hyenaHuntTable(request: string): string
export function inferenceChunk(request: string): string
export function sunkChunk(request: string): string
