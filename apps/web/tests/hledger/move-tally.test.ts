import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { moveRecordedTally, moveTally } from "../../src/application/move-tally"
import { recordTokenTally, recordYenTally } from "../../src/application/record-tally"
import { loadRecordedTally } from "../../src/application/revise-tally"
import { firstBook } from "../../src/app/composition/first-book"
import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { playLogPath } from "../../src/core/play-log/checkpoint"
import type { PlayId } from "../../src/core/play/play"
import { mapOk } from "../../src/core/result/result"
import type { TokenTally, YenTally } from "../../src/core/tally/tally"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { MALEHAN, PRICES, RENTED_PLAY, dec } from "../support/values"

const FROM = "wrong-book" as BookId
const TO = "right-book" as BookId

const LOG = '{"spins":0,"outlay":0}\n{"spins":120,"outlay":12000}\n'

const PLAYED: TokenTally = { ...RENTED_PLAY, id: "moved" as PlayId, date: "2026-10-04" as IsoDate, handed: dec("300"), payout: dec("2800") }

const setUp = async () => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  await storage.createBook(await fixtureBook("basic-play", { id: FROM, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  await storage.createBook(firstBook(TO, ME, "移動先"))
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-04T20:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  const recordedIn = async (bookId: BookId, id: string) => mapOk(await loadRecordedTally(session, bookId, ME, id as PlayId), (found) => found.recorded)
  return { storage, session, recordedIn }
}

describe("a recorded tally moved into another book", () => {
  test("is written there whole, its parlor's pool opened at the rate it had and a copy of its log beside it, and taken out of the book it was in, its log left there", async () => {
    const { storage, session, recordedIn } = await setUp()
    expect((await recordTokenTally(session, FROM, PLAYED, LOG)).ok).toBe(true)
    expect((await moveTally(session, FROM, TO, { type: "token", tally: PLAYED }, PRICES)).ok).toBe(true)
    const there = await recordedIn(TO, "moved")
    expect(there.ok && there.value.type === "token" ? { ...there.value.tally, parlor: there.value.tally.parlor.name } : undefined).toEqual({ ...PLAYED, parlor: MALEHAN.name })
    expect(storage.peek(TO)?.files[playLogPath("pachinko", PLAYED.id)]).toBe(LOG)
    expect(await recordedIn(FROM, "moved")).toEqual({ ok: false, error: { type: "tally-missing" } })
    expect(storage.peek(FROM)?.files[playLogPath("pachinko", PLAYED.id)]).toBe(LOG)
  })

  test("is not written into a book that has a tally of its play already, and stays where it was", async () => {
    const { session, recordedIn } = await setUp()
    await recordTokenTally(session, FROM, PLAYED)
    expect((await moveTally(session, FROM, TO, { type: "token", tally: PLAYED }, PRICES)).ok).toBe(true)
    expect((await recordTokenTally(session, FROM, PLAYED)).ok).toBe(true)
    expect(await moveTally(session, FROM, TO, { type: "token", tally: PLAYED }, PRICES)).toEqual({ ok: false, error: { type: "tally-in-book" } })
    expect((await recordedIn(FROM, "moved")).ok).toBe(true)
  })

  test("in yen goes at its parlor, opened there, or at none", async () => {
    const { session, recordedIn } = await setUp()
    const atParlor: YenTally = { id: "yen-at" as PlayId, date: "2026-10-04" as IsoDate, parlor: MALEHAN, gameKind: "pachinko", machine: "流星", cabinetNumber: undefined, outlay: dec("15000"), takings: dec("3000"), settlement: undefined, theoreticalValue: undefined, told: undefined }
    const nowhere: YenTally = { ...atParlor, id: "yen-nowhere" as PlayId, parlor: undefined, settlement: { type: "off-book-savings", cash: dec("15000") }, handed: dec("-500") }
    for (const tally of [atParlor, nowhere]) {
      expect((await recordYenTally(session, FROM, tally)).ok).toBe(true)
      expect(await moveTally(session, FROM, TO, { type: "yen", tally }, PRICES)).toMatchObject({ ok: true })
    }
    const at = await recordedIn(TO, "yen-at")
    expect(at.ok && at.value.type === "yen" ? at.value.tally.parlor?.name : undefined).toBe(MALEHAN.name)
    expect(await recordedIn(TO, "yen-nowhere")).toEqual({ ok: true, value: { type: "yen", tally: nowhere } })
  })

  test("as it stands is read from the book it leaves and moved at that book's rates", async () => {
    const { storage, session, recordedIn } = await setUp()
    expect((await recordTokenTally(session, FROM, PLAYED, LOG)).ok).toBe(true)
    expect((await moveRecordedTally(session, FROM, TO, ME, PLAYED.id)).ok).toBe(true)
    const there = await recordedIn(TO, "moved")
    expect(there.ok && there.value.type === "token" ? { ...there.value.tally, parlor: there.value.tally.parlor.name } : undefined).toEqual({ ...PLAYED, parlor: MALEHAN.name })
    expect(storage.peek(TO)?.files[playLogPath("pachinko", PLAYED.id)]).toBe(LOG)
    expect(await recordedIn(FROM, "moved")).toEqual({ ok: false, error: { type: "tally-missing" } })
  })
})
