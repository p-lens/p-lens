import { describe, expect, test } from "bun:test"

import type { BookId } from "../../../src/core/book/book"
import { shownPlayOf } from "../../../src/core/play-line/entry"
import type { Followed, PlayStanding } from "../../../src/core/play-line/following"
import { reconcile, type HeldPlay } from "../../../src/core/play-line/reconcile"
import type { PlayId } from "../../../src/core/play/play"
import { A, B, BOOK, DRAFT, OTHER_BOOK, PLAY, TODAY, YESTERDAY, playAt } from "../../support/play-line"

const ON_BOOK = { bookId: BOOK, day: TODAY }

const heldBy = (by: typeof A, play = playAt(2), line = ON_BOOK, shownAt = "t2", handovers = 0): ReadonlyMap<PlayId, PlayStanding> => new Map([[PLAY, { type: "held", by, handovers, play, shownAt, line }]])

/** A play claimed and shown nowhere since on its book's lines. */
const claimedBy = (by: typeof A, handovers = 1): ReadonlyMap<PlayId, PlayStanding> => new Map([[PLAY, { type: "held", by, handovers, play: undefined, shownAt: undefined, line: ON_BOOK }]])

const gone = (reason: "withdrawn" | "moved", line = ON_BOOK): ReadonlyMap<PlayId, PlayStanding> => new Map([[PLAY, { type: "gone", reason, handovers: 0, line }]])

const holding = (count: number, bookId: BookId | undefined, handovers?: number): HeldPlay => ({ draft: { ...DRAFT, log: playAt(count).log, ...(handovers === undefined ? {} : { handovers }) }, bookId })

const RECORDED = { at: "2026-10-27T12:00:00.000Z", finish: { at: "2026-10-27T11:50:00.000Z", counter: 300 } }

const copy = (holder = B, count = 1, line = ON_BOOK, shownAt = "t1"): Followed => ({ id: PLAY, play: playAt(count, line.bookId), holder, shownAt, line })

describe("a play held by this device on its line", () => {
  test("kept among its own plays is left as it is", () => {
    expect(reconcile(heldBy(A), [holding(2, BOOK)], [], A, TODAY)).toEqual([])
  })

  test("kept only as a copy is taken up — the claim landed and the move never did — as the line last showed it", () => {
    expect(reconcile(heldBy(A, playAt(3, BOOK, 1), ON_BOOK, "t2", 1), [], [copy(B, 1)], A, TODAY)).toEqual([{ type: "take-up", followed: { id: PLAY, play: playAt(3, BOOK, 1), holder: A, shownAt: "t2", line: ON_BOOK } }])
  })

  test("claimed and never shown since is taken up as the copy has it, at the handover it was claimed at", () => {
    expect(reconcile(claimedBy(A), [], [copy(B, 2)], A, TODAY)).toEqual([{ type: "take-up", followed: { ...copy(B, 2), play: playAt(2, BOOK, 1), holder: A } }])
  })

  test("kept nowhere, on today's line, was deleted here, and is taken back off the line", () => {
    expect(reconcile(heldBy(A), [], [], A, TODAY)).toEqual([{ type: "withdraw", playId: PLAY, line: ON_BOOK }])
  })

  test("kept nowhere, left over and last shown on a day gone by, was deleted here before it was shown today, and is taken back off the line", () => {
    const yesterday = { bookId: BOOK, day: YESTERDAY }
    expect(reconcile(heldBy(A, { ...playAt(2), date: YESTERDAY }, yesterday), [], [], A, TODAY)).toEqual([{ type: "withdraw", playId: PLAY, line: yesterday }])
  })

  test("kept nowhere, shown recorded on a day after it began, was let go of as past, and is left on its line", () => {
    expect(reconcile(heldBy(A, { ...playAt(2), date: YESTERDAY, recorded: RECORDED }), [], [], A, TODAY)).toEqual([])
    expect(reconcile(heldBy(A, { ...playAt(2), date: YESTERDAY, recorded: RECORDED }, { bookId: BOOK, day: YESTERDAY }), [], [], A, TODAY)).toEqual([])
  })

  test("now going to another book, or to one this device syncs not, is moved off the line it is on", () => {
    expect(reconcile(heldBy(A), [holding(2, OTHER_BOOK)], [], A, TODAY)).toEqual([{ type: "move", playId: PLAY, from: ON_BOOK }])
    expect(reconcile(heldBy(A), [holding(2, undefined)], [], A, TODAY)).toEqual([{ type: "move", playId: PLAY, from: ON_BOOK }])
  })
})

