import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PachinkoDraft } from "../../src/core/live-play/draft"
import type { DeviceId } from "../../src/core/play-line/device"
import { shownPlayOf, type PlayLineEntry, type ShownPlay } from "../../src/core/play-line/entry"
import type { Followed, ReadLine } from "../../src/core/play-line/following"
import { readOnto } from "../../src/core/play-line/showing"
import type { PlayId } from "../../src/core/play/play"
import { Ok } from "../../src/core/result/result"
import type { FollowStorage } from "../../src/storage/port/follow-storage"

export const BOOK = "b-1" as BookId
export const OTHER_BOOK = "b-2" as BookId
export const YESTERDAY = "2026-10-27" as IsoDate
export const TODAY = "2026-10-28" as IsoDate
export const A = "device-a" as DeviceId
export const B = "device-b" as DeviceId
export const PLAY = "p-1" as PlayId

export const DRAFT: PachinkoDraft = {
  id: PLAY,
  date: TODAY,
  venue: { type: "none", terms: undefined },
  gameKind: "pachinko",
  machine: "made-up",
  pachinko: undefined,
  cabinetNumber: undefined,
  startedAt: "2026-10-28T01:00:00.000Z",
  log: '{"spins":0,"outlay":0}\n',
}

const READINGS = ['{"spins":0,"outlay":0}', '{"spins":20,"outlay":1000}', '{"spins":40,"outlay":2000}', '{"spins":60,"outlay":3000}']

/** The play with its first `count` readings, as shown on a book's line: at a handover, where it has been continued on another device. */
export const playAt = (count: number, bookId: BookId = BOOK, handovers?: number): ShownPlay =>
  shownPlayOf({ ...DRAFT, log: `${READINGS.slice(0, count).join("\n")}\n`, ...(handovers === undefined ? {} : { handovers }) }, bookId)

/** An entry that is on a line as it was written: any but a patch. */
type Whole = Exclude<PlayLineEntry, { readonly type: "patched" }>

export const shown = (by: DeviceId, at: string, play: ShownPlay = playAt(1)): Whole => ({ type: "shown", by, at, play })

export const said = (type: "withdrawn" | "moved", by: DeviceId, at: string, playId: PlayId = PLAY): Whole => ({ type, by, at, playId })

/** A claim of the play, at the first handover unless another is given. */
export const claimed = (by: DeviceId, at: string, handovers = 1, playId: PlayId = PLAY): Whole => ({ type: "claimed", by, at, playId, handovers })

/** A line with its entries at places counted from 1 in the order given, read as a device reads them: a patch taken as the play it makes. */
export const lineOf = (bookId: BookId, day: IsoDate, entries: readonly PlayLineEntry[]): ReadLine => ({ bookId, day, entries: readOnto([], entries.map((entry, index) => ({ seq: index + 1, entry }))) })

/** Copies of plays another device holds, kept in a map; taking up and giving up go between it and nothing, for tests that keep no drafts beside it. */
export const memoryFollow = (): FollowStorage & { readonly kept: () => readonly Followed[] } => {
  const copies = new Map<PlayId, Followed>()
  return {
    kept: () => [...copies.values()],
    listFollowed: async () => Ok([...copies.values()]),
    readFollowed: async (id) => Ok(copies.get(id)),
    putFollowed: async (followed) => {
      copies.set(followed.id, followed)
      return Ok(undefined)
    },
    dropFollowed: async (id) => {
      copies.delete(id)
      return Ok(undefined)
    },
    takeUp: async (followed) => {
      copies.delete(followed.id)
      return Ok(followed.play)
    },
    yieldUp: async (_id, followed) => {
      copies.set(followed.id, followed)
      return Ok(undefined)
    },
    claimBack: async () => Ok(undefined),
  }
}
