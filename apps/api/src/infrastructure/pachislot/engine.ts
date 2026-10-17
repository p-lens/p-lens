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
 * never calculates anything for anyone, and never samples. Each call is
 * given `STEPS` of work and answered too heavy past it, well inside what a
 * request may spend, rather than cut off without an answer.
 */
export interface Engine {
  readonly normalize: (spec: unknown) => Result<NormalizedSpecDto, EngineErrorDto>
  readonly analyze: (normalized: NormalizedSpecDto, conditions: ConditionsDto) => Result<AnalysisDto, EngineErrorDto>
}

/** The steps of walking play game by game a call may take: a little more than the heaviest machine checked so far needs. */
const STEPS = 1_000_000

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
  normalize: (spec) => call<NormalizedSpecDto>(normalize, { spec, steps: STEPS }),
  analyze: (normalized, conditions) => call<AnalysisDto>(analyze, { source: { type: "normalized", normalized }, conditions, steps: STEPS }),
})
