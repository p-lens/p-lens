import { Database as Sqlite } from "bun:sqlite"
import { readFile } from "node:fs/promises"

import { RELAY_LIMITS } from "@p-lens/contracts/relay"
import { describe, expect, test } from "bun:test"

import type { Limits } from "../src/limits"
import { BUCKETS, bucketOf, placedIn } from "../src/placing"
import { type Database, handle, letGoOfIdleLines, type Origins, type Ports, type Statement } from "../src/relay"

interface SqliteStatement extends Statement {
  readonly runNow: () => unknown
}

/** SQLite standing in for D1: the same SQL against the same migration, a batch as one transaction. */
const sqliteDatabase = (sqlite: Sqlite): Database => {
  const statement = (query: string, values: readonly unknown[]): SqliteStatement => ({
    bind: (...bound) => statement(query, bound),
    all: async <T>() => ({ results: sqlite.query(query).all(...(values as never[])) as T[] }),
    first: async <T>() => (sqlite.query(query).get(...(values as never[])) as T | null) ?? null,
    runNow: () => sqlite.query(query).run(...(values as never[])),
  })
  return {
    prepare: (query) => statement(query, []),
    batch: async (statements) => sqlite.transaction(() => statements.map((each) => (each as SqliteStatement).runNow()))(),
  }
}

const LINE = "line-0123456789abcdef"
const TOKEN = "token-0123456789abcdef"
const BEGUN = "2026-10-07T00:00:00.000Z"
const commit = (n: number) => ({ commitId: `commit-${String(n).padStart(12, "0")}`, box: `sealed-${n}` })

/** Limits that let everything by. */
const unlimited: Limits = async () => true

/** Limits that let each bucket be asked so many times a key, and count what they were asked. */
const limitedTo = (most: Readonly<Record<"read" | "write" | "bulk", number>>): Limits & { readonly asked: () => readonly string[] } => {
  const held: { asked: readonly string[] } = { asked: [] }
  const limits: Limits = async (bucket, key) => {
    held.asked = [...held.asked, `${bucket}:${key}`]
    return held.asked.filter((each) => each === `${bucket}:${key}`).length <= most[bucket]
  }
  return Object.assign(limits, { asked: () => held.asked })
}

const MIGRATIONS = ["0001_lines.sql", "0002_line_use.sql", "0003_grants.sql", "0004_owners_kept.sql", "0005_line_keep.sql"]

/** A database as a relay's is, every migration run. */
const migrated = async (): Promise<Sqlite> => {
  const sqlite = new Sqlite(":memory:")
  for (const migration of MIGRATIONS) sqlite.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url).pathname, "utf8"))
  return sqlite
}

