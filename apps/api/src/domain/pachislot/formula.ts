import type {
  NewSettingDistributionDto,
  BySettingLevelDto,
  AnalysisDto,
  ConditionsDto,
  EngineErrorDto,
  FormulaKindDto,
  NormalizedSpecDto,
  SamplingDto,
  FormulaSettingLevelFiguresDto,
  SpecDto,
} from "@p-lens/contracts/pachislot"

import { all, type Body, decentName, isBody, object, oneOf, optionalId } from "../body"
import type { ApiError } from "../errors"
import { Err, Ok, type Result } from "../result"

/** A pachislot formula as sent, checked for shape. */
export interface SentFormula {
  readonly kind: FormulaKindDto
  readonly figures: readonly FormulaSettingLevelFiguresDto[]
  readonly spec: Body
  readonly conditions: ConditionsDto
  readonly sampling: SamplingDto | undefined
  readonly derivedFrom: string | undefined
}

/** A pachislot formula ready to store: with the normalised spec made here. */
export interface PreparedFormula extends SentFormula {
  readonly normalized: NormalizedSpecDto
  readonly engineSchemaVersion: number
}

const KINDS: readonly FormulaKindDto[] = ["manual", "simulated", "sampled"]

const invalid = (field: string, reason: Extract<ApiError, { type: "invalid-body" }>["reason"] = "unknown-value"): Result<never, ApiError> =>
  Err({ type: "invalid-body", field, reason })

const isPositive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0

const isShare = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1

const isSettingLevel = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6

/** Results in order: every value, or the first that failed. */
const each = <T>(results: readonly Result<T, ApiError>[]): Result<readonly T[], ApiError> => {
  const failed = results.find((result) => !result.ok)
  if (failed !== undefined && !failed.ok) return failed
  return Ok(results.flatMap((result) => (result.ok ? [result.value] : [])))
}

const readBonus = (value: unknown, field: string): Result<{ readonly id: string; readonly oneIn: number }, ApiError> => {
  if (!isBody(value)) return invalid(field, "not-json")
  if (typeof value["id"] !== "string" || value["id"].trim() === "") return invalid(`${field}.id`, "missing")
  return isPositive(value["oneIn"]) ? Ok({ id: value["id"], oneIn: value["oneIn"] }) : invalid(`${field}.oneIn`, "not-positive")
}

const readAt = (value: unknown, field: string): Result<FormulaSettingLevelFiguresDto["at"], ApiError> => {
  if (value === undefined) return Ok(undefined)
  if (!isBody(value)) return invalid(field, "not-json")
  if (!isPositive(value["gain"])) return invalid(`${field}.gain`, "not-positive")
  return isShare(value["completion"]) ? Ok({ gain: value["gain"], completion: value["completion"] }) : invalid(`${field}.completion`)
}

const readSettingLevelFigures = (value: unknown, field: string): Result<FormulaSettingLevelFiguresDto, ApiError> => {
  if (!isBody(value)) return invalid(field, "not-json")
  if (!isSettingLevel(value["settingLevel"])) return invalid(`${field}.settingLevel`)
  if (!isPositive(value["payoutRate"])) return invalid(`${field}.payoutRate`, "not-positive")
  if (!isPositive(value["combinedOneIn"])) return invalid(`${field}.combinedOneIn`, "not-positive")
  const bonuses = Array.isArray(value["bonuses"]) ? each(value["bonuses"].map((bonus, index) => readBonus(bonus, `${field}.bonuses[${index}]`))) : invalid(`${field}.bonuses`, "missing")
  if (!bonuses.ok) return bonuses
  const at = readAt(value["at"], `${field}.at`)
  if (!at.ok) return at
  return Ok({
    settingLevel: value["settingLevel"],
    payoutRate: value["payoutRate"],
    bonuses: bonuses.value,
    combinedOneIn: value["combinedOneIn"],
    ...(at.value === undefined ? {} : { at: at.value }),
  })
}

const readFigures = (body: Body): Result<readonly FormulaSettingLevelFiguresDto[], ApiError> => {
  const figures = body["figures"]
  if (!Array.isArray(figures) || figures.length === 0) return invalid("figures", "missing")
  return each(figures.map((value, index) => readSettingLevelFigures(value, `figures[${index}]`)))
}

