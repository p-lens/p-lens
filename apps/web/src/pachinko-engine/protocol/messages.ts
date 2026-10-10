import type {
  AnalysisDto,
  AnalyzeRequest,
  ConditionsDto,
  EngineErrorDto,
  EstimateSummaryDto,
  HyenaHuntRowDto,
  HyenaHuntSummaryDto,
  HyenaHuntTableRequest,
  PlanDto,
  PlayDto,
  SourceDto,
  SummaryDto,
} from "@p-lens/contracts/pachinko"

/** A Monte Carlo run as the screen asks for it; the worker decides the chunks. */
export interface SimulationOrder {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly play: PlayDto
  readonly plan: PlanDto
  readonly seed: string
}

/** An estimate of a formula's figures as the screen asks for it; the worker decides the chunks. */
export interface EstimateOrder {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly cycles: number
  readonly seed: string
}

/** 遊タイム狙い as the screen asks for it: sittings from initial spins; the worker decides the chunks. */
export interface HyenaHuntOrder {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly play: PlayDto
  readonly initialSpins: number
  readonly trials: number
  readonly seed: string
}

/** Why the engine could not be reached at all, as opposed to refusing an input. */
export type WorkerTrouble = { readonly type: "engine-unavailable"; readonly detail: string }

export type EngineFailure = { readonly type: "engine"; readonly error: EngineErrorDto } | WorkerTrouble

/** The calls answered at once, each with its request and its answer. */
export interface Calls {
  readonly analyze: { readonly request: AnalyzeRequest; readonly answer: AnalysisDto }
  /** 遊タイム狙い solved exactly for each of several counts. */
  readonly hyenaHuntTable: { readonly request: HyenaHuntTableRequest; readonly answer: readonly HyenaHuntRowDto[] }
}

export type Call = keyof Calls

/** What the screen sends the worker. */
export type ToWorker =
  | { readonly [C in Call]: { readonly type: "call"; readonly id: number; readonly call: C; readonly request: Calls[C]["request"] } }[Call]
  | { readonly type: "simulate"; readonly id: number; readonly order: SimulationOrder }
  | { readonly type: "estimate"; readonly id: number; readonly order: EstimateOrder }
  | { readonly type: "hyena-hunt"; readonly id: number; readonly order: HyenaHuntOrder }
  | { readonly type: "cancel"; readonly id: number }

/** What a chunked run reports, in the order it happens. */
export type RunEvent<S> =
  | { readonly type: "progress"; readonly summary: S }
  | { readonly type: "completed"; readonly summary: S }
  | { readonly type: "cancelled"; readonly summary: S | undefined }
  | { readonly type: "failed"; readonly failure: EngineFailure }

/** What a simulation reports: how many sessions it set out to play, then as any run does. */
export type SimulationEvent = { readonly type: "started"; readonly planned: number } | RunEvent<SummaryDto>

/** What the worker sends back, each carrying the id it answers. */
export type FromWorker =
  | { readonly type: "answered"; readonly id: number; readonly answer: unknown }
  | { readonly type: "refused"; readonly id: number; readonly failure: EngineFailure }
  | { readonly type: "simulation"; readonly id: number; readonly event: SimulationEvent }
  | { readonly type: "estimate"; readonly id: number; readonly event: RunEvent<EstimateSummaryDto> }
  | { readonly type: "hyena-hunt"; readonly id: number; readonly event: RunEvent<HyenaHuntSummaryDto> }