const relay = async (origins: Origins = { type: "any" }, limits: Limits = unlimited, databases?: Ports["databases"]) => {
  const held: { now: string } = { now: BEGUN }
  const ports: Ports = { databases: databases ?? placedIn({ DB: sqliteDatabase(await migrated()) }, { home: "DB", moved: {} }), origins, limits, now: () => held.now }
  const ask = async (method: string, path: string, options: { readonly token?: string | undefined; readonly body?: unknown; readonly origin?: string; readonly from?: string } = {}) => {
    const token = "token" in options ? options.token : TOKEN
    const response = await handle(
      new Request(`https://relay.test${path}`, {
        method,
        headers: {
          ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
          ...(options.origin === undefined ? {} : { Origin: options.origin }),
          ...(options.from === undefined ? {} : { "CF-Connecting-IP": options.from }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      }),
      ports,
    )
    const text = await response.text()
    return { status: response.status, body: text === "" ? undefined : JSON.parse(text), headers: response.headers }
  }
  return Object.assign(ask, {
    at: (now: string): void => {
      held.now = now
    },
    letGoOfIdleLines: () => letGoOfIdleLines(ports),
  })
}

describe("a line on the relay", () => {
  test("is made by its first commits, and read back in the order they were taken", async () => {
    const call = await relay()
    expect((await call("GET", `/lines/${LINE}/entries`)).body).toEqual({ error: { type: "line-missing" } })
    expect((await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [commit(1), commit(2)] } })).body).toEqual({ head: 2, begunAt: BEGUN })
    expect((await call("POST", `/lines/${LINE}/entries`, { body: { after: 2, entries: [commit(3)] } })).body).toEqual({ head: 3, begunAt: BEGUN })
    expect((await call("GET", `/lines/${LINE}/entries?after=1`)).body).toEqual({ head: 3, begunAt: BEGUN, entries: [{ seq: 2, ...commit(2) }, { seq: 3, ...commit(3) }] })
  })

  test("takes commits only from a device that has every entry before them", async () => {
    const call = await relay()
    await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [commit(1)] } })
    const late = await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [commit(2)] } })
    expect([late.status, late.body]).toEqual([409, { error: { type: "behind", head: 1 } }])
    expect((await call("POST", `/lines/${LINE}/entries`, { body: { after: 5, entries: [commit(2)] } })).body).toEqual({ error: { type: "behind", head: 1 } })
    expect((await call("GET", `/lines/${LINE}/entries`)).body.head).toBe(1)
  })

  test("has a commit once: sent again, it is behind, and nothing of the batch is kept", async () => {
    const call = await relay()
    await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [commit(1)] } })
    expect((await call("POST", `/lines/${LINE}/entries`, { body: { after: 1, entries: [commit(2), commit(1)] } })).body).toEqual({ error: { type: "behind", head: 1 } })
  })

  test("is read and added to only with the token that made it", async () => {
    const call = await relay()
    await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [commit(1)] } })
    const other = "another-0123456789abcdef"
    expect((await call("GET", `/lines/${LINE}/entries`, { token: other })).status).toBe(401)
    expect((await call("POST", `/lines/${LINE}/entries`, { token: other, body: { after: 1, entries: [commit(2)] } })).status).toBe(401)
    expect((await call("GET", `/lines/${LINE}/entries`, { token: undefined })).status).toBe(401)
    expect((await call("GET", `/lines/${LINE}/entries`)).body.head).toBe(1)
  })

  test("refuses what is not a batch of sealed commits, or too much of one", async () => {
    const call = await relay()
    expect((await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [] } })).body).toEqual({ error: { type: "invalid", field: "entries" } })
    expect((await call("POST", `/lines/${LINE}/entries`, { body: { after: -1, entries: [commit(1)] } })).body).toEqual({ error: { type: "invalid", field: "after" } })
    const long = { commitId: commit(1).commitId, box: "x".repeat(RELAY_LIMITS.boxLength + 1) }
    expect((await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [long] } })).status).toBe(413)
    expect((await call("GET", "/elsewhere")).status).toBe(404)
  })

  test("answers only the pages it serves, where it names any", async () => {
    const call = await relay({ type: "only", origins: ["https://app.example"] })
    expect((await call("GET", `/lines/${LINE}/entries`, { origin: "https://other.example" })).status).toBe(403)
    const ours = await call("GET", `/lines/${LINE}/entries`, { origin: "https://app.example" })
    expect([ours.status, ours.headers.get("Access-Control-Allow-Origin")]).toEqual([404, "https://app.example"])
  })
})