const readBySettingLevel = (value: unknown, field: string, accept: (value: unknown) => value is number): Result<readonly BySettingLevelDto<number>[], ApiError> => {
  if (!Array.isArray(value) || value.length === 0) return invalid(field, "missing")
  return each(
    value.map((entry, index) =>
      isBody(entry) && isSettingLevel(entry["settingLevel"]) && accept(entry["value"])
        ? Ok({ settingLevel: entry["settingLevel"], value: entry["value"] })
        : invalid(`${field}[${index}]`),
    ),
  )
}

const isBasisPoints = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000

const isRate = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0

const readConditions = (body: Body): Result<ConditionsDto, ApiError> => {
  const rate = body["payoutRate"]
  if (!isBody(rate)) return invalid("basis.conditions.payoutRate")
  if (rate["type"] === "from-spec") return Ok({ payoutRate: { type: "from-spec" } })
  if (rate["type"] !== "measured") return invalid("basis.conditions.payoutRate")
  const rates = readBySettingLevel(rate["bySettingLevel"], "basis.conditions.payoutRate.bySettingLevel", isRate)
  return rates.ok ? Ok({ payoutRate: { type: "measured", bySettingLevel: rates.value } }) : rates
}

const readSampling = (body: Body): Result<SamplingDto, ApiError> => {
  const sampling = object(body, "sampling")
  if (!sampling.ok) return sampling
  const games = sampling.value["gamesPerSettingLevel"]
  const seed = sampling.value["seed"]
  const margins = sampling.value["margins"]
  if (!isPositive(games) || !Number.isInteger(games)) return invalid("sampling.gamesPerSettingLevel", "not-positive")
  if (typeof seed !== "string" || !/^\d{1,20}$/.test(seed)) return invalid("sampling.seed")
  if (!Array.isArray(margins)) return invalid("sampling.margins", "missing")
  const read = each(
    margins.map((margin, index) =>
      isBody(margin) && isSettingLevel(margin["settingLevel"]) && typeof margin["payoutRateMargin"] === "number" && margin["payoutRateMargin"] >= 0
        ? Ok({ settingLevel: margin["settingLevel"], payoutRateMargin: margin["payoutRateMargin"] })
        : invalid(`sampling.margins[${index}]`),
    ),
  )
  return read.ok ? Ok({ gamesPerSettingLevel: games, seed, margins: read.value }) : read
}

/**
 * Whether a basis states its 機械割 — measured, or given for an AT's medals
 * to follow from — rather than leaving it to come of the 解析値.
 */
const statesRate = (spec: Body, conditions: ConditionsDto): boolean => {
  const components = spec["components"]
  const rate = isBody(components) ? components["rate"] : undefined
  return conditions.payoutRate.type === "measured" || (isBody(rate) && Object.keys(rate).length > 0)
}

/**
 * A pachislot formula body read for shape. Whether its 解析値 make sense is
 * the engine's to say. How it was made is not the sender's to say against
 * its basis: a formula whose 機械割 is stated is one typed in, and one
 * typed in states it — nothing worked out from 解析値 has a 機械割 that was
 * handed to it.
 */
export const readFormula = (body: Body): Result<SentFormula, ApiError> => {
  const head = all({ kind: oneOf(body, "kind", KINDS), basis: object(body, "basis"), derivedFrom: optionalId(body, "derivedFrom") })
  if (!head.ok) return head
  const figures = readFigures(body)
  if (!figures.ok) return figures
  const parts = all({ spec: object(head.value.basis, "spec"), conditions: object(head.value.basis, "conditions") })
  if (!parts.ok) return parts
  const conditions = readConditions(parts.value.conditions)
  if (!conditions.ok) return conditions
  if (statesRate(parts.value.spec, conditions.value) !== (head.value.kind === "manual")) return invalid("kind")
  const sampling = head.value.kind === "sampled" ? readSampling(body) : body["sampling"] === undefined ? Ok(undefined) : invalid("sampling")
  if (!sampling.ok) return sampling
  return Ok({
    kind: head.value.kind,
    figures: figures.value,
    spec: parts.value.spec,
    conditions: conditions.value,
    sampling: sampling.value,
    derivedFrom: head.value.derivedFrom,
  })
}

/** Two figures equal as the engine's own arithmetic makes them, allowing for nothing but rounding. */
const agrees = (sent: number, solved: number): boolean => Math.abs(sent - solved) <= 1e-9 * Math.max(1, Math.abs(solved))

const oneInOf = (chance: number): number => (chance > 0 ? 1 / chance : Number.POSITIVE_INFINITY)

/** A 95% margin's standard errors, five of them: how far a sampled 機械割 may stray from the exact one. */
const STRAY = 5 / 1.96

