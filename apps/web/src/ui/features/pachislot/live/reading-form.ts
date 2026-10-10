import type { Tally } from "../../../../core/play-log/checkpoint"
import { Err, Ok, type Result } from "../../../../core/result/result"
import { tidyTyped } from "../../../../core/text/tidy"

/** A pachislot data counter's reading as typed: the day's games, each bonus by its id, and the outlay so far. */
export interface ReadingForm {
  readonly total: string
  readonly bonuses: Readonly<Record<string, string>>
  readonly outlay: string
}

/** Where a play stands as its counter should now show it: the day's games, each bonus, and the outlay where one was given. */
export interface Standing {
  readonly total: number
  readonly bonuses: Tally
  readonly outlay: number | undefined
}

const typedYen = (yen: number | undefined): string => (yen === undefined || yen === 0 ? "" : String(yen))

/** The form a reading is typed into: where the play stands, to be typed over. */
export const readingFrom = (standing: Standing, bonusIds: readonly string[]): ReadingForm => ({
  total: String(standing.total),
  bonuses: Object.fromEntries(bonusIds.map((id) => [id, String(standing.bonuses[id] ?? 0)])),
  outlay: typedYen(standing.outlay),
})

export type ReadingField = "total" | "outlay" | { readonly bonus: string }

export interface ReadingProblem {
  readonly field: ReadingField
  readonly reason: "required" | "not-a-count"
}

/** The reading as counts. Every bonus the counter shows is in it. */
export interface Reading {
  readonly total: number
  readonly bonuses: Tally
  readonly outlay: number | undefined
}

const COUNT = /^\d+$/

type Read = { readonly type: "empty" } | { readonly type: "count"; readonly count: number } | { readonly type: "not-a-count" }

const readText = (text: string): Read => {
  const plain = tidyTyped(text).replaceAll(",", "")
  return plain === "" ? { type: "empty" } : COUNT.test(plain) ? { type: "count", count: Number(plain) } : { type: "not-a-count" }
}

/**
 * The form read as counts, or every field that cannot be. The day's games are
 * required. A bonus left empty is as the log already knows it — the field
 * shows that count, waiting — and an outlay left empty was not read.
 */
export const readReadingForm = (form: ReadingForm, known: Tally, bonusIds: readonly string[]): Result<Reading, readonly ReadingProblem[]> => {
  const total = readText(form.total)
  const outlay = readText(form.outlay)
  const bonuses = bonusIds.map((id) => ({ id, read: readText(form.bonuses[id] ?? "") }))
  const problems: readonly ReadingProblem[] = [
    ...(total.type === "count" ? [] : [{ field: "total", reason: total.type === "empty" ? "required" : "not-a-count" } as const]),
    ...(outlay.type === "not-a-count" ? [{ field: "outlay", reason: "not-a-count" } as const] : []),
    ...bonuses.flatMap((bonus): readonly ReadingProblem[] => (bonus.read.type === "not-a-count" ? [{ field: { bonus: bonus.id }, reason: "not-a-count" }] : [])),
  ]
  if (problems.length > 0 || total.type !== "count") return Err(problems)
  return Ok({
    total: total.count,
    outlay: outlay.type === "count" ? outlay.count : undefined,
    bonuses: Object.fromEntries(bonuses.map((bonus) => [bonus.id, bonus.read.type === "count" ? bonus.read.count : (known[bonus.id] ?? 0)])),
  })
}
