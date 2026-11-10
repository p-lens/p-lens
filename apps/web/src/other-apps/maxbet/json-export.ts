import { toPlainString } from "../../core/decimal/decimal"
import type { PlayId } from "../../core/play/play"
import type { TallyLine } from "../../core/report/tally-line"
import { wholeSidesOf } from "../core/whole-sides"

const FNV_OFFSET = 0xcbf29ce484222325n

const FNV_PRIME = 0x100000001b3n

const WORD = (1n << 64n) - 1n

/** A text as sixteen hex digits that the same text always gives: FNV-1a, 64 bits, over its code points. */
const digest = (text: string): string =>
  [...text]
    .reduce((hash, character) => ((hash ^ BigInt(character.codePointAt(0) ?? 0)) * FNV_PRIME) & WORD, FNV_OFFSET)
    .toString(16)
    .padStart(16, "0")

/**
 * A UUID that the same text always gives, in capitals as MAXBET writes its
 * own: two digests of it, the second salted, laid out as a UUID of version
 * 8 (RFC 9562, made as its maker chooses). A tally written out again keeps
 * its id.
 */
const uuidOf = (text: string): string => {
  const hex = `${digest(text)}${digest(`\u0000${text}`)}`
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`.toUpperCase()
}

/** A moment as MAXBET writes it, in UTC to the second: `2026-11-10T10:06:47Z`. */
const momentOf = (time: number): string => `${new Date(time).toISOString().slice(0, 19)}Z`

/** Japan's hours ahead of UTC, in milliseconds: MAXBET keeps a day as its midnight there. */
const JAPAN_AHEAD = 9 * 60 * 60 * 1000

/** A tally's day as MAXBET keeps one, its midnight in Japan in UTC: the 4th is `2026-11-03T15:00:00Z`. */
const dayOf = (line: TallyLine): string => momentOf(Date.parse(`${line.tally.date}T00:00:00Z`) - JAPAN_AHEAD)

/**
 * Tallies as MAXBET's backup, a JSON list of its records in the order
 * given, for MAXBET to take in: each in yen with its day, its notes as its
 * memo (`tallyNotesIn`), never its description, and the moment it is
 * written as its last change, under an id its tally always gives. It
 * carries no tags, not even its game's: MAXBET knows a tag by an id of its
 * own, which nothing here can know, and one made up would stand beside
 * MAXBET's of the same title. MAXBET keeps no parlor, machine or hours,
 * and they are left out.
 */
export const maxbetJsonOf = (lines: readonly TallyLine[], notes: ReadonlyMap<PlayId, string>, now: number): string =>
  JSON.stringify(
    lines.map((line) => {
      const sides = wholeSidesOf(line)
      return {
        id: uuidOf(line.tally.id),
        modification_date: momentOf(now),
        tags: [],
        memo: notes.get(line.tally.id) ?? "",
        revenue: Number(toPlainString(sides.takings)),
        expense: Number(toPlainString(sides.outlay)),
        date: dayOf(line),
      }
    }),
  )