/** Whether a sent 機械割 is the solved one: exactly, or for a sampled formula within five standard errors of its own margin. */
const rateAgrees = (sent: number, solved: number, margin: number | undefined): boolean =>
  margin === undefined ? agrees(sent, solved) : Math.abs(sent - solved) <= STRAY * margin + 1e-9

/** The first figure sent that its 解析値 do not come to, named by its path. */
const disagreement = (sent: SentFormula, analysis: AnalysisDto): string | undefined => {
  if (sent.figures.length !== analysis.settingLevels.length) return "figures"
  const found = analysis.settingLevels
    .map((solved, index) => {
      const figures = sent.figures[index]
      const at = `figures[${index}]`
      if (figures === undefined || figures.settingLevel !== solved.settingLevel) return `${at}.settingLevel`
      const margin = sent.sampling?.margins.find((each) => each.settingLevel === solved.settingLevel)?.payoutRateMargin
      if (sent.kind === "sampled" && margin === undefined) return `sampling.margins`
      if (!rateAgrees(figures.payoutRate, solved.payoutRate, sent.kind === "sampled" ? margin : undefined)) return `${at}.payoutRate`
      if (figures.bonuses.length !== solved.bonuses.length) return `${at}.bonuses`
      const bonus = solved.bonuses.findIndex((bonus, place) => figures.bonuses[place]?.id !== bonus.id || !agrees(figures.bonuses[place]?.oneIn ?? 0, oneInOf(bonus.chance)))
      if (bonus >= 0) return `${at}.bonuses[${bonus}]`
      if (!agrees(figures.combinedOneIn, oneInOf(solved.combined))) return `${at}.combinedOneIn`
      if ((figures.at === undefined) !== (solved.at === undefined)) return `${at}.at`
      if (figures.at !== undefined && solved.at !== undefined && (!agrees(figures.at.gain, solved.at.gain) || !agrees(figures.at.completion, solved.at.completion)))
        return `${at}.at`
      return undefined
    })
    .find((field) => field !== undefined)
  return found
}

/**
 * A pachislot formula made ready to store. Its 解析値 are normalised here, by
 * the engine, and its figures checked against what they come to: what is
 * stored is derived from the 解析値, never taken on trust. A sampled one's
 * 機械割 cannot be sampled here, so it stands if it lies within five standard
 * errors of the exact one.
 */
export const prepareFormula = (
  sent: SentFormula,
  engine: {
    readonly normalize: (spec: unknown) => Result<NormalizedSpecDto, EngineErrorDto>
    readonly analyze: (normalized: NormalizedSpecDto, conditions: ConditionsDto) => Result<AnalysisDto, EngineErrorDto>
  },
): Result<PreparedFormula, ApiError> => {
  const normalized = engine.normalize(sent.spec)
  if (!normalized.ok) return Err({ type: "basis-rejected", error: normalized.error })
  const exact: ConditionsDto = sent.kind === "sampled" ? { payoutRate: { type: "from-spec" } } : sent.conditions
  const analysis = engine.analyze(normalized.value, exact)
  if (!analysis.ok) return Err({ type: "basis-rejected", error: analysis.error })
  const field = disagreement(sent, analysis.value)
  return field === undefined
    ? Ok({ ...sent, normalized: normalized.value, engineSchemaVersion: normalized.value.schemaVersion })
    : Err({ type: "figures-disagree-with-basis", field })
}

/** The spec of a pachislot formula, as stored and served. */
export const specOf = (sent: SentFormula): SpecDto => sent.spec as unknown as SpecDto

/** A 設定配分 as sent, checked: a decent label, and each setting level once, the shares summing to the whole. */
export const readDistribution = (body: Body): Result<NewSettingDistributionDto, ApiError> => {
  const head = all({ label: decentName(body, "label"), derivedFrom: optionalId(body, "derivedFrom") })
  if (!head.ok) return head
  const shares = readBySettingLevel(body["shares"], "shares", isBasisPoints)
  if (!shares.ok) return shares
  const levels = shares.value.map((share) => share.settingLevel)
  if (new Set(levels).size !== levels.length) return invalid("shares")
  if (shares.value.reduce((sum, share) => sum + share.value, 0) !== 10_000) return invalid("shares")
  return Ok({ label: head.value.label, shares: shares.value, ...(head.value.derivedFrom === undefined ? {} : { derivedFrom: head.value.derivedFrom }) })
}
