import type {
  AnalysisDto,
  ConditionsDto,
  EngineErrorDto,
  Envelope,
  NormalizedSpecDto,
} from "@p-lens/contracts/pachislot"

import { Err, Ok, type Result } from "../../domain/result"

/**
 * What the API asks of the pachislot engine, only to check a formula being
 * published: that its 解析値 normalise, and that the figures sent are what
 * they come to. The normalised spec stored is the one made here. The API
 * never calculates anything for anyone, and never samples.
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

/** The pachislot engine reached through its JSON boundary, whatever loaded it. */
export const engineThrough = (normalize: (request: string) => string, analyze: (request: string) => string): Engine => ({
  normalize: (spec) => call<NormalizedSpecDto>(normalize, { spec }),
  analyze: (normalized, conditions) => call<AnalysisDto>(analyze, { source: { type: "normalized", normalized }, conditions }),
})
