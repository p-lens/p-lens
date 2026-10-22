import type { Play } from "../live-play/draft-reading"
import type { HuddlePlay } from "./post"
import { parsePlayLog, type Checkpoint } from "../play-log/checkpoint"
import { inPlayOrder } from "../play-log/performance"

/**
 * Where one of the others' plays stands, as its log last says: over, in a
 * jackpot — an AT won, on a pachislot AT machine — in 時短, or being
 * played. 確変 is not said: nobody counts it.
 */
export type HuddleStanding = "finished" | "jackpot" | "rapid" | "playing"

export const huddleStandingOf = (play: Play): HuddleStanding => {
  const read = parsePlayLog(play.log)
  if (!read.ok) return "playing"
  if (read.value.some((checkpoint) => checkpoint.event?.kind === "finished")) return "finished"
  const last = inPlayOrder(read.value).at(-1)
  if (last?.event?.kind === "jackpot") return "jackpot"
  return play.gameKind === "pachinko" && last?.phase === "rapid" ? "rapid" : "playing"
}

/** Whether a reading was of regular games: no jackpot or other event on it, and, on a pachinko play, not in 時短 or 確変. */
const isRegular = (checkpoint: Checkpoint): boolean => checkpoint.event === undefined && (checkpoint.phase === undefined || checkpoint.phase === "regular")

/**
 * How many jackpots one of the others' plays has won in a row: those since
 * its last reading of regular games, however many readings in 時短 came
 * between them, each counted as the jackpots it was won over — the 連チャン
 * a parlor's counter shows. Nought where none followed it.
 */
export const jackpotStreakOf = (play: Play): number => {
  const read = parsePlayLog(play.log)
  if (!read.ok) return 0
  const ordered = inPlayOrder(read.value)
  const since = ordered.findLastIndex(isRegular)
  return ordered.slice(since + 1).reduce((count, checkpoint) => (checkpoint.event?.kind === "jackpot" ? count + (checkpoint.event.bonus?.jackpots ?? 1) : count), 0)
}

/** The others' plays in a jackpot: each the one its player is on, while they are still in the huddle. */
const inJackpot = (plays: readonly HuddlePlay[]): readonly HuddlePlay[] => plays.filter((shown) => shown.latest && !shown.departed && huddleStandingOf(shown.post.play) === "jackpot")

/** How many of the others are in a jackpot now: what the room wears on the rail. */
export const othersInJackpot = (plays: readonly HuddlePlay[]): number => inJackpot(plays).length

/**
 * Who of the others still in the huddle is in a jackpot on the play they
 * are on, as one word —
 * each one's member and play, in order — the same for the same people in
 * the same jackpots: it changes as one of them wins one, or one's ends,
 * and not while one goes on.
 */
export const jackpotsNow = (plays: readonly HuddlePlay[]): string =>
  inJackpot(plays)
    .map((shown) => `${shown.post.member} ${shown.post.play.id}`)
    .toSorted()
    .join("\n")

/**
 * How the huddle's game turned between who was in a jackpot and who is
 * now: one won one — from regular games, or one more beside another's —
 * or only ones that went on ended; nothing where it did not turn.
 */
export type HuddleTurn = "won" | "ended"

const rosterOf = (jackpots: string): ReadonlySet<string> => new Set(jackpots === "" ? [] : jackpots.split("\n"))

export const huddleTurnOf = (before: string, now: string): HuddleTurn | undefined => {
  if (before === now) return undefined
  const was = rosterOf(before)
  return [...rosterOf(now)].some((who) => !was.has(who)) ? "won" : "ended"
}

/** A turn seen on top of one not yet looked at: a jackpot won stays the louder until the list is looked at. */
export const louderTurn = (so: HuddleTurn | undefined, now: HuddleTurn | undefined): HuddleTurn | undefined => (so === "won" || now === "won" ? "won" : (now ?? so))
