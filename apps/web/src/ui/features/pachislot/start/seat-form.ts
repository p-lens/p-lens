import { seatCheckpoint } from "../../../../core/pachislot/reading"
import { atSeatCheckpoint } from "../../../../core/pachislot/path"
import type { Checkpoint, Counts } from "../../../../core/play-log/checkpoint"
import { Err, Ok, type Result } from "../../../../core/result/result"
import { tidyTyped } from "../../../../core/text/tidy"

/** The data counter as it was found at the seat, read as counts. */
export interface Seat {
  readonly total: number
  readonly bonuses: Counts
  readonly sinceBonus: number
  /** None when left empty: no CZ since the last AT. */
  readonly sinceCz: number | undefined
  readonly misses: number
  /** What the 有利区間 held at the end of the last AT, where it still carries on; none when left empty. */
  readonly held: number | undefined
  /** The games since the AT itself across the bonuses that started the counter again; none when left empty: no such bonus since. */
  readonly sinceAtAcrossBonuses: number | undefined
}

/**
 * The seat's counter as typed: the day's games, each bonus by its id, the
 * games since the last bonus — the last AT, on an AT machine — and on one a
 * CZ brings, the games since the last CZ and the CZs missed since the AT;
 * and on one whose AT間天井 counts across the bonuses that start the counter
 * again, the games since the AT itself.
 */
export interface SeatForm {
  readonly total: string
  readonly bonuses: Readonly<Record<string, string>>
  readonly sinceBonus: string
  readonly sinceCz: string
  readonly misses: string
  readonly held: string
  readonly sinceAtAcrossBonuses: string
}

/**
 * A field of the seat's counter that cannot be read: not a whole count, a
 * bonus left empty on a counter that has played games — no bonus in two
 * thousand games is something a counter says, not something to assume —
 * or the games since the AT itself fewer than those since the last bonus,
 * which they run on from.
 */
export interface SeatProblem {
  readonly field: "total" | "sinceBonus" | "sinceCz" | "misses" | "held" | "sinceAtAcrossBonuses" | { readonly bonus: string }
  readonly reason: "not-a-count" | "required" | "below-since-bonus"
}

const COUNT = /^\d+$/

const plainOf = (text: string): string => tidyTyped(text).replaceAll(",", "")

/** A count as typed: empty is none, anything but a whole number is not one. */
export const seatCountOf = (text: string): number | undefined => {
  const plain = plainOf(text)
  return plain === "" ? 0 : COUNT.test(plain) ? Number(plain) : undefined
}

/**
 * A play's first line from the seat's counter: an AT machine's, from the
 * games since its last AT and whether its settings were changed; any other's,
 * from the day's games and bonuses.
 */
export const seatLineOf = (atMachine: boolean, seat: Seat, afterReset: boolean, at: string): Checkpoint =>
  atMachine ? atSeatCheckpoint({ sinceAt: seat.sinceBonus, sinceCz: seat.sinceCz, misses: seat.misses, afterReset, held: seat.held, sinceAtAcrossBonuses: seat.sinceAtAcrossBonuses }, at) : seatCheckpoint(seat, at)

/** The seat's counter read, the bonuses being those the formula's counter shows; or every field that cannot be. */
export const readSeat = (form: SeatForm, bonusIds: readonly string[]): Result<Seat, readonly SeatProblem[]> => {
  const total = seatCountOf(form.total)
  const sinceBonus = seatCountOf(form.sinceBonus)
  const sinceCz = plainOf(form.sinceCz) === "" ? undefined : seatCountOf(form.sinceCz)
  const misses = seatCountOf(form.misses)
  const held = plainOf(form.held) === "" ? undefined : seatCountOf(form.held)
  const sinceAtAcrossBonuses = plainOf(form.sinceAtAcrossBonuses) === "" ? undefined : seatCountOf(form.sinceAtAcrossBonuses)
  const bonuses = bonusIds.map((id) => ({ id, text: form.bonuses[id] ?? "", count: seatCountOf(form.bonuses[id] ?? "") }))
  const problems: readonly SeatProblem[] = [
    ...(total === undefined ? [{ field: "total", reason: "not-a-count" } as const] : []),
    ...(sinceBonus === undefined ? [{ field: "sinceBonus", reason: "not-a-count" } as const] : []),
    ...(plainOf(form.sinceCz) !== "" && sinceCz === undefined ? [{ field: "sinceCz", reason: "not-a-count" } as const] : []),
    ...(misses === undefined ? [{ field: "misses", reason: "not-a-count" } as const] : []),
    ...(plainOf(form.held) !== "" && held === undefined ? [{ field: "held", reason: "not-a-count" } as const] : []),
    ...(plainOf(form.sinceAtAcrossBonuses) !== "" && sinceAtAcrossBonuses === undefined ? [{ field: "sinceAtAcrossBonuses", reason: "not-a-count" } as const] : []),
    ...(sinceAtAcrossBonuses !== undefined && sinceBonus !== undefined && sinceAtAcrossBonuses < sinceBonus ? [{ field: "sinceAtAcrossBonuses", reason: "below-since-bonus" } as const] : []),
    ...bonuses.flatMap((bonus): readonly SeatProblem[] =>
      bonus.count === undefined
        ? [{ field: { bonus: bonus.id }, reason: "not-a-count" }]
        : plainOf(bonus.text) === "" && (total ?? 0) > 0
          ? [{ field: { bonus: bonus.id }, reason: "required" }]
          : [],
    ),
  ]
  if (problems.length > 0 || total === undefined || sinceBonus === undefined || misses === undefined) return Err(problems)
  return Ok({ total, sinceBonus, sinceCz, misses, held, sinceAtAcrossBonuses, bonuses: Object.fromEntries(bonuses.map((bonus) => [bonus.id, bonus.count ?? 0])) })
}
