import type { Counts } from "../../../../core/play-log/checkpoint"
import { Err, Ok, type Result } from "../../../../core/result/result"
import { tidyTyped } from "../../../../core/text/tidy"

/**
 * A pachislot data counter's reading as typed: the day's games, each bonus
 * by its id, the outlay and the medals drawn from savings so far, and the
 * medals in hand. `heldCarried` says the medals in hand shown are the last
 * count carried over and not counted again: they are then not this
 * reading's to say.
 */
export interface ReadingForm {
  readonly total: string
  readonly bonuses: Readonly<Record<string, string>>
  readonly outlay: string
  readonly replay: string
  readonly held: string
  readonly heldCarried: boolean
}

/** Where a play stands as its counter should now show it: the day's games, each bonus, the outlay and the medals drawn from savings, and the medals in hand as last counted, each where it was given. */
export interface Standing {
  readonly total: number
  readonly bonuses: Counts
  readonly outlay: number | undefined
  readonly replay: number | undefined
  readonly held: number | undefined
}

const typedCount = (count: number | undefined): string => (count === undefined || count === 0 ? "" : String(count))

/** The form a reading is typed into: where the play stands, to be typed over, the medals in hand as last counted carried over until counted again. */
export const readingFrom = (standing: Standing, bonusIds: readonly string[]): ReadingForm => ({
  total: String(standing.total),
  bonuses: Object.fromEntries(bonusIds.map((id) => [id, String(standing.bonuses[id] ?? 0)])),
  outlay: typedCount(standing.outlay),
  replay: typedCount(standing.replay),
  held: standing.held === undefined ? "" : String(standing.held),
  heldCarried: standing.held !== undefined,
})

export type ReadingField = "total" | "outlay" | "replay" | "held" | { readonly bonus: string }

export interface ReadingProblem {
  readonly field: ReadingField
  readonly reason: "required" | "not-a-count"
}

/** The reading as counts. Every bonus the counter shows is in it. */
export interface Reading {
  readonly total: number
  readonly bonuses: Counts
  readonly outlay: number | undefined
  readonly replay: number | undefined
  readonly held: number | undefined
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
 * shows that count, waiting — and an outlay, a draw on savings or the medals in hand left empty was not read, nor medals in hand carried over and not counted again.
 */
export const readReadingForm = (form: ReadingForm, known: Counts, bonusIds: readonly string[]): Result<Reading, readonly ReadingProblem[]> => {
  const total = readText(form.total)
  const outlay = readText(form.outlay)
  const replay = readText(form.replay)
  const held = form.heldCarried ? ({ type: "empty" } as const) : readText(form.held)
  const bonuses = bonusIds.map((id) => ({ id, read: readText(form.bonuses[id] ?? "") }))
  const problems: readonly ReadingProblem[] = [
    ...(total.type === "count" ? [] : [{ field: "total", reason: total.type === "empty" ? "required" : "not-a-count" } as const]),
    ...(outlay.type === "not-a-count" ? [{ field: "outlay", reason: "not-a-count" } as const] : []),
    ...(replay.type === "not-a-count" ? [{ field: "replay", reason: "not-a-count" } as const] : []),
    ...(held.type === "not-a-count" ? [{ field: "held", reason: "not-a-count" } as const] : []),
    ...bonuses.flatMap((bonus): readonly ReadingProblem[] => (bonus.read.type === "not-a-count" ? [{ field: { bonus: bonus.id }, reason: "not-a-count" }] : [])),
  ]
  if (problems.length > 0 || total.type !== "count") return Err(problems)
  return Ok({
    total: total.count,
    outlay: outlay.type === "count" ? outlay.count : undefined,
    replay: replay.type === "count" ? replay.count : undefined,
    held: held.type === "count" ? held.count : undefined,
    bonuses: Object.fromEntries(bonuses.map((bonus) => [bonus.id, bonus.read.type === "count" ? bonus.read.count : (known[bonus.id] ?? 0)])),
  })
}
