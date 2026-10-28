import { describe, expect, test } from "bun:test"

import type { BookId } from "../../../src/core/book/book"
import type { IsoDate } from "../../../src/core/calendar/calendar"
import type { PachinkoDraft } from "../../../src/core/live-play/draft"
import type { DeviceId } from "../../../src/core/play-line/device"
import { playLineEntryText, readPlayLineEntry, readShownPlay, shownPlayOf, type PlayLineEntry } from "../../../src/core/play-line/entry"
import type { PlayId } from "../../../src/core/play/play"
import { MALEHAN } from "../../support/values"

const BOOK = "b-1" as BookId
const ME = "device-a" as DeviceId

const DRAFT: PachinkoDraft = {
  id: "p-1" as PlayId,
  date: "2026-10-28" as IsoDate,
  venue: { type: "parlor", parlor: MALEHAN, terms: { rental: { yen: 1000, tokens: 250 }, exchange: { yen: 1000, tokens: 280 }, replay: { paidOut: 250, deducted: 250 } } },
  gameKind: "pachinko",
  machine: "made-up",
  pachinko: undefined,
  cabinetNumber: "123",
  startedAt: "2026-10-28T01:00:00.000Z",
  log: '{"spins":0,"outlay":0}\n{"spins":30,"outlay":1000}\n',
  history: [{ at: "2026-10-28T01:10:00.000Z", removed: [], added: ['{"spins":30,"outlay":1000}'] }],
  recorded: { at: "2026-10-28T03:00:10.000Z", finish: { at: "2026-10-28T03:00:00.000Z", counter: 300 } },
  sent: [{ lineId: "inbox", at: "2026-10-28T02:00:00.000Z", log: '{"spins":0,"outlay":0}\n' }],
  received: { sender: "ミサト", senderId: "grant-1", log: '{"spins":0,"outlay":0}\n', finished: undefined },
}

const SHOWN: PlayLineEntry = { type: "shown", by: ME, at: "2026-10-28T03:01:00.000Z", play: shownPlayOf(DRAFT, BOOK) }

const fieldsOf = (entry: PlayLineEntry): Record<string, unknown> => JSON.parse(playLineEntryText(entry)) as Record<string, unknown>

describe("a play shown on a line", () => {
  test("is the whole draft under its book, with where it was sent left behind", () => {
    const play = shownPlayOf({ ...DRAFT, bookId: "b-other" as BookId }, BOOK)
    expect(play.bookId).toBe(BOOK)
    expect("sent" in play).toBe(false)
    expect(play.history).toEqual(DRAFT.history)
    expect(play.recorded).toEqual(DRAFT.recorded)
    expect(play.received).toEqual(DRAFT.received)
  })

  test("reads back only as a draft with its book said and nothing of where it was sent", () => {
    expect(readShownPlay(JSON.parse(JSON.stringify(shownPlayOf(DRAFT, BOOK))))).toEqual(shownPlayOf(DRAFT, BOOK))
    expect(readShownPlay(JSON.parse(JSON.stringify({ ...DRAFT, bookId: BOOK })))).toBeUndefined()
    const { sent: _sent, ...unsent } = DRAFT
    expect(readShownPlay(JSON.parse(JSON.stringify(unsent)))).toBeUndefined()
  })
})

describe("a plays' line's entry", () => {
  test("reads back as it was written, whichever it is", () => {
    const said: readonly PlayLineEntry[] = [
      SHOWN,
      { type: "claimed", by: "device-b" as DeviceId, at: "2026-10-28T03:02:00.000Z", playId: DRAFT.id, handovers: 1 },
      { type: "withdrawn", by: ME, at: "2026-10-28T03:03:00.000Z", playId: DRAFT.id },
      { type: "moved", by: ME, at: "2026-10-28T03:04:00.000Z", playId: DRAFT.id },
    ]
    said.forEach((entry) => expect(readPlayLineEntry(playLineEntryText(entry))).toEqual(entry))
  })

  test("is written in format 1", () => {
    expect(fieldsOf(SHOWN)["format"]).toBe(1)
  })

  test("is none where it is not one this app reads: another format, a part it does not know, a type it does not, or a part left out", () => {
    const claimed: PlayLineEntry = { type: "claimed", by: ME, at: "2026-10-28T03:02:00.000Z", playId: DRAFT.id, handovers: 1 }
    const refused = [
      { ...fieldsOf(claimed), format: 2 },
      { ...fieldsOf(claimed), extra: true },
      { ...fieldsOf(claimed), type: "taken" },
      { ...fieldsOf(claimed), by: "" },
      (({ at: _at, ...rest }) => rest)(fieldsOf(claimed)),
      (({ playId: _id, ...rest }) => rest)(fieldsOf(claimed)),
      (({ handovers: _handovers, ...rest }) => rest)(fieldsOf(claimed)),
      { ...fieldsOf(claimed), handovers: 0 },
      { ...fieldsOf({ type: "withdrawn", by: ME, at: "2026-10-28T03:03:00.000Z", playId: DRAFT.id }), handovers: 1 },
      { ...fieldsOf(SHOWN), playId: DRAFT.id },
      { ...fieldsOf(SHOWN), play: { ...(fieldsOf(SHOWN)["play"] as object), log: "not a log" } },
    ]
    refused.forEach((fields) => expect(readPlayLineEntry(JSON.stringify(fields))).toBeUndefined())
    expect(readPlayLineEntry("not json")).toBeUndefined()
    expect(readPlayLineEntry("[]")).toBeUndefined()
  })

  test("refuses a shown play that carries where it was sent", () => {
    const fields = fieldsOf(SHOWN)
    expect(readPlayLineEntry(JSON.stringify({ ...fields, play: { ...(fields["play"] as object), sent: DRAFT.sent } }))).toBeUndefined()
  })

  test("refuses a shown play with no book", () => {
    const fields = fieldsOf(SHOWN)
    const { bookId: _book, ...play } = fields["play"] as Record<string, unknown>
    expect(readPlayLineEntry(JSON.stringify({ ...fields, play }))).toBeUndefined()
  })
})
