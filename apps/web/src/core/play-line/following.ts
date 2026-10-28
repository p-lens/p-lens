import type { BookId } from "../book/book"
import type { IsoDate } from "../calendar/calendar"
import { logLinesOf } from "../live-play/draft"
import type { PlayId } from "../play/play"
import type { DeviceId } from "./device"
import type { ShownPlay } from "./entry"
import type { LineEntry, Placed } from "./showing"

/** Which line: a book's plays on one business day. */
export interface LineOf {
  readonly bookId: BookId
  readonly day: IsoDate
}

/** A line as read: what is on it, each entry at the place the relay gave it, a patch taken as the play it makes. */
export interface ReadLine extends LineOf {
  readonly entries: readonly Placed<LineEntry>[]
}

/**
 * How a play stands by its lines: held by one device, as it last showed
 * it — none where it has claimed the play and shown it nowhere since —
 * or taken off a book, deleted or recorded into another. Each is on the
 * line it was last said on, and at the handover the play was at then.
 */
export type PlayStanding =
  | { readonly type: "held"; readonly by: DeviceId; readonly handovers: number; readonly play: ShownPlay | undefined; readonly shownAt: string | undefined; readonly line: LineOf }
  | { readonly type: "gone"; readonly reason: "withdrawn" | "moved"; readonly handovers: number; readonly line: LineOf }

/**
 * A play another device holds, as this one keeps a copy of it: as it was
 * last shown, by whom and when, and on which line.
 */
export interface Followed {
  readonly id: PlayId
  readonly play: ShownPlay
  readonly holder: DeviceId
  readonly shownAt: string
  readonly line: LineOf
}

/** What one book's lines have said of a play so far: who holds it, at which handover, as they last showed it, and whether they took it off the book. */
interface Folded {
  readonly holder: DeviceId | undefined
  readonly handovers: number
  readonly standing: PlayStanding | undefined
}

const NOTHING_SAID: Folded = { holder: undefined, handovers: 0, standing: undefined }

const playIdOf = (entry: LineEntry): PlayId => (entry.type === "shown" || entry.type === "patched" ? entry.play.id : entry.playId)

/** How many times a play shown had been continued on another device when it was shown: none where it never had. */
export const handoversOf = (play: Pick<ShownPlay, "handovers">): number => play.handovers ?? 0

const heldBy = (by: DeviceId, handovers: number, line: LineOf, standing: PlayStanding | undefined): PlayStanding =>
  standing?.type === "held" ? { ...standing, by, handovers, line } : { type: "held", by, handovers, play: undefined, shownAt: undefined, line }

/**
 * Whether a device showing a play at a handover holds it: the first to
 * show it, where nothing was said of it before; any that shows it at a
 * later handover than the lines have seen, having been given it by a claim
 * on a line not read here; or the holder, at the handover it holds it at.
 */
const holdsAt = (so: Folded, by: DeviceId, handovers: number): boolean =>
  so.holder === undefined || handovers > so.handovers || (handovers === so.handovers && by === so.holder)

/**
 * One entry taken into what a book's lines say of its play. A claim
 * counts unless the play was claimed at a later handover already, the
 * later claim over the earlier. A play shown, whole or patched, counts
 * only from the device holding it at the handover it was shown at, or a
 * later one. Anything else counts only from the play's holder at that
 * point.
 */
const folded = (so: Folded, entry: LineEntry, line: LineOf): Folded => {
  if (entry.type === "claimed") return entry.handovers < so.handovers ? so : { holder: entry.by, handovers: entry.handovers, standing: heldBy(entry.by, entry.handovers, line, so.standing) }
  if (entry.type === "shown" || entry.type === "patched") {
    const handovers = handoversOf(entry.play)
    return holdsAt(so, entry.by, handovers) ? { holder: entry.by, handovers, standing: { type: "held", by: entry.by, handovers, play: entry.play, shownAt: entry.at, line } } : so
  }
  return so.holder === entry.by ? { ...so, standing: { type: "gone", reason: entry.type, handovers: so.handovers, line } } : so
}

const inOrder = (lines: readonly ReadLine[]): readonly { readonly line: LineOf; readonly entry: LineEntry }[] =>
  lines
    .toSorted((one, other) => one.day.localeCompare(other.day))
    .flatMap((line) => line.entries.toSorted((one, other) => one.seq - other.seq).map(({ entry }) => ({ line: { bookId: line.bookId, day: line.day }, entry })))

/** What one book's lines say of each play, read as one: day by day, and in each day in the order the relay put them. */
const standingsOnBook = (lines: readonly ReadLine[]): ReadonlyMap<PlayId, PlayStanding> => {
  const all = inOrder(lines).reduce((found, { line, entry }) => new Map(found).set(playIdOf(entry), folded(found.get(playIdOf(entry)) ?? NOTHING_SAID, entry, line)), new Map<PlayId, Folded>())
  return new Map([...all].flatMap(([id, { standing }]) => (standing === undefined ? [] : [[id, standing] as const])))
}

/**
 * Of a play's standings on two books, the one at the later handover: a
 * claim on one book outranks a showing on another at the handover it
 * took the play from, whatever the clocks say. At the same handover, the
 * one said on the later day; on the same day a play held stands over one
 * taken off a book — it was moved to where it is held — and of two held,
 * the one shown later, then the book first by its id, so that every
 * device settles on the same.
 */
const later = (one: PlayStanding, other: PlayStanding): PlayStanding => {
  if (one.handovers !== other.handovers) return one.handovers > other.handovers ? one : other
  const byDay = one.line.day.localeCompare(other.line.day)
  if (byDay !== 0) return byDay > 0 ? one : other
  if (one.type !== other.type) return one.type === "held" ? one : other
  const shown = (one.type === "held" ? (one.shownAt ?? "") : "").localeCompare(other.type === "held" ? (other.shownAt ?? "") : "")
  if (shown !== 0) return shown > 0 ? one : other
  return one.line.bookId <= other.line.bookId ? one : other
}

const byBook = (lines: readonly ReadLine[]): readonly (readonly ReadLine[])[] => [...new Set(lines.map((line) => line.bookId))].map((bookId) => lines.filter((line) => line.bookId === bookId))

/**
 * How each play on the lines stands. A book's lines are read as one
 * sequence, its days in order and each day in the order the relay put its
 * entries there: never by any device's clock. A play said of on several
 * books stands as the book said of it on the latest day has it.
 */
export const standingsOf = (lines: readonly ReadLine[]): ReadonlyMap<PlayId, PlayStanding> =>
  byBook(lines)
    .map(standingsOnBook)
    .reduce((found, standings) => [...standings].reduce((so, [id, standing]) => ((kept) => new Map(so).set(id, kept === undefined ? standing : later(kept, standing)))(so.get(id)), found), new Map<PlayId, PlayStanding>())

/**
 * How many lines of a device's own log never reached the line: those it
 * has that the log shown there has not, as a change of a log is told.
 * What a device recorded while another had taken the play over.
 */
export const unshownCountOf = (own: string, shown: string): number => {
  const reached = new Set(logLinesOf(shown))
  return logLinesOf(own).filter((line) => !reached.has(line)).length
}
