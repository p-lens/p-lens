import type { MachineBonusDto } from "@p-lens/contracts"
import { type AnalysisDto, bonusShapesOf, jackpotsOf, type ConditionsDto, type EngineErrorDto, type FiguresDto, type SpecDto, type NormalizedSpecDto } from "@p-lens/contracts/pachinko"

import { all, type Body, bonuses, isBody, object, oneOf, optionalId, optionalPositive, positive } from "../body"
import type { ApiError } from "../errors"
import { Err, Ok, type Result } from "../result"

/** A formula worked out from a basis, exactly. */
interface FromBasis {
  readonly kind: "simulated"
  readonly spec: Body
  readonly conditions: ConditionsDto
}

/** A formula as sent, checked for shape. */
export type SentFormula = {
  readonly figures: FiguresDto
  readonly bonuses: readonly MachineBonusDto[]
  readonly derivedFrom: string | undefined
} & ({ readonly kind: "manual" } | FromBasis)

/** A formula ready to store: for one worked out from a basis, the normalised spec made here. */
export type PreparedFormula =
  | (SentFormula & { readonly kind: "manual" })
  | (SentFormula & FromBasis & { readonly normalized: NormalizedSpecDto; readonly engineSchemaVersion: number; readonly engineVersion: number })

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

/**
 * A formula body read for shape. Whether a basis makes sense is the engine's
 * to say. A sampled formula is not taken: its figure was an estimate of
 * what its basis comes to exactly, held to that only by a margin its sender
 * stated, and the exact figure is made here from the same basis.
 */
export const readFormula = (body: Body): Result<SentFormula, ApiError> => {
  const head = all({
    kind: oneOf(body, "kind", ["manual", "simulated"] as const),
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
  return Ok({ ...common, kind: "simulated", spec: parts.value.spec, conditions: conditions.value })
}

/** Two figures equal as the engine's own arithmetic makes them, allowing for nothing but rounding. */
const agrees = (sent: number, solved: number): boolean => Math.abs(sent - solved) <= 1e-9 * Math.max(1, Math.abs(solved))

/** The first figure a formula sent that its basis does not come to. */
const disagreement = (sent: SentFormula & FromBasis, analysis: AnalysisDto): string | undefined => {
  const figures = sent.figures
  if (!agrees(figures.roundChanceOneIn, analysis.roundChanceOneIn)) return "roundChanceOneIn"
  if (!agrees(figures.payoutPerRound, analysis.ballsPerRound)) return "payoutPerRound"
  if (figures.totalChanceOneIn !== undefined && !agrees(figures.totalChanceOneIn, analysis.totalChanceOneIn)) return "totalChanceOneIn"
  return undefined
}

/**
 * Whether the bonuses a formula names are the ones its basis's jackpots
 * pay: one for each, in their order, paying out and taking what it does,
 * won over as many jackpots as its share says. The names are the sender's;
 * nothing else is.
 */
const bonusesAgree = (sent: readonly MachineBonusDto[], spec: SpecDto): boolean => {
  const shapes = bonusShapesOf(spec)
  return sent.length === shapes.length && shapes.every((shape, index) => ((bonus) => bonus !== undefined && bonus.payout === shape.payout && bonus.spent === shape.spent && jackpotsOf(bonus) === shape.jackpots)(sent[index]))
}

/**
 * A formula made ready to store. A simulated one is normalised here, by the
 * engine, and its figures checked against what that comes to: what is stored
 * is derived from the basis, never taken on trust — its bonuses' balls
 * among them, and it keeps the version of the engine that checked them. One
 * typed in has no basis to take them from, and states at least one.
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
    ? Ok({ ...sent, normalized: normalized.value, engineSchemaVersion: normalized.value.schemaVersion, engineVersion: analysis.value.engineVersion })
    : Err({ type: "figures-disagree-with-basis", field })
}

/** The spec of a formula worked out from a basis, as stored and served. */
export const specOf = (sent: FromBasis): SpecDto => sent.spec as unknown as SpecDto
