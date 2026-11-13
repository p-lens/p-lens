import { describe, expect, test } from "bun:test"

import { loadActivity } from "../../src/application/activity"
import { createBookSession } from "../../src/application/book-session"
import { loadOverall } from "../../src/application/overall"
import { pruneEveryBookActivity } from "../../src/application/prune-activity"
import { restoreTally } from "../../src/application/restore-tally"
import { removeTally } from "../../src/application/revise-tally"
import { restorableRemovals } from "../../src/core/activity/removed-tally"
import type { ActivityId } from "../../src/core/activity/activity"
import type { BookId } from "../../src/core/book/book"
import { toPlainString } from "../../src/core/decimal/decimal"
import type { PlayId } from "../../src/core/play/play"
import { mapOk } from "../../src/core/result/result"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage, FIXTURE_TRANSACTIONS } from "../support/in-process"

const BOOK = "restore" as BookId
const OTHER = "other" as BookId
const PLAY = "made-up-0912" as PlayId

const setUp = async (books: readonly BookId[] = [BOOK]) => {
  const storage = memoryStorage()
  const history = createMemoryHistory(() => crypto.randomUUID())
  const clock = { now: "2026-10-04T20:00:00+09:00" }
  await Promise.all(books.map(async (id) => storage.createBook(await fixtureBook("basic-play", { id, members: [{ id: ME, displayName: "me", role: "owner" }] }))))
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history, clock: () => new Date(clock.now), newId: () => crypto.randomUUID(), member: ME })
  const figures = async () => mapOk(await loadOverall(session, BOOK, "date:2026-09"), (found) => [toPlainString(found.actual), toPlainString(found.theoretical)])
  const lines = async () => {
    const found = await loadActivity(session, history, BOOK)
    if (!found.ok) throw new Error("the activity should load")
    return found.value.lines
  }
  const removal = async (): Promise<ActivityId> => {
    const line = (await lines()).find((each) => each.did === "play-removed")
    if (line === undefined) throw new Error("the removal should be told of")
    return line.id
  }
  return { storage, session, clock, figures, lines, removal }
}

describe("taking a tally's removal back", () => {
  test("puts its entry back as it was, so the book comes to what it did, and tells of it, leaving nothing more to take back", async () => {
    const { storage, session, figures, lines, removal } = await setUp()
    const before = await figures()
    const written = storage.peek(BOOK)?.files[FIXTURE_TRANSACTIONS] ?? ""
    expect((await removeTally(session, BOOK, PLAY)).ok).toBe(true)
    expect(await figures()).not.toEqual(before)
    expect([...restorableRemovals(await lines())]).toEqual([await removal()])
    expect((await restoreTally(session, BOOK, await removal())).ok).toBe(true)
    expect(await figures()).toEqual(before)
    expect((storage.peek(BOOK)?.files[FIXTURE_TRANSACTIONS] ?? "").split("\n").toSorted()).toEqual(written.split("\n").toSorted())
    expect((await lines()).map((line) => line.did).slice(0, 2)).toEqual(["play-restored", "play-removed"])
    expect(restorableRemovals(await lines()).size).toBe(0)
    expect(await restoreTally(session, BOOK, await removal())).toEqual({ ok: false, error: { type: "removal-restored", title: "サンプル帳簿", here: true } })
  })

  test("is refused where another of the person's books holds a tally of the play, as one moved there would", async () => {
    const { session, removal } = await setUp([BOOK, OTHER])
    expect((await removeTally(session, BOOK, PLAY)).ok).toBe(true)
    expect(await restoreTally(session, BOOK, await removal())).toEqual({ ok: false, error: { type: "removal-restored", title: "サンプル帳簿", here: false } })
  })

  test("is refused once the removal's line is older than its changes are kept", async () => {
    const { session, clock, lines, removal } = await setUp()
    expect((await removeTally(session, BOOK, PLAY)).ok).toBe(true)
    clock.now = "2027-02-01T00:00:00+09:00"
    expect((await pruneEveryBookActivity({ session, member: ME, now: () => clock.now })).ok).toBe(true)
    expect(restorableRemovals(await lines()).size).toBe(0)
    expect(await restoreTally(session, BOOK, await removal())).toEqual({ ok: false, error: { type: "removal-unrestorable" } })
  })
})