describe("what one address may ask of the relay", () => {
  const large = (n: number) => ({ commitId: commit(n).commitId, box: "x".repeat(RELAY_LIMITS.smallBodyBytes) })
  const ANOTHER_LINE = "line-fedcba9876543210"

  test("so many readings, and no more until the while is over", async () => {
    const call = await relay({ type: "any" }, limitedTo({ read: 2, write: 9, bulk: 9 }))
    await call("POST", `/lines/${LINE}/entries`, { from: "198.51.100.1", body: { after: 0, entries: [commit(1)] } })
    expect((await call("GET", `/lines/${LINE}/entries`, { from: "198.51.100.1" })).status).toBe(200)
    expect((await call("GET", `/lines/${LINE}/entries`, { from: "198.51.100.1" })).status).toBe(200)
    const third = await call("GET", `/lines/${LINE}/entries`, { from: "198.51.100.1" })
    expect([third.status, third.body]).toEqual([429, { error: { type: "too-many" } }])
  })

  test("so many sendings, and one over the limit puts nothing on the line", async () => {
    const call = await relay({ type: "any" }, limitedTo({ read: 9, write: 2, bulk: 9 }))
    expect((await call("POST", `/lines/${LINE}/entries`, { from: "198.51.100.1", body: { after: 0, entries: [commit(1)] } })).status).toBe(200)
    expect((await call("POST", `/lines/${LINE}/entries`, { from: "198.51.100.1", body: { after: 1, entries: [commit(2)] } })).status).toBe(200)
    expect((await call("POST", `/lines/${LINE}/entries`, { from: "198.51.100.1", body: { after: 2, entries: [commit(3)] } })).status).toBe(429)
    expect((await call("GET", `/lines/${LINE}/entries`, { from: "198.51.100.1" })).body.head).toBe(2)
  })

  test("each address by its own count", async () => {
    const call = await relay({ type: "any" }, limitedTo({ read: 9, write: 1, bulk: 9 }))
    expect((await call("POST", `/lines/${LINE}/entries`, { from: "198.51.100.1", body: { after: 0, entries: [commit(1)] } })).status).toBe(200)
    expect((await call("POST", `/lines/${LINE}/entries`, { from: "198.51.100.1", body: { after: 1, entries: [commit(2)] } })).status).toBe(429)
    expect((await call("POST", `/lines/${LINE}/entries`, { from: "198.51.100.2", body: { after: 1, entries: [commit(2)] } })).status).toBe(200)
  })

  test("few large sendings, while small ones still go", async () => {
    const limits = limitedTo({ read: 9, write: 9, bulk: 1 })
    const call = await relay({ type: "any" }, limits)
    expect((await call("POST", `/lines/${LINE}/entries`, { from: "198.51.100.1", body: { after: 0, entries: [large(1)] } })).status).toBe(200)
    expect((await call("POST", `/lines/${ANOTHER_LINE}/entries`, { from: "198.51.100.1", body: { after: 0, entries: [large(2)] } })).status).toBe(429)
    expect((await call("POST", `/lines/${LINE}/entries`, { from: "198.51.100.1", body: { after: 1, entries: [commit(2)] } })).status).toBe(200)
    expect(limits.asked().filter((each) => each.startsWith("bulk:"))).toHaveLength(2)
  })

  test("no body longer than one may be, however few its commits", async () => {
    const call = await relay()
    const boxes = Math.ceil(RELAY_LIMITS.bodyBytes / RELAY_LIMITS.boxLength) + 1
    const entries = Array.from({ length: boxes }, (_, index) => ({ commitId: commit(index + 1).commitId, box: "x".repeat(RELAY_LIMITS.boxLength) }))
    const refused = await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries } })
    expect([refused.status, refused.body]).toEqual([413, { error: { type: "too-large" } }])
    expect((await call("GET", `/lines/${LINE}/entries`)).status).toBe(404)
  })

  test("a request that is refused before it is looked at counts against nothing", async () => {
    const limits = limitedTo({ read: 9, write: 9, bulk: 9 })
    const call = await relay({ type: "only", origins: ["https://app.example"] }, limits)
    await call("GET", `/lines/${LINE}/entries`, { origin: "https://other.example", from: "198.51.100.1" })
    await call("GET", `/lines/${LINE}/entries`, { origin: "https://app.example", from: "198.51.100.1", token: undefined })
    expect(limits.asked()).toEqual([])
  })

  test("is kept while it is read or added to, and let go, its commits with it, once it has been left idle", async () => {
    const call = await relay()
    await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [commit(1)] } })
    call.at("2026-10-13T00:00:00.000Z")
    await call("GET", `/lines/${LINE}/entries`)
    call.at("2026-10-19T00:00:00.000Z")
    await call.letGoOfIdleLines()
    expect((await call("GET", `/lines/${LINE}/entries`)).body).toEqual({ head: 1, begunAt: BEGUN, entries: [{ seq: 1, ...commit(1) }] })
    call.at("2026-10-27T00:00:00.000Z")
    await call.letGoOfIdleLines()
    expect((await call("GET", `/lines/${LINE}/entries`)).body).toEqual({ error: { type: "line-missing" } })
    expect((await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [commit(1), commit(2)] } })).body).toEqual({ head: 2, begunAt: "2026-10-27T00:00:00.000Z" })
  })

  test("once let go, is made again only by the token that made it: nobody who knows its id takes it from its owner", async () => {
    const call = await relay()
    const other = "another-0123456789abcdef"
    await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [commit(1)] } })
    await call("POST", `/lines/${LINE}/grants`, { body: { id: "grant-0123456789abcdef", token: other, role: "editor" } })
    call.at("2026-10-27T00:00:00.000Z")
    await call.letGoOfIdleLines()
    expect((await call("POST", `/lines/${LINE}/entries`, { token: other, body: { after: 0, entries: [commit(9)] } })).status).toBe(401)
    expect((await call("GET", `/lines/${LINE}/entries`)).body).toEqual({ error: { type: "line-missing" } })
    expect((await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [commit(1)] } })).body).toEqual({ head: 1, begunAt: "2026-10-27T00:00:00.000Z" })
    expect((await call("GET", `/lines/${LINE}/entries`, { token: other })).status).toBe(401)
    expect((await call("GET", `/lines/${LINE}/grants`)).body).toEqual({ grants: [] })
  })

  test("let go a second time, still answers to its owner alone", async () => {
    const call = await relay()
    const other = "another-0123456789abcdef"
    await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [commit(1)] } })
    call.at("2026-10-27T00:00:00.000Z")
    await call.letGoOfIdleLines()
    await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [commit(1)] } })
    call.at("2026-11-20T00:00:00.000Z")
    await call.letGoOfIdleLines()
    expect((await call("POST", `/lines/${LINE}/entries`, { token: other, body: { after: 0, entries: [commit(9)] } })).status).toBe(401)
    expect((await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [commit(1)] } })).status).toBe(200)
  })

  test("never made, is made by whoever sends its first commits", async () => {
    const call = await relay()
    const other = "another-0123456789abcdef"
    expect((await call("POST", `/lines/${LINE}/entries`, { token: other, body: { after: 0, entries: [commit(1)] } })).status).toBe(200)
    expect((await call("GET", `/lines/${LINE}/entries`)).status).toBe(401)
  })

})

