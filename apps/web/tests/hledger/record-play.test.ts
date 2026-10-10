import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { ACTIVITY_LOG, activityOfText } from "../../src/core/activity/activity"
import { loadOverview } from "../../src/application/overview"
import { loadActivity } from "../../src/application/activity"
import { loadPlay } from "../../src/application/plays"
import { recordPlay, recordTalliedPlay } from "../../src/application/record-play"
import type { BookId } from "../../src/core/book/book"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { toPlainString } from "../../src/core/decimal/decimal"
import { BOOK_FILES } from "../../src/core/journal/layout"
import type { ParlorId } from "../../src/core/parlor/parlor"
import type { PlayId, TalliedPlay } from "../../src/core/play/play"
import { mapOk } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"
import { RENTED_PLAY, dec, saidIn } from "../support/values"

const BOOK = "record" as BookId

const setUp = async (role: "owner" | "viewer") => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  await storage.createBook(await fixtureBook("basic-play", { id: BOOK, members: [{ id: ME, displayName: "me", role }] }))
  const session = createBookSession({
    hledger: await inProcessHledger(),
    storage,
    history,
    clock: () => new Date("2026-10-04T20:00:00+09:00"),
    newId: () => crypto.randomUUID(), member: ME,
  })
  return { storage, history, session }
}

const TODAY_PLAY = { ...RENTED_PLAY, id: "today" as PlayId, date: "2026-10-04" as IsoDate }

describe("recording a play", () => {
  test("is written as one entry that hledger reads, and moves the figures it should", async () => {
    const { session, storage } = await setUp("owner")
    const recorded = await recordPlay(session, BOOK, TODAY_PLAY)
    expect(recorded.ok).toBe(true)
    expect(storage.peek(BOOK)?.files[BOOK_FILES.transactions]).toContain("2026-10-04 ホシゾラ梅田店 流星 123番台  ; play-id: today,")
    const overview = await loadOverview(session, BOOK, "date:2026-10-04")
    expect(mapOk(overview, (found) => [toPlainString(found.actual), toPlainString(found.theoretical)])).toEqual({
      ok: true,
      value: ["4800", "5500"],
    })
  })

  test("leaves one commit saying what was done", async () => {
    const { session, history } = await setUp("owner")
    await recordPlay(session, BOOK, TODAY_PLAY)
    const activity = await loadActivity(session, history, BOOK)
    expect(mapOk(activity, (found) => found.lines.map((line) => [line.did, saidIn(line.parts)]))).toEqual({
      ok: true,
      value: [["play-recorded", { play: { id: "today" as PlayId, description: "ホシゾラ梅田店 流星 123番台" }, theoretical: { value: dec("5500") } }]],
    })
  })

  test("is written in the book's activity log in the same commit, after what the history says was done before", async () => {
    const { session, storage, history } = await setUp("owner")
    const before = await history.commit({ bookId: BOOK, author: ME, at: "2026-10-01T00:00:00.000Z", intent: { type: "book-created" }, files: [] })
    expect(storage.peek(BOOK)?.files[ACTIVITY_LOG]).toBeUndefined()
    await recordPlay(session, BOOK, TODAY_PLAY)
    const held = activityOfText(storage.peek(BOOK)?.files[ACTIVITY_LOG] ?? "")
    expect(held.map((line) => line.did)).toEqual(["book-created", "play-recorded"])
    expect<string | undefined>(held[0]?.id).toBe(before.ok ? before.value : "")
    const log = await history.log(BOOK)
    expect(log.ok && log.value[0]?.change.files.map((patch) => patch.path)).toContain(ACTIVITY_LOG)
    expect(log.ok && log.value[0]?.change.at).toBe(held[1]?.at ?? "")
    await recordPlay(session, BOOK, { ...TODAY_PLAY, id: "again" as PlayId })
    expect(activityOfText(storage.peek(BOOK)?.files[ACTIVITY_LOG] ?? "").map((line) => line.did)).toEqual(["book-created", "play-recorded", "play-recorded"])
  })

  test("that hledger refuses writes nothing", async () => {
    const { session, storage } = await setUp("owner")
    const before = storage.peek(BOOK)?.files
    const nowhere = { identity: { type: "listed" as const, id: "nowhere" as ParlorId }, name: "未登録店", pools: [{ kind: "ball", tier: "4円" }] as const }
    const refused = await recordPlay(session, BOOK, { ...TODAY_PLAY, parlor: nowhere, rental: undefined, replay: { paidOut: dec("100"), deducted: dec("100") }, payout: dec("0") })
    expect(refused.ok === false && refused.error.type).toBe("journal-rejected")
    expect(storage.peek(BOOK)?.files).toEqual(before as never)
    const overview = await loadOverview(session, BOOK, "date:2026-10")
    expect(overview.ok).toBe(true)
  })

  test("is refused to a member who may only read", async () => {
    const { session, storage } = await setUp("viewer")
    const before = storage.peek(BOOK)?.files
    expect(await recordPlay(session, BOOK, TODAY_PLAY)).toEqual({ ok: false, error: { type: "forbidden", capability: "write" } })
    expect(storage.peek(BOOK)?.files).toEqual(before as never)
  })
})

const TALLIED: TalliedPlay = {
  id: "tally" as PlayId,
  date: "2026-10-04" as IsoDate,
  parlor: undefined,
  gameKind: "slot",
  machine: "スマスロ流星",
  cabinetNumber: undefined,
  result: dec("-12000"),
  theoreticalValue: dec("8000"),
}

describe("adding a play by its totals", () => {
  test("counts its result as actual, and keeps its theoretical value apart", async () => {
    const { session } = await setUp("owner")
    const written = await recordTalliedPlay(session, BOOK, TALLIED)
    expect(written).toEqual({ ok: true, value: expect.anything() })
    const overview = await loadOverview(session, BOOK, "date:2026-10-04")
    expect(
      mapOk(overview, (found) => [toPlainString(found.actual), toPlainString(found.theoretical)]),
    ).toEqual({ ok: true, value: ["-12000", "8000"] })
    const play = await loadPlay(session, BOOK, "tally" as PlayId)
    expect(mapOk(play, (found) => [found.summary.machine, found.summary.parlorId, found.summary.theoreticalValue])).toEqual({
      ok: true,
      value: ["スマスロ流星", undefined, dec("8000")],
    })
  })

  test("an even result with nothing else written is still a play hledger reads", async () => {
    const { session } = await setUp("owner")
    const even = { ...TALLIED, result: dec("0"), theoreticalValue: undefined }
    expect((await recordTalliedPlay(session, BOOK, even)).ok).toBe(true)
    const play = await loadPlay(session, BOOK, "tally" as PlayId)
    expect(mapOk(play, (found) => toPlainString(found.actual))).toEqual({ ok: true, value: "0" })
  })

  test("leaves the savings where they were", async () => {
    const { session } = await setUp("owner")
    const before = await loadOverview(session, BOOK, "")
    await recordTalliedPlay(session, BOOK, TALLIED)
    const after = await loadOverview(session, BOOK, "")
    expect(mapOk(after, (found) => toPlainString(found.savings))).toEqual(mapOk(before, (found) => toPlainString(found.savings)))
  })
})
