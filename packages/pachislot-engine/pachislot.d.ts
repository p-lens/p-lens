/** The pachislot engine's calls: JSON text in, a JSON envelope out. See `@p-lens/contracts/pachislot`. */
export default function init(module?: { module_or_path?: URL | string | BufferSource | WebAssembly.Module }): Promise<unknown>
export function initSync(module: { module: BufferSource | WebAssembly.Module }): unknown
export function normalize(request: string): string
export function analyze(request: string): string
export function posterior(request: string): string
export function theoreticalValue(request: string): string
export function simulateChunk(request: string): string
export function estimateChunk(request: string): string