describe("letting others into a line", () => {
  const VIEWER = "viewer-token-0123456789"
  const EDITOR = "editor-token-0123456789"
  const begun = async () => {
    const ask = await relay()
    await ask("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [commit(1)] } })
    return ask
  }

  test("is its owner's alone: a grant is made, listed without its token, and taken away", async () => {
    const ask = await begun()
    expect((await ask("POST", `/lines/${LINE}/grants`, { body: { id: "grant-0000000000001", token: VIEWER, role: "viewer" } })).body).toEqual({ grants: [{ id: "grant-0000000000001", role: "viewer", createdAt: BEGUN }] })
    await ask("POST", `/lines/${LINE}/grants`, { body: { id: "grant-0000000000002", token: EDITOR, role: "editor" } })
    expect((await ask("GET", `/lines/${LINE}/grants`)).body.grants.map((each: { id: string; role: string }) => [each.id, each.role])).toEqual([["grant-0000000000001", "viewer"], ["grant-0000000000002", "editor"]])
    expect([(await ask("GET", `/lines/${LINE}/grants`, { token: EDITOR })).status, (await ask("POST", `/lines/${LINE}/grants`, { token: VIEWER, body: { id: "grant-0000000000003", token: "another-token-0123456789", role: "editor" } })).status]).toEqual([403, 403])
    expect((await ask("DELETE", `/lines/${LINE}/grants/grant-0000000000001`)).body.grants.map((each: { id: string }) => each.id)).toEqual(["grant-0000000000002"])
    expect((await ask("GET", `/lines/${LINE}/grants`, { token: "stranger-token-012345678" })).status).toBe(401)
  })

  test("lets a viewer read and not add, an editor do both, and neither once their grant is gone", async () => {
    const ask = await begun()
    await ask("POST", `/lines/${LINE}/grants`, { body: { id: "grant-0000000000001", token: VIEWER, role: "viewer" } })
    await ask("POST", `/lines/${LINE}/grants`, { body: { id: "grant-0000000000002", token: EDITOR, role: "editor" } })
    expect((await ask("GET", `/lines/${LINE}/entries?after=0`, { token: VIEWER })).body.entries.length).toBe(1)
    expect((await ask("POST", `/lines/${LINE}/entries`, { token: VIEWER, body: { after: 1, entries: [commit(2)] } })).status).toBe(403)
    expect((await ask("POST", `/lines/${LINE}/entries`, { token: EDITOR, body: { after: 1, entries: [commit(2)] } })).body).toEqual({ head: 2, begunAt: BEGUN })
    await ask("DELETE", `/lines/${LINE}/grants/grant-0000000000001`)
    await ask("DELETE", `/lines/${LINE}/grants/grant-0000000000002`)
    expect([(await ask("GET", `/lines/${LINE}/entries?after=0`, { token: VIEWER })).status, (await ask("POST", `/lines/${LINE}/entries`, { token: EDITOR, body: { after: 2, entries: [commit(3)] } })).status]).toEqual([401, 401])
  })

  test("lets a sender add to a line it is never shown: told where the line ends, and nothing of what is on it", async () => {
    const ask = await begun()
    const SENDER = "sender-token-0123456789"
    await ask("POST", `/lines/${LINE}/grants`, { body: { id: "grant-0000000000004", token: SENDER, role: "sender" } })
    expect((await ask("GET", `/lines/${LINE}/entries?after=0`, { token: SENDER })).status).toBe(403)
    expect((await ask("POST", `/lines/${LINE}/entries`, { token: SENDER, body: { after: 0, entries: [commit(2)] } })).body).toEqual({ error: { type: "behind", head: 1 } })
    expect((await ask("POST", `/lines/${LINE}/entries`, { token: SENDER, body: { after: 1, entries: [commit(2)] } })).body).toEqual({ head: 2, begunAt: BEGUN })
    expect((await ask("GET", `/lines/${LINE}/entries?after=1`)).body.entries.map((entry: { commitId: string }) => entry.commitId)).toEqual([commit(2).commitId])
  })

  test("changes a person's role by granting again under their id, and refuses a grant that does not read or a line that is not there", async () => {
    const ask = await begun()
    await ask("POST", `/lines/${LINE}/grants`, { body: { id: "grant-0000000000001", token: VIEWER, role: "viewer" } })
    expect((await ask("POST", `/lines/${LINE}/grants`, { body: { id: "grant-0000000000001", token: VIEWER, role: "editor" } })).body.grants).toEqual([{ id: "grant-0000000000001", role: "editor", createdAt: BEGUN }])
    expect((await ask("POST", `/lines/${LINE}/grants`, { body: { id: "grant-0000000000009", token: VIEWER, role: "owner" } })).body).toEqual({ error: { type: "invalid", field: "role" } })
    expect((await ask("POST", "/lines/line-that-is-not-there-01/grants", { body: { id: "grant-0000000000001", token: VIEWER, role: "viewer" } })).status).toBe(404)
  })
})

describe("how long a line is kept", () => {
  const PLAYS = "plays-0123456789abcdef"
  const madeAs = (keep: unknown) => ({ after: 0, entries: [commit(1)], keep })

  test("a day's plays: let go after three idle days, and its owner not kept, so anyone may make it again", async () => {
    const call = await relay()
    await call("POST", `/lines/${PLAYS}/entries`, { body: madeAs("passing") })
    call.at("2026-10-09T23:00:00.000Z")
    await call.letGoOfIdleLines()
    expect((await call("GET", `/lines/${PLAYS}/entries`)).body.head).toBe(1)
    call.at("2026-10-13T00:00:00.000Z")
    await call.letGoOfIdleLines()
    expect((await call("GET", `/lines/${PLAYS}/entries`)).body).toEqual({ error: { type: "line-missing" } })
    expect((await call("POST", `/lines/${PLAYS}/entries`, { token: "another-0123456789abcdef", body: { after: 0, entries: [commit(1)] } })).status).toBe(200)
  })

  test("a book's: kept past three idle days, let go after seven, and made again by its owner alone", async () => {
    const call = await relay()
    await call("POST", `/lines/${LINE}/entries`, { body: madeAs("lasting") })
    await call("POST", `/lines/${PLAYS}/entries`, { body: madeAs("passing") })
    call.at("2026-10-11T00:00:00.000Z")
    await call.letGoOfIdleLines()
    expect([(await call("GET", `/lines/${LINE}/entries`)).status, (await call("GET", `/lines/${PLAYS}/entries`)).status]).toEqual([200, 404])
    call.at("2026-10-19T00:00:00.000Z")
    await call.letGoOfIdleLines()
    expect((await call("GET", `/lines/${LINE}/entries`)).status).toBe(404)
    expect((await call("POST", `/lines/${LINE}/entries`, { token: "another-0123456789abcdef", body: { after: 0, entries: [commit(1)] } })).status).toBe(401)
  })

  test("is said only by the commits that make the line: said later, it changes nothing", async () => {
    const call = await relay()
    await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [commit(1)] } })
    await call("POST", `/lines/${LINE}/entries`, { body: { after: 1, entries: [commit(2)], keep: "passing" } })
    call.at("2026-10-12T00:00:00.000Z")
    await call.letGoOfIdleLines()
    expect((await call("GET", `/lines/${LINE}/entries`)).body.head).toBe(2)
  })

  test("is a book's where the maker says nothing, or what this relay does not know", async () => {
    const call = await relay()
    const unknown = "plays-fedcba9876543210"
    expect((await call("POST", `/lines/${LINE}/entries`, { body: { after: 0, entries: [commit(1)] } })).status).toBe(200)
    expect((await call("POST", `/lines/${unknown}/entries`, { body: madeAs({ days: 1 }) })).status).toBe(200)
    call.at("2026-10-12T00:00:00.000Z")
    await call.letGoOfIdleLines()
    expect([(await call("GET", `/lines/${LINE}/entries`)).status, (await call("GET", `/lines/${unknown}/entries`)).status]).toEqual([200, 200])
  })
})

