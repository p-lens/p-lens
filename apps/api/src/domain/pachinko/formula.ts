import type { MachineBonusDto } from "@p-lens/contracts"
import { type AnalysisDto, bonusShapesOf, type ConditionsDto, type EngineErrorDto, type FiguresDto, type SpecDto, type NormalizedSpecDto, type SamplingDto } from "@p-lens/contracts/pachinko"

import { all, type Body, bonuses, isBody, object, oneOf, optionalId, optionalPositive, positive } from "../body"
import type { ApiError } from "../errors"
import { Err, Ok, type Result } from "../result"

/** A formula worked out from a basis: exactly, or sampled — so many cycles from a seed, its 1R chance's "one in" within a 95% margin. */
type FromBasis =
  | { readonly kind: "simulated"; readonly spec: Body; readonly conditions: ConditionsDto }
  | { readonly kind: "sampled"; readonly spec: Body; readonly conditions: ConditionsDto; readonly sampling: SamplingDto }

/** A formula as sent, checked for shape. */
export type SentFormula = {
  readonly figures: FiguresDto
  readonly bonuses: readonly MachineBonusDto[]
  readonly derivedFrom: string | undefined
} & ({ readonly kind: "manual" } | FromBasis)

/** A formula ready to store: for one worked out from a basis, the normalised spec made here. */
export type PreparedFormula =
  | (SentFormula & { readonly kind: "manual" })
  | (SentFormula & FromBasis & { readonly normalized: NormalizedSpecDto; readonly engineSchemaVersion: number })

const invalid = (field: string): Result<never, ApiError> => Err({ type: "invalid-body", field, reason: "unknown-value" })

const readFigures = (body: Body): Result<FiguresDto, ApiError> => {
  const read = all({
    roundChanceOneIn: positive(body, "roundChanceOneIn"),
    payoutPerRound: positive(body, "payoutPerRound"),
    totalChanceOneIn: optionalPositive(body, "totalChanceOneIn"),
    spinsPerHour: optionalPositive(body, "spinsPerHour"),
  })
  if (!read.ok) return read
  const { totalChanceOneIn, spinsPerHour, ...required } = read.value
  return Ok({
    ...required,
    ...(totalChanceOneIn === undefined ? {} : { totalChanceOneIn }),
    ...(spinsPerHour === undefined ? {} : { spinsPerHour }),
  })
}

const readConditions = (body: Body): Result<ConditionsDto, ApiError> => {
  const payout = body["roundPayout"]
  if (!isBody(payout)) return invalid("basis.conditions.roundPayout")
  if (payout["type"] === "from-spec") return Ok({ roundPayout: { type: "from-spec" } })
  const balls = payout["balls"]
  return payout["type"] === "measured" && typeof balls === "number" && Number.isFinite(balls) && balls > 0
    ? Ok({ roundPayout: { type: "measured", balls } })
    : invalid("basis.conditions.roundPayout")
}

const readSampling = (body: Body): Result<SamplingDto, ApiError> => {
  const sampling = object(body, "sampling")
  if (!sampling.ok) return sampling
  const read = all({ cycles: positive(sampling.value, "cycles"), roundChanceMargin: positive(sampling.value, "roundChanceMargin") })
  if (!read.ok) return read
  const seed = sampling.value["seed"]
  if (!Number.isInteger(read.value.cycles)) return invalid("sampling.cycles")
  return typeof seed === "string" && /^\d{1,20}$/.test(seed) ? Ok({ ...read.value, seed }) : invalid("sampling.seed")
}

