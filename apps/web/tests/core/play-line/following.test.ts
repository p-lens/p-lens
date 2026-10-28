import { describe, expect, test } from "bun:test"

import { standingsOf, unshownCountOf, type PlayStanding, type ReadLine } from "../../../src/core/play-line/following"
import { A, B, BOOK, OTHER_BOOK, PLAY, TODAY, YESTERDAY, claimed, lineOf, playAt, said, shown } from "../../support/play-line"

const standingOf = (lines: readonly ReadLine[]) => standingsOf(lines).get(PLAY)

describe("who holds a play", () => {
  test("is the first device to show it, where none has claimed it: a later show by another is passed over", () => {
    expect(standingOf([lineOf(BOOK, TODAY, [shown(A, "t1", playAt(1)), shown(B, "t2", playAt(3))])])).toEqual({ type: "held", by: A, handovers: 0, play: playAt(1), shownAt: "t1", line: { bookId: BOOK, day: TODAY } })
  })

  test("is the device that claimed it last, which has the play as it was last shown until it shows it itself", () => {
    const lines = [lineOf(BOOK, TODAY, [shown(A, "t1", playAt(2)), claimed(B, "t2")])]
    expect(standingOf(lines)).toEqual({ type: "held", by: B, handovers: 1, play: playAt(2), shownAt: "t1", line: { bookId: BOOK, day: TODAY } })
    expect(standingOf([lineOf(BOOK, TODAY, [shown(A, "t1"), claimed(B, "t2"), claimed(A, "t3", 2)])])).toMatchObject({ type: "held", by: A })
  })

  test("goes by the relay's order, never by the clocks the entries carry", () => {
    expect(standingOf([lineOf(BOOK, TODAY, [shown(A, "t9"), claimed(B, "t1")])])).toMatchObject({ type: "held", by: B })
    const reversed: ReadLine = { bookId: BOOK, day: TODAY, entries: [{ seq: 2, entry: claimed(B, "t1") }, { seq: 1, entry: shown(A, "t9") }] }
    expect(standingOf([reversed])).toMatchObject({ type: "held", by: B })
  })
})

describe("what counts on a line", () => {
  test("a show by a device that was claimed from is passed over; the holder's own counts", () => {
    const lines = [lineOf(BOOK, TODAY, [shown(A, "t1", playAt(1)), claimed(B, "t2"), shown(A, "t3", playAt(4))])]
    expect(standingOf(lines)).toEqual({ type: "held", by: B, handovers: 1, play: playAt(1), shownAt: "t1", line: { bookId: BOOK, day: TODAY } })
    const shownByB = [lineOf(BOOK, TODAY, [shown(A, "t1", playAt(1)), claimed(B, "t2"), shown(A, "t3", playAt(4)), shown(B, "t4", playAt(2, BOOK, 1))])]
    expect(standingOf(shownByB)).toEqual({ type: "held", by: B, handovers: 1, play: playAt(2, BOOK, 1), shownAt: "t4", line: { bookId: BOOK, day: TODAY } })
  })

  test("a play taken back or moved by its holder is gone from that line's book; by another, it is passed over", () => {
    expect(standingOf([lineOf(BOOK, TODAY, [shown(A, "t1"), said("withdrawn", A, "t2")])])).toEqual({ type: "gone", reason: "withdrawn", handovers: 0, line: { bookId: BOOK, day: TODAY } })
    expect(standingOf([lineOf(BOOK, TODAY, [shown(A, "t1"), said("moved", A, "t2")])])).toEqual({ type: "gone", reason: "moved", handovers: 0, line: { bookId: BOOK, day: TODAY } })
    expect(standingOf([lineOf(BOOK, TODAY, [shown(A, "t1"), said("withdrawn", B, "t2")])])).toMatchObject({ type: "held", by: A })
  })

  test("a play moved to another book stands as that book's line has it, whichever book is read first", () => {
    const from = lineOf(BOOK, TODAY, [shown(A, "t1", playAt(1)), said("moved", A, "t2")])
    const to = lineOf(OTHER_BOOK, TODAY, [shown(A, "t3", playAt(2, OTHER_BOOK))])
    const expected: PlayStanding = { type: "held", by: A, handovers: 0, play: playAt(2, OTHER_BOOK), shownAt: "t3", line: { bookId: OTHER_BOOK, day: TODAY } }
    expect(standingOf([from, to])).toEqual(expected)
    expect(standingOf([to, from])).toEqual(expected)
  })
})