describe("the relay's databases", () => {
  test("put a line in the same bucket always, worked out from its id alone, and spread lines over every bucket", () => {
    expect([bucketOf(LINE), bucketOf(LINE), bucketOf("line-fedcba9876543210")]).toEqual([54, 54, 38])
    const buckets = new Set(Array.from({ length: 4096 }, (_, index) => bucketOf(`line-${String(index).padStart(16, "0")}`)))
    expect([...buckets].every((bucket) => Number.isInteger(bucket) && bucket >= 0 && bucket < BUCKETS)).toBe(true)
    expect(buckets.size).toBe(BUCKETS)
  })

  test("keep a line, its grants and its owner in the database its bucket is placed in, and let go of idle lines in each", async () => {
    const home = await migrated()
    const away = await migrated()
    const moved = "line-moved-0123456789"
    const stayed = Array.from({ length: 200 }, (_, index) => `line-${String(index).padStart(16, "0")}`).find((line) => bucketOf(line) !== bucketOf(moved)) ?? LINE
    const databases = placedIn({ HOME: sqliteDatabase(home), AWAY: sqliteDatabase(away) }, { home: "HOME", moved: { [bucketOf(moved)]: "AWAY" } })
    const call = await relay({ type: "any" }, unlimited, databases)
    await call("POST", `/lines/${moved}/entries`, { body: { after: 0, entries: [commit(1)] } })
    await call("POST", `/lines/${stayed}/entries`, { body: { after: 0, entries: [commit(1)] } })
    await call("POST", `/lines/${moved}/grants`, { body: { id: "grant-0000000000001", token: "viewer-token-0123456789", role: "viewer" } })
    const count = (sqlite: Sqlite, table: string) => (sqlite.query(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count
    expect([count(home, "lines"), count(away, "lines"), count(home, "grants"), count(away, "grants")]).toEqual([1, 1, 0, 1])
    expect((await call("GET", `/lines/${moved}/entries`, { token: "viewer-token-0123456789" })).body.head).toBe(1)
    call.at("2026-10-27T00:00:00.000Z")
    await call.letGoOfIdleLines()
    expect([count(home, "lines"), count(away, "lines"), count(home, "owners_kept"), count(away, "owners_kept")]).toEqual([0, 0, 1, 1])
    expect(databases.all).toHaveLength(2)
  })
})