describe("a play held by another device", () => {
  test("held here too is given up for the line's play, telling how many readings of this device's never reached the line", () => {
    expect(reconcile(heldBy(B, playAt(2)), [holding(4, BOOK)], [], A, TODAY)).toEqual([{ type: "yield-up", playId: PLAY, followed: { id: PLAY, play: playAt(2), holder: B, shownAt: "t2", line: ON_BOOK }, unshown: 2, log: playAt(4).log }])
  })

  test("claimed and never shown is given up for this device's own play as it last stood", () => {
    const held = holding(3, BOOK)
    expect(reconcile(claimedBy(B), [held], [], A, TODAY)).toEqual([{ type: "yield-up", playId: PLAY, followed: { id: PLAY, play: shownPlayOf(held.draft, BOOK), holder: B, shownAt: DRAFT.startedAt, line: ON_BOOK }, unshown: 0, log: held.draft.log }])
  })

  test("held here at a later handover than the lines have is kept, to be shown again: it was continued here by a claim on a line not read", () => {
    expect(reconcile(heldBy(B), [holding(4, BOOK, 1)], [], A, TODAY)).toEqual([])
    expect(reconcile(claimedBy(B, 1), [holding(4, BOOK, 2)], [], A, TODAY)).toEqual([])
    expect(reconcile(heldBy(B, playAt(2, BOOK, 1), ON_BOOK, "t2", 1), [holding(4, BOOK, 1)], [], A, TODAY)).toMatchObject([{ type: "yield-up" }])
  })

  test("kept as a copy, or not at all, is kept as the line last showed it", () => {
    expect(reconcile(heldBy(B, playAt(3)), [], [copy(B, 1)], A, TODAY)).toEqual([{ type: "put-followed", followed: { id: PLAY, play: playAt(3), holder: B, shownAt: "t2", line: ON_BOOK } }])
    expect(reconcile(heldBy(B, playAt(3)), [], [], A, TODAY)).toEqual([{ type: "put-followed", followed: { id: PLAY, play: playAt(3), holder: B, shownAt: "t2", line: ON_BOOK } }])
  })

  test("kept as a copy already as the line shows it is left as it is", () => {
    expect(reconcile(heldBy(B, playAt(1), ON_BOOK, "t1"), [], [copy(B, 1)], A, TODAY)).toEqual([])
  })

  test("claimed by a third device keeps the copy, under its new holder", () => {
    expect(reconcile(claimedBy(B), [], [copy(A, 2)], "device-c" as typeof A, TODAY)).toEqual([{ type: "put-followed", followed: { ...copy(A, 2), holder: B } }])
  })

  test("held here and recorded, where the other took it from a showing not yet recorded, is held again at the handover after the claim", () => {
    const recorded: HeldPlay = { draft: { ...DRAFT, log: playAt(2).log, recorded: RECORDED }, bookId: BOOK }
    expect(reconcile(heldBy(B, playAt(2, BOOK, 1), ON_BOOK, "t2", 1), [recorded], [], A, TODAY)).toEqual([{ type: "claim-back", playId: PLAY, handovers: 2, log: playAt(2).log }])
    expect(reconcile(claimedBy(B), [recorded], [], A, TODAY)).toEqual([])
    expect(reconcile(heldBy(B, { ...playAt(2, BOOK, 1), recorded: RECORDED }, ON_BOOK, "t2", 1), [recorded], [], A, TODAY)).toMatchObject([{ type: "yield-up" }])
  })

  test("claimed and never shown, and kept nowhere here, gives nothing to keep", () => {
    expect(reconcile(claimedBy(B), [], [], A, TODAY)).toEqual([])
  })
})

describe("a play gone from a book", () => {
  test("lets go of a copy of it on that book", () => {
    expect(reconcile(gone("withdrawn"), [], [copy()], A, TODAY)).toEqual([{ type: "drop-followed", playId: PLAY, reason: "withdrawn" }])
    expect(reconcile(gone("moved"), [], [copy()], A, TODAY)).toEqual([{ type: "drop-followed", playId: PLAY, reason: "moved" }])
  })

  test("keeps a copy of it on another book", () => {
    expect(reconcile(gone("moved"), [], [copy(B, 1, { bookId: OTHER_BOOK, day: TODAY })], A, TODAY)).toEqual([])
  })

  test("leaves a play held here alone", () => {
    expect(reconcile(gone("withdrawn"), [holding(1, BOOK)], [], A, TODAY)).toEqual([])
  })
})

describe("a play the lines know nothing of", () => {
  test("is left alone, held or a copy", () => {
    expect(reconcile(new Map(), [holding(1, BOOK)], [copy()], A, TODAY)).toEqual([])
  })
})
