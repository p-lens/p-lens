import { comparableName, isHitChanceText, keptName, MACHINE_BONUSES, MACHINE_KEYWORDS, type MachineBonusDto, releaseDateProblem } from "@p-lens/contracts"
import { isUuidV7, type UuidV7 } from "@p-lens/uuidv7"

import type { ApiError } from "./errors"
import { holdsForbiddenWord } from "./forbidden-words"
import { Err, Ok, type Result } from "./result"

/** A request body as received: anything at all until checked. */
export type Body = Readonly<Record<string, unknown>>

export const isBody = (value: unknown): value is Body => typeof value === "object" && value !== null && !Array.isArray(value)

const LONGEST_TEXT = 200

const invalid = (field: string, reason: Extract<ApiError, { type: "invalid-body" }>["reason"]): Result<never, ApiError> =>
  Err({ type: "invalid-body", field, reason })

/** Required text, trimmed, not empty, not unreasonably long. */
export const text = (body: Body, field: string): Result<string, ApiError> => {
  const value = body[field]
  if (value === undefined) return invalid(field, "missing")
  if (typeof value !== "string") return invalid(field, "not-text")
  const trimmed = value.trim()
  if (trimmed === "") return invalid(field, "missing")
  return trimmed.length > LONGEST_TEXT ? invalid(field, "too-long") : Ok(trimmed)
}

/** A name others will see: required text, as `text`, that neither is nor has as a word of its own a forbidden word. */
export const decentName = (body: Body, field: string): Result<string, ApiError> => {
  const read = text(body, field)
  return read.ok && holdsForbiddenWord(read.value) ? invalid(field, "forbidden") : read
}

/** A machine's name: one others will see, kept as every machine's is (`keptName`) however it was sent. */
export const machineName = (body: Body, field: string): Result<string, ApiError> => {
  const read = decentName(body, field)
  return read.ok ? Ok(keptName(read.value)) : read
}

/** A name others will see, or none where the field is left out or left empty. */
export const optionalDecentName = (body: Body, field: string): Result<string | undefined, ApiError> => {
  const value = body[field]
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "") ? Ok(undefined) : decentName(body, field)
}

/** A machine's model name, or none where it is left out or left empty: decent, and written as a machine's name is kept. */
export const optionalModelName = (body: Body, field: string): Result<string | undefined, ApiError> => {
  const read = optionalDecentName(body, field)
  return read.ok && read.value !== undefined ? Ok(keptName(read.value)) : read
}

/** A 大当り確率 as a spec sheet writes it, `1/319.7`, or none where the field is left out or left empty. */
export const optionalHitChance = (body: Body, field: string): Result<string | undefined, ApiError> => {
  const value = body[field]
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return Ok(undefined)
  if (typeof value !== "string") return invalid(field, "not-text")
  const written = value.normalize("NFKC").replace(/\s/g, "")
  return isHitChanceText(written) ? Ok(written) : invalid(field, "not-a-chance")
}

const keywordOf = (value: unknown, field: string): Result<string, ApiError> => {
  if (typeof value !== "string") return invalid(field, "not-text")
  const trimmed = value.trim()
  if (trimmed === "") return invalid(field, "missing")
  if ([...trimmed].length > MACHINE_KEYWORDS.length) return invalid(field, "too-long")
  return holdsForbiddenWord(trimmed) ? invalid(field, "forbidden") : Ok(trimmed)
}

/**
 * The words a machine is searched by: none where the field is left out, and
 * otherwise a list of short decent words, each once however it is written.
 */
export const keywords = (body: Body, field: string): Result<readonly string[], ApiError> => {
  const value = body[field]
  if (value === undefined || value === null) return Ok([])
  if (!Array.isArray(value)) return invalid(field, "not-a-list")
  const read = value.map((each) => keywordOf(each, field))
  const failed = read.find((each) => !each.ok)
  if (failed !== undefined && !failed.ok) return failed
  const words = read.flatMap((each) => (each.ok ? [each.value] : []))
  const once = words.filter((word, index) => words.findIndex((other) => comparableName(other) === comparableName(word)) === index)
  return once.length > MACHINE_KEYWORDS.count ? invalid(field, "too-many") : Ok(once)
}

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0

