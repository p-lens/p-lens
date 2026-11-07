import { describe, expect, test } from "bun:test"

import { createBookSession } from "../../src/application/book-session"
import { pruneEveryBookActivity } from "../../src/application/prune-activity"
import { ACTIVITY_LOG, activityOfText } from "../../src/core/activity/activity"
import type { BookId, MemberId } from "../../src/core/book/book"
import { createMemoryHistory } from "../../src/history/adapters/memory-history"
import { ME, fixtureBook, inProcessHledger, memoryStorage } from "../support/in-process"

const OTHER = "someone-else" as MemberId

/** A line of a book's activity written at a moment. */
const lineAt = (id: string, at: string): string => `{"v":1,"id":"${id}","at":"${at}","by":"me","did":"book-renamed","book":{"title":"${id}"}}`

const LOG = `${lineAt("old", "2026-08-01T00:00:00.000Z")}\n${lineAt("new", "2026-11-01T00:00:00.000Z")}\n`

const setUp = async () => {
  const storage = memoryStorage()
  const clock = { now: "2026-11-07T00:00:00.000Z" }
  const session = createBookSession({ hledger: await inProcessHledger(), storage, history: createMemoryHistory(() => crypto.randomUUID()), clock: () => new Date(clock.now), newId: () => crypto.randomUUID(), member: ME })
  const fixture = await fixtureBook("basic-play", { id: "a" as BookId, members: [] })
  const add = (id: string, role: "owner" | "viewer") =>
    session.createBook({ book: { id: id as BookId, members: [{ id: role === "owner" ? ME : OTHER, displayName: "owner", role: "owner" }, ...(role === "owner" ? [] : [{ id: ME, displayName: "me", role }])] }, files: { ...fixture.files, [ACTIVITY_LOG]: LOG } })
  await add("mine", "owner")
  await add("seen", "viewer")
  const ids = (id: string): readonly string[] => activityOfText(storage.peek(id as BookId)?.files[ACTIVITY_LOG] ?? "").map((line) => (line.did === "book-created" ? line.did : line.id))
  return { session, clock, ids, ports: { session, member: ME, now: () => clock.now } }
}

describe("pruning every book's activity", () => {
  test("drops what is older than 90 days from each book this member may write, and leaves a book they may only read", async () => {
    const { ports, ids } = await setUp()
    expect(await pruneEveryBookActivity(ports)).toEqual({ ok: true, value: 1 })
    expect(ids("mine")).toEqual(["new", "book-created"])
    expect(ids("seen")).toEqual(["old", "new", "book-created"])
  })

  test("writes nothing where nothing is so old", async () => {
    const { ports, clock, ids } = await setUp()
    clock.now = "2026-10-20T00:00:00.000Z"
    expect(await pruneEveryBookActivity(ports)).toEqual({ ok: true, value: 0 })
    expect(ids("mine")).toEqual(["old", "new", "book-created"])
  })
})
