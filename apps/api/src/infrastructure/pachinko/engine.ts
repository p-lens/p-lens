import type { AnalysisDto, ConditionsDto, EngineErrorDto, Envelope, NormalizedSpecDto } from "@p-lens/contracts/pachinko"

import { Err, Ok, type Result } from "../../domain/result"

/**
 * What the API asks of the engine, only to check a simulated formula being
 * published: that its basis normalises, and that the figures sent are what
 * the basis comes to. The normalised spec stored is the one made here. The
 * API never calculates anything for anyone.
 */
export interface Engine {
  readonly normalize: (spec: unknown) => Result<NormalizedSpecDto, EngineErrorDto>
  readonly analyze: (normalized: NormalizedSpecDto, conditions: ConditionsDto) => Result<AnalysisDto, EngineErrorDto>
}

const call = <T>(entry: (request: string) => string, request: unknown): Result<T, EngineErrorDto> => {
  try {
    const envelope = JSON.parse(entry(JSON.stringify(request))) as Envelope<T>
    return envelope.ok ? Ok(envelope.value) : Err(envelope.error)
  } catch (cause) {
    return Err({ type: "malformed-request", detail: String(cause) })
  }
}

/** The engine reached through its JSON boundary, whatever loaded it. */
export const engineThrough = (normalize: (request: string) => string, analyze: (request: string) => string): Engine => ({
  normalize: (spec) => call<NormalizedSpecDto>(normalize, { spec }),
  analyze: (normalized, conditions) => call<AnalysisDto>(analyze, { source: { type: "normalized", normalized }, conditions }),
})