/** A formula body read for shape. Whether a basis makes sense is the engine's to say. */
export const readFormula = (body: Body): Result<SentFormula, ApiError> => {
  const head = all({
    kind: oneOf(body, "kind", ["manual", "simulated", "sampled"] as const),
    figures: object(body, "figures"),
    bonuses: bonuses(body, "bonuses"),
    derivedFrom: optionalId(body, "derivedFrom"),
  })
  if (!head.ok) return head
  const figures = readFigures(head.value.figures)
  if (!figures.ok) return figures
  const common = { figures: figures.value, bonuses: head.value.bonuses, derivedFrom: head.value.derivedFrom }
  if (head.value.kind === "manual") return Ok({ ...common, kind: "manual" })
  const basis = object(body, "basis")
  if (!basis.ok) return basis
  const parts = all({ spec: object(basis.value, "spec"), conditions: object(basis.value, "conditions") })
  if (!parts.ok) return parts
  const conditions = readConditions(parts.value.conditions)
  if (!conditions.ok) return conditions
  const basisOf = { spec: parts.value.spec, conditions: conditions.value }
  if (head.value.kind === "simulated") return Ok({ ...common, kind: "simulated", ...basisOf })
  const sampling = readSampling(body)
  return sampling.ok ? Ok({ ...common, kind: "sampled", ...basisOf, sampling: sampling.value }) : sampling
}

/** Two figures equal as the engine's own arithmetic makes them, allowing for nothing but rounding. */
const agrees = (sent: number, solved: number): boolean => Math.abs(sent - solved) <= 1e-9 * Math.max(1, Math.abs(solved))

/** A 95% margin's standard errors, five of them: how far a sampled figure may stray from the exact one. */
const STRAY = 5 / 1.96

/**
 * The first figure a formula sent that its basis does not come to. A sampled
 * formula's 1R chance cannot be sampled here, so it stands within five
 * standard errors of the exact one by its own stated margin.
 */
const disagreement = (sent: SentFormula & FromBasis, analysis: AnalysisDto): string | undefined => {
  const figures = sent.figures
  const round =
    sent.kind === "sampled"
      ? Math.abs(figures.roundChanceOneIn - analysis.roundChanceOneIn) <= STRAY * sent.sampling.roundChanceMargin + 1e-9
      : agrees(figures.roundChanceOneIn, analysis.roundChanceOneIn)
  if (!round) return "roundChanceOneIn"
  if (!agrees(figures.payoutPerRound, analysis.ballsPerRound)) return "payoutPerRound"
  if (figures.totalChanceOneIn !== undefined && !agrees(figures.totalChanceOneIn, analysis.totalChanceOneIn)) return "totalChanceOneIn"
  return undefined
}

/**
 * Whether the bonuses a formula names are the ones its basis's jackpots
 * pay: one for each, in their order, paying out and taking what it does.
 * The names are the sender's; nothing else is.
 */
const bonusesAgree = (sent: readonly MachineBonusDto[], spec: SpecDto): boolean => {
  const shapes = bonusShapesOf(spec)
  return sent.length === shapes.length && shapes.every((shape, index) => sent[index]?.payout === shape.payout && sent[index]?.spent === shape.spent)
}

/**
 * A formula made ready to store. A simulated one is normalised here, by the
 * engine, and its figures checked against what that comes to: what is stored
 * is derived from the basis, never taken on trust — its bonuses' balls
 * among them. One typed in has no basis to take them from, and states at
 * least one.
 */
export const prepareFormula = (
  sent: SentFormula,
  engine: {
    readonly normalize: (spec: unknown) => Result<NormalizedSpecDto, EngineErrorDto>
    readonly analyze: (normalized: NormalizedSpecDto, conditions: ConditionsDto) => Result<AnalysisDto, EngineErrorDto>
  },
): Result<PreparedFormula, ApiError> => {
  if (sent.kind === "manual") return sent.bonuses.length > 0 ? Ok(sent) : Err({ type: "invalid-body", field: "bonuses", reason: "missing" })
  const normalized = engine.normalize(sent.spec)
  if (!normalized.ok) return Err({ type: "basis-rejected", error: normalized.error })
  if (!bonusesAgree(sent.bonuses, specOf(sent))) return Err({ type: "figures-disagree-with-basis", field: "bonuses" })
  const analysis = engine.analyze(normalized.value, sent.conditions)
  if (!analysis.ok) return Err({ type: "basis-rejected", error: analysis.error })
  const field = disagreement(sent, analysis.value)
  return field === undefined
    ? Ok({ ...sent, normalized: normalized.value, engineSchemaVersion: normalized.value.schemaVersion })
    : Err({ type: "figures-disagree-with-basis", field })
}

/** The spec of a formula worked out from a basis, as stored and served. */
export const specOf = (sent: FromBasis): SpecDto => sent.spec as unknown as SpecDto
