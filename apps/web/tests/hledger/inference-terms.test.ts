import { describe, expect, test } from "bun:test"

import { loadActivity } from "../../src/application/activity"
import { createBookSession } from "../../src/application/book-session"
import { writtenKeepingTerms } from "../../src/application/inference-terms"
import { loadRecordingContext, recordYenTally } from "../../src/application/record-tally"
import { loadRecordedTally, reviseYenTally } from "../../src/application/revise-tally"
import type { BookId } from "../../src/core/book/book"
import { BOOK_SETTINGS_FILE, bookSettingsOf } from "../../src/core/book/settings"
import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PlayId } from "../../src/core/play/play"
import type { YenTally } from "../../src/core/tally/tally"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { emptyYenTallyForm, yenTallyFormOf } from "../../src/ui/features/record-tally/yen-tally-form"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { dec } from "../support/values"

const BOOK = "mine" as BookId

const setUp = async () => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date("2026-10-17T12:00:00+09:00"), newId: () => crypto.randomUUID(), member: ME })
  await session.createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role: "owner" }] }))
  return { session, history, storage }
}

const TYPED: YenTally = { id: "typed" as PlayId, date: "2026-10-16" as IsoDate, parlor: undefined, gameKind: "pachinko", machine: "森物語", cabinetNumber: undefined, outlay: dec("10000"), takings: dec("0"), settlement: undefined, theoreticalValue: undefined, told: undefined }

const commitsOf = async (history: ReturnType<typeof createMemoryHistory>): Promise<number> => ((log) => (log.ok ? log.value.length : -1))(await history.log(BOOK))

describe("the terms a tally typed in by hand was weighed on", () => {
  test("are kept in the book's settings for each game, once, and the next form of that game opens on them", async () => {
    const { session, history, storage } = await setUp()
    const before = await loadRecordingContext(session, BOOK, ME)
    expect(before.ok && emptyYenTallyForm("2026-10-17", before.value.inferenceTerms).weighingTerms).toEqual({ rentedPerThousand: "250", exchangedPerHundred: "28" })

    const written = await writtenKeepingTerms(session, BOOK, recordYenTally(session, BOOK, TYPED), { game: "pachinko", terms: { rentedPerThousand: 240, exchangedPerHundred: 27.5 } })
    expect(written.ok).toBe(true)
    expect(bookSettingsOf(storage.peek(BOOK)?.files[BOOK_SETTINGS_FILE])).toEqual({ ok: true, value: { order: undefined, businessDayTurn: undefined, presses: {}, inferenceTerms: { pachinko: { rentedPerThousand: 240, exchangedPerHundred: 27.5 } } } })

    const after = await loadRecordingContext(session, BOOK, ME)
    expect(after.ok && emptyYenTallyForm("2026-10-17", after.value.inferenceTerms).weighingTerms).toEqual({ rentedPerThousand: "240", exchangedPerHundred: "27.5" })
    expect(after.ok && emptyYenTallyForm("2026-10-17", after.value.inferenceTerms).medalTerms).toEqual({ rentedPerThousand: "46", exchangedPerHundred: "5.2" })

    const counted = await commitsOf(history)
    expect((await writtenKeepingTerms(session, BOOK, recordYenTally(session, BOOK, { ...TYPED, id: "again" as PlayId }), { game: "pachinko", terms: { rentedPerThousand: 240, exchangedPerHundred: 27.5 } })).ok).toBe(true)
    expect(await commitsOf(history)).toBe(counted + 1)

    const revising = await loadRecordedTally(session, BOOK, ME, "typed" as PlayId)
    expect(revising.ok && revising.value.recorded.type === "yen" && yenTallyFormOf(revising.value.recorded.tally, revising.value.context.inferenceTerms).weighingTerms).toEqual({ rentedPerThousand: "240", exchangedPerHundred: "27.5" })
    expect((await writtenKeepingTerms(session, BOOK, reviseYenTally(session, BOOK, { ...TYPED, gameKind: "slot" }), { game: "slot", terms: { rentedPerThousand: 47, exchangedPerHundred: 5.6 } })).ok).toBe(true)
    const both = await loadRecordingContext(session, BOOK, ME)
    expect(both.ok && both.value.inferenceTerms).toEqual({ pachinko: { rentedPerThousand: 240, exchangedPerHundred: 27.5 }, slot: { rentedPerThousand: 47, exchangedPerHundred: 5.6 } })

    const activity = await loadActivity(session, history, BOOK)
    expect(activity.ok && activity.value.lines.some((line) => line.did === "inference-terms-set")).toBe(false)
  })

  test("are not kept where the tally was not written", async () => {
    const { session, storage } = await setUp()
    const refused = await writtenKeepingTerms(session, BOOK, recordYenTally(session, BOOK, { ...TYPED, machine: "", outlay: dec("-1") }), { game: "pachinko", terms: { rentedPerThousand: 240, exchangedPerHundred: 27.5 } })
    expect(refused.ok).toBe(false)
    expect(storage.peek(BOOK)?.files[BOOK_SETTINGS_FILE]).toBeUndefined()
  })
})
