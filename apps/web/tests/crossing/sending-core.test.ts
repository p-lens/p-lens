import { describe, expect, test } from "bun:test"

import type { BookId } from "../../src/core/book/book"
import type { PlayDraft } from "../../src/core/live-play/draft"
import type { PlayId } from "../../src/core/play/play"
import { sentPlayOf } from "../../src/crossing/core/sending"

const PLAY = {
  id: "play-1" as PlayId,
  bookId: "the-senders-book" as BookId,
  date: "2026-11-05",
  venue: { type: "parlor", parlor: { identity: { type: "listed", id: "parlor-1" }, name: "ネルフ駅前", pools: [{ kind: "balls" }] }, terms: { kind: "balls" } },
  gameKind: "pachinko",
  pachinko: undefined,
  machine: "ミスターパチンコ",
  cabinetNumber: "101",
  startedAt: "2026-11-05T01:00:00.000Z",
  log: '{"spins":0}',
  history: [{ at: "2026-11-05T01:00:00.000Z", removed: [], added: ['{"spins":0}'] }],
  recorded: { at: "2026-11-05T03:00:00.000Z", finish: { at: "2026-11-05T03:00:00.000Z", counter: 100 } },
} as unknown as PlayDraft

describe("a play as it is sent", () => {
  test("leaves out what is the sender's own: their book, their recording, their savings at the parlor, and the log carried apart", () => {
    const sent = sentPlayOf(PLAY)
    expect(Object.keys(sent).toSorted()).toEqual(["cabinetNumber", "date", "gameKind", "id", "machine", "startedAt", "venue"])
    expect(sent["venue"]).toEqual({ type: "parlor", parlor: { identity: { type: "listed", id: "parlor-1" }, name: "ネルフ駅前", pools: [] }, terms: { kind: "balls" } })
  })
})
