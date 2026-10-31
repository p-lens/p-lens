import { describe, expect, test } from "bun:test"

import type { BookId, MemberId } from "../../../src/core/book/book"
import { fileChangesBetween, patchesOf, type JournalChange } from "../../../src/core/change/journal-change"
import type { BookFiles } from "../../../src/core/journal/layout"
import { changeText } from "../../../src/core/sync/codec"
import { fittedChanges } from "../../../src/core/sync/fitting"
import { received } from "../../../src/core/sync/rebase"

const ROOM = 4_000

const changeOf = (before: BookFiles, after: BookFiles): JournalChange => ({
  bookId: "book" as BookId,
  author: "local" as MemberId,
  at: "2026-10-30T03:00:00.000Z",
  intent: { type: "book-created" },
  files: patchesOf(fileChangesBetween(before, after)),
})

const entriesOf = (count: number, note: string): string =>
  Array.from({ length: count }, (_, index) => `2026-10-${String((index % 28) + 1).padStart(2, "0")} ${note}${index}\n    資産:現金    -1000 JPY\n    費用:貸玉差額    1000 JPY`).join("\n\n")

const bytesOf = (change: JournalChange): number => new TextEncoder().encode(changeText(change)).length

const madeOn = (before: BookFiles, changes: readonly JournalChange[]): BookFiles | undefined => {
  const made = received(before, changes.map((change) => ({ change })))
  return made.ok ? made.value : undefined
}

describe("a change fitted to what a line takes", () => {
  test("is itself where it fits", () => {
    const change = changeOf({}, { "main.journal": "include transactions.journal\n" })
    expect(fittedChanges(change, ROOM)).toEqual([change])
  })

  test("makes a book too large for one from nothing, in changes each within the room, saying what the whole said", () => {
    const files = { "main.journal": "include transactions.journal\n", "accounts.journal": "account 資産:現金\n", "transactions.journal": entriesOf(400, "ホールの稼働") }
    const change = changeOf({}, files)
    const fitted = fittedChanges(change, ROOM)
    expect(fitted.length).toBeGreaterThan(10)
    expect(fitted.every((each) => bytesOf(each) <= ROOM)).toBe(true)
    expect(fitted.every((each) => each.intent.type === "book-created" && each.author === change.author && each.at === change.at)).toBe(true)
    expect(madeOn({}, fitted)).toEqual(madeOn({}, [change]))
  })

  test("makes a file edited at length, here and there, as the change did", () => {
    const before = { "transactions.journal": [entriesOf(30, "前"), entriesOf(200, "中ほど"), entriesOf(30, "後")].join("\n\n") }
    const after = { "transactions.journal": [entriesOf(30, "前").replace("前3\n", "前の三\n"), entriesOf(250, "書き直した"), entriesOf(30, "後").replace("後29\n", "後の二十九\n")].join("\n\n"), "prices.journal": "P 2026-10-01 玉 4 JPY\n" }
    const change = changeOf(before, after)
    const fitted = fittedChanges(change, ROOM)
    expect(fitted.length).toBeGreaterThan(1)
    expect(fitted.every((each) => bytesOf(each) <= ROOM)).toBe(true)
    expect(madeOn(before, fitted)).toEqual(after)
  })

  test("makes a stretch taken out and put in larger than the room, a run at a time, between stretches that fit", () => {
    const lines = (mark: string, count: number): string => Array.from({ length: count }, (_, index) => `${mark}行${index}`).join("\n")
    const before = { "notes.journal": ["; 頭", lines("; 古い", 900), "; 間", "; 尾"].join("\n") }
    const after = { "notes.journal": ["; 頭の書き直し", lines("; 新しい", 1100), "; 間", "; 尾の書き直し"].join("\n") }
    const change = changeOf(before, after)
    expect(change.files[0]?.hunks.some((hunk) => hunk.removed.length >= 900 && hunk.added.length >= 1100)).toBe(true)
    const fitted = fittedChanges(change, ROOM)
    expect(fitted.every((each) => bytesOf(each) <= ROOM)).toBe(true)
    expect(madeOn(before, fitted)).toEqual(after)
  })

  test("makes an empty file as well as the rest", () => {
    const files = { "empty.journal": "", "transactions.journal": entriesOf(100, "x") }
    expect(madeOn({}, fittedChanges(changeOf({}, files), ROOM))).toEqual(files)
  })
})
