import type { IsoDate } from "../../core/calendar/calendar"
import type { Decimal } from "../../core/decimal/decimal"
import type { PlayGameKind } from "../../core/play/play"
import { Err, Ok, type Result } from "../../core/result/result"
import type { ReadingProblem } from "../core/reading-problem"
import type { SourceTally } from "../core/source-tally"

/** MAXBET, as an imported tally says where it came from. */
export const MAXBET = "maxbet"

/**
 * Why a file is not taken in.
 *
 * - `not-maxbet`: it is not MAXBET's backup, or not a CSV whose first row names the columns a tally needs.
 * - `records-unreadable`: these records of a backup, by their place in it, lack what a tally needs.
 * - `no-plays`: every tally it holds is tagged as something other than play, so many of them.
 */
export type MaxbetProblem =
  | { readonly type: "not-maxbet" }
  | { readonly type: "records-unreadable"; readonly records: readonly number[] }
  | { readonly type: "no-plays"; readonly count: number }
  | ReadingProblem

/**
 * The tags MAXBET has from the start that say a tally's game. MAXBET
 * itself knows no game: a tally says one only where it carries one of
 * these alone.
 */
const GAME_TAGS: Readonly<Record<string, PlayGameKind>> = { パチンコ: "pachinko", パチスロ: "pachislot" }

/** The tags MAXBET has from the start that say a tally is of something other than play: stocks, FX, horse racing and boat racing. */
const OTHER_TAGS: ReadonlySet<string> = new Set(["株", "FX", "競馬", "競艇"])

/** A tally as a MAXBET file has it, with its tags, before those of something other than play are left out. */
export interface Tagged {
  readonly tally: SourceTally
  readonly tags: readonly string[]
}

/** The game a tally's tags say, where they say one alone. */
const gameOf = (tags: readonly string[]): PlayGameKind | undefined =>
  ((games) => (games.size === 1 ? [...games][0] : undefined))(new Set(tags.flatMap((tag) => ((game) => (game === undefined ? [] : [game]))(GAME_TAGS[tag]))))

/** Whether a tally's tags say it is of something other than play: one of those tags, and neither game's. */
const isOtherThanPlay = (tags: readonly string[]): boolean => tags.some((tag) => OTHER_TAGS.has(tag)) && !tags.some((tag) => GAME_TAGS[tag] !== undefined)

export const taggedOf = (date: IsoDate, outlay: Decimal, takings: Decimal, tags: readonly string[], memo: string): Tagged => ({
  tags,
  tally: {
    date,
    parlor: { name: "", code: "" },
    machine: { name: "", code: "", maker: "" },
    cabinetNumber: "",
    outlay,
    takings,
    memo: memo.trim(),
    hours: undefined,
    clock: undefined,
    theoreticalValue: undefined,
    gameKind: gameOf(tags),
    countedSpins: undefined,
    countedJackpots: undefined,
    sourceLabels: tags.filter((tag) => GAME_TAGS[tag] === undefined),
  },
})

/** A MAXBET file's tallies of play, in the file's order, and how many it holds of something other than play, which are not taken in. */
export interface MaxbetTallies {
  readonly tallies: readonly SourceTally[]
  readonly otherThanPlay: number
}

/** A file's tallies with those of something other than play left out and counted; none to take in, where every one is. */
export const playsOf = (read: readonly Tagged[]): Result<MaxbetTallies, MaxbetProblem> => {
  const tallies = read.filter((each) => !isOtherThanPlay(each.tags)).map((each) => each.tally)
  const otherThanPlay = read.length - tallies.length
  return tallies.length === 0 ? Err({ type: "no-plays", count: otherThanPlay }) : Ok({ tallies, otherThanPlay })
}
