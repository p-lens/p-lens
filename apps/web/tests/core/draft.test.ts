import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { awaitsSending, deliveryOf, type PlayDraft } from "../../src/core/live-play/draft"
import type { PlayId } from "../../src/core/play/play"

const LINE = "line-1"

const DRAFT: PlayDraft = {
  id: "p-1" as PlayId,
  date: "2026-10-09" as IsoDate,
  venue: { type: "none", terms: undefined },
  gameKind: "pachinko",
  machine: "made-up",
  pachinko: undefined,
  cabinetNumber: undefined,
  startedAt: "2026-10-09T01:00:00.000Z",
  log: '{"spins":0,"outlay":0}\n',
}

const sentAs = (log: string, lineId: string): PlayDraft => ({ ...DRAFT, sent: [{ lineId, at: "2026-10-09T02:00:00.000Z", log }] })

describe("how a play stands with an inbox", () => {
  test("a play never sent there is unsent, and waits", () => {
    expect([deliveryOf(DRAFT, LINE), awaitsSending(DRAFT, LINE)]).toEqual(["unsent", true])
  })

  test("a play sent as it now is has gone, and does not wait", () => {
    expect([deliveryOf(sentAs(DRAFT.log, LINE), LINE), awaitsSending(sentAs(DRAFT.log, LINE), LINE)]).toEqual(["sent", false])
  })

  test("a play changed since it was sent waits again", () => {
    expect([deliveryOf(sentAs("", LINE), LINE), awaitsSending(sentAs("", LINE), LINE)]).toEqual(["changed", true])
  })

  test("a play sent to another inbox is unsent to this one", () => {
    expect([deliveryOf(sentAs(DRAFT.log, "line-2"), LINE), awaitsSending(sentAs(DRAFT.log, "line-2"), LINE)]).toEqual(["unsent", true])
  })

  test("a play someone sent here is not sent on", () => {
    expect(awaitsSending({ ...DRAFT, received: { sender: "made-up", log: DRAFT.log, ended: undefined } }, LINE)).toBe(false)
  })
})