describe("a play's handovers", () => {
  test("hold a play for the device that showed it at the later one, though the claim that gave it is on a line not read", () => {
    const lines = [lineOf(BOOK, TODAY, [shown(A, "t1", playAt(1)), shown(B, "t2", playAt(2, BOOK, 1))])]
    expect(standingOf(lines)).toEqual({ type: "held", by: B, handovers: 1, play: playAt(2, BOOK, 1), shownAt: "t2", line: { bookId: BOOK, day: TODAY } })
  })

  test("pass over a show from a device claimed from, on a day after the claim, whether it comes before the holder's show or not", () => {
    const claimDay = lineOf(BOOK, YESTERDAY, [shown(A, "t1", playAt(1)), claimed(B, "t2")])
    expect(standingOf([claimDay, lineOf(BOOK, TODAY, [shown(A, "t3", playAt(4))])])).toMatchObject({ type: "held", by: B, handovers: 1 })
    expect(standingOf([claimDay, lineOf(BOOK, TODAY, [shown(A, "t3", playAt(4)), shown(B, "t4", playAt(2, BOOK, 1))])])).toMatchObject({ type: "held", by: B, play: playAt(2, BOOK, 1) })
  })

  test("pass over a claim at an earlier one than the lines have seen", () => {
    expect(standingOf([lineOf(BOOK, TODAY, [shown(A, "t1"), claimed(B, "t2", 2), claimed(A, "t3", 1)])])).toMatchObject({ type: "held", by: B, handovers: 2 })
  })

  test("bring a play deleted by a device claimed from back to the one holding it, as it shows it", () => {
    const lines = [lineOf(BOOK, TODAY, [shown(A, "t1"), said("withdrawn", A, "t2"), shown(B, "t3", playAt(2, BOOK, 1))])]
    expect(standingOf(lines)).toMatchObject({ type: "held", by: B, handovers: 1 })
  })
})

describe("a book's lines", () => {
  test("are read as one, day after day: a claim today holds a play shown yesterday", () => {
    const lines = [lineOf(BOOK, TODAY, [claimed(B, "t3")]), lineOf(BOOK, YESTERDAY, [shown(A, "t1", playAt(3))])]
    expect(standingOf(lines)).toEqual({ type: "held", by: B, handovers: 1, play: playAt(3), shownAt: "t1", line: { bookId: BOOK, day: TODAY } })
  })

  test("give the play as the later day shows it", () => {
    const lines = [lineOf(BOOK, TODAY, [shown(A, "t3", playAt(4))]), lineOf(BOOK, YESTERDAY, [shown(A, "t1", playAt(1))])]
    expect(standingOf(lines)).toMatchObject({ type: "held", play: playAt(4), line: { day: TODAY } })
  })

  test("of two books, the one said of the play on the later day stands", () => {
    const lines = [lineOf(OTHER_BOOK, TODAY, [shown(A, "t3", playAt(2, OTHER_BOOK))]), lineOf(BOOK, YESTERDAY, [shown(A, "t1", playAt(1)), said("moved", A, "t2")])]
    expect(standingOf(lines)).toMatchObject({ type: "held", line: { bookId: OTHER_BOOK, day: TODAY } })
    const gone = [lineOf(OTHER_BOOK, YESTERDAY, [shown(A, "t1", playAt(1, OTHER_BOOK))]), lineOf(BOOK, TODAY, [shown(A, "t2"), said("withdrawn", A, "t3")])]
    expect(standingOf(gone)).toEqual({ type: "gone", reason: "withdrawn", handovers: 0, line: { bookId: BOOK, day: TODAY } })
  })

  test("of two books, the one at the later handover stands, whichever was shown later by the clock", () => {
    const lines = [
      lineOf(BOOK, TODAY, [shown(A, "2026-10-28T02:00:00.000Z", playAt(1)), claimed(B, "2026-10-28T02:00:05.000Z"), shown(B, "2026-10-28T02:00:06.000Z", playAt(2, BOOK, 1))]),
      lineOf(OTHER_BOOK, TODAY, [shown(A, "2026-10-28T02:00:07.000Z", playAt(1, OTHER_BOOK))]),
    ]
    expect(standingOf(lines)).toMatchObject({ type: "held", by: B, handovers: 1, line: { bookId: BOOK, day: TODAY } })
    expect(standingOf(lines.toReversed())).toMatchObject({ type: "held", by: B, handovers: 1, line: { bookId: BOOK, day: TODAY } })
  })

  test("say nothing of a play never shown or claimed on them", () => {
    expect(standingsOf([lineOf(BOOK, TODAY, [said("withdrawn", A, "t1")])]).size).toBe(0)
    expect(standingsOf([]).size).toBe(0)
  })
})

describe("readings that never reached the line", () => {
  test("are the lines of a device's own log the shown log has not", () => {
    expect(unshownCountOf(playAt(4).log, playAt(2).log)).toBe(2)
    expect(unshownCountOf(playAt(2).log, playAt(4).log)).toBe(0)
    expect(unshownCountOf(playAt(3).log, playAt(3).log)).toBe(0)
    expect(unshownCountOf('{"spins":0,"outlay":0}\n\n{"spins":99,"outlay":5000}\n', playAt(2).log)).toBe(1)
  })
})