const bonusOf = (value: unknown, field: string): Result<MachineBonusDto, ApiError> => {
  if (!isBody(value)) return invalid(field, "not-json")
  const { name, payout, spent } = value
  if (typeof name !== "string" || name.trim() === "") return invalid(field, "missing")
  if ([...name.trim()].length > MACHINE_BONUSES.nameLength) return invalid(field, "too-long")
  if (holdsForbiddenWord(name.trim())) return invalid(field, "forbidden")
  if (!isCount(payout) || !isCount(spent) || payout === 0 || payout > MACHINE_BONUSES.payout || spent > payout) return invalid(field, "not-positive")
  return Ok({ name: name.trim(), payout, spent })
}

/**
 * A formula's bonuses: none where the field is left out, and otherwise a
 * list of named bonuses, none paying out less than is shot to get it, no
 * two under one name.
 */
export const bonuses = (body: Body, field: string): Result<readonly MachineBonusDto[], ApiError> => {
  const value = body[field]
  if (value === undefined || value === null) return Ok([])
  if (!Array.isArray(value)) return invalid(field, "not-a-list")
  if (value.length > MACHINE_BONUSES.count) return invalid(field, "too-many")
  const read = value.map((each) => bonusOf(each, field))
  const failed = read.find((each) => !each.ok)
  if (failed !== undefined && !failed.ok) return failed
  const listed = read.flatMap((each) => (each.ok ? [each.value] : []))
  const twice = listed.some((bonus, index) => listed.findIndex((other) => comparableName(other.name) === comparableName(bonus.name)) !== index)
  return twice ? invalid(field, "unknown-value") : Ok(listed)
}

export const id = (body: Body, field: string): Result<UuidV7, ApiError> => {
  const value = body[field]
  if (value === undefined) return invalid(field, "missing")
  return typeof value === "string" && isUuidV7(value) ? Ok(value) : invalid(field, "not-an-id")
}

/** A calendar day written YYYY-MM-DD, and one the calendar has: 2026-02-30 is not. */
export const day = (body: Body, field: string): Result<string, ApiError> => {
  const value = body[field]
  if (value === undefined || (typeof value === "string" && value.trim() === "")) return invalid(field, "missing")
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid(field, "not-a-date")
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? Ok(value) : invalid(field, "not-a-date")
}

/** A machine's release date: a calendar day, neither before machines nor further ahead of today than one is ever announced. */
export const releaseDay = (body: Body, field: string, today: string): Result<string, ApiError> => {
  const read = day(body, field)
  if (!read.ok) return read
  const problem = releaseDateProblem(read.value, today)
  return problem === undefined ? read : invalid(field, problem)
}

/** A nested JSON object the engine or a later reader will judge; here only that it is one. */
export const object = (body: Body, field: string): Result<Body, ApiError> => {
  const value = body[field]
  if (value === undefined) return invalid(field, "missing")
  return isBody(value) ? Ok(value) : invalid(field, "not-json")
}

/** A number above zero, or absent where `optional`. */
export const positive = (body: Body, field: string): Result<number, ApiError> => {
  const value = body[field]
  if (value === undefined) return invalid(field, "missing")
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Ok(value) : invalid(field, "not-positive")
}

export const optionalPositive = (body: Body, field: string): Result<number | undefined, ApiError> =>
  body[field] === undefined || body[field] === null ? Ok(undefined) : positive(body, field)

export const optionalId = (body: Body, field: string): Result<UuidV7 | undefined, ApiError> =>
  body[field] === undefined || body[field] === null ? Ok(undefined) : id(body, field)

export const oneOf = <T extends string>(body: Body, field: string, allowed: readonly T[]): Result<T, ApiError> => {
  const value = body[field]
  if (value === undefined) return invalid(field, "missing")
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? Ok(value as T) : invalid(field, "unknown-value")
}

/** Several fields read together: every value, or the first field that failed. */
export const all = <T extends Readonly<Record<string, Result<unknown, ApiError>>>>(
  fields: T,
): Result<{ readonly [K in keyof T]: T[K] extends Result<infer V, ApiError> ? V : never }, ApiError> => {
  const failed = Object.values(fields).find((field) => !field.ok)
  if (failed !== undefined && !failed.ok) return failed
  return Ok(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.ok ? field.value : undefined])) as never)
}
