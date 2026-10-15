import type {
  AnalysisDto,
  AnalyzeRequest,
  ConditionsDto,
  EngineErrorDto,
  EstimateSummaryDto,
  HuntDto,
  HuntRequest,
  PlayDto,
  SourceDto,
  SummaryDto,
  PosteriorDto,
  PosteriorRequest,
  TheoreticalValueDto,
  TheoreticalValueRequest,
  WeightDto,
} from "@p-lens/contracts/pachislot"

/** A play's spread sampled as the screen asks for it; the worker decides the chunks. */
export interface SimulationOrder {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly weights: readonly WeightDto[]
  readonly play: PlayDto
  readonly plan: { readonly sessions: number; readonly games: number }
  readonly seed: string
}

/** Each setting's payout rate sampled as the screen asks for it; the worker decides the chunks. */
export interface EstimateOrder {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly gamesPerSettingLevel: number
  readonly seed: string
}

/** Why the engine could not be reached at all, as opposed to refusing an input. */
export type WorkerTrouble = { readonly type: "engine-unavailable"; readonly detail: string }

export type EngineFailure = { readonly type: "engine"; readonly error: EngineErrorDto } | WorkerTrouble

/** The calls answered at once, each with its request and its answer. */
export interface Calls {
  readonly analyze: { readonly request: AnalyzeRequest; readonly answer: AnalysisDto }
  readonly posterior: { readonly request: PosteriorRequest; readonly answer: PosteriorDto }
  readonly theoreticalValue: { readonly request: TheoreticalValueRequest; readonly answer: TheoreticalValueDto }
  readonly hunt: { readonly request: HuntRequest; readonly answer: readonly HuntDto[] }
}

export type Call = keyof Calls

/** What the screen sends the worker. */
export type ToWorker =
  | { readonly [C in Call]: { readonly type: "call"; readonly id: number; readonly call: C; readonly request: Calls[C]["request"] } }[Call]
  | { readonly type: "simulate"; readonly id: number; readonly order: SimulationOrder }
  | { readonly type: "estimate"; readonly id: number; readonly order: EstimateOrder }
  | { readonly type: "cancel"; readonly id: number }

/** What a chunked run reports, in the order it happens. */
export type RunEvent<S> =
  | { readonly type: "progress"; readonly summary: S }
  | { readonly type: "completed"; readonly summary: S }
  | { readonly type: "cancelled"; readonly summary: S | undefined }
  | { readonly type: "failed"; readonly failure: EngineFailure }

/** What the worker sends back, each carrying the id it answers. */
export type FromWorker =
  | { readonly type: "answered"; readonly id: number; readonly answer: unknown }
  | { readonly type: "refused"; readonly id: number; readonly failure: EngineFailure }
  | { readonly type: "simulation"; readonly id: number; readonly event: RunEvent<SummaryDto> }
  | { readonly type: "estimate"; readonly id: number; readonly event: RunEvent<EstimateSummaryDto> }
