import { Database as Sqlite } from "bun:sqlite"
import { readdir, readFile } from "node:fs/promises"

import { analyze, initSync, normalize } from "@p-lens/pachinko-engine/pachinko.js"
import { analyze as analyzePachislot, initSync as initPachislotSync, normalize as normalizePachislot } from "@p-lens/pachislot-engine/pachislot.js"
import { formatUuidV7 } from "@p-lens/uuidv7"

import { handle } from "../../src/app"
import { byDevice } from "../../src/infrastructure/auth"
import type { Database, Statement } from "../../src/infrastructure/database"
import { type Effects, runtimeEffects } from "../../src/infrastructure/effects"
import * as PachinkoEngine from "../../src/infrastructure/pachinko/engine"
import type { Quotas } from "../../src/domain/quota"
import type { HumanCheck } from "../../src/infrastructure/human-check"
import type { Limits } from "../../src/infrastructure/limits"
import type { OriginPolicy } from "../../src/infrastructure/origins"
import * as PachislotEngine from "../../src/infrastructure/pachislot/engine"

const ROOT = new URL("../../../../", import.meta.url).pathname

/** A statement SQLite can run now, kept for running later inside a batch's transaction. */
interface SqliteStatement extends Statement {
  readonly runNow: () => unknown
}

/** SQLite standing in for D1: the same SQL, run against the same migrations, a batch as one transaction. */
const sqliteDatabase = (sqlite: Sqlite): Database => {
  const statement = (query: string, values: readonly unknown[]): SqliteStatement => ({
    bind: (...bound) => statement(query, bound),
    all: async <T>() => ({ results: sqlite.query(query).all(...(values as never[])) as T[] }),
    first: async <T>() => (sqlite.query(query).get(...(values as never[])) as T | null) ?? null,
    run: async () => sqlite.query(query).run(...(values as never[])),
    runNow: () => sqlite.query(query).run(...(values as never[])),
  })
  return {
    prepare: (query) => statement(query, []),
    batch: async (statements) => sqlite.transaction(() => statements.map((each) => (each as SqliteStatement).runNow()))(),
  }
}

export const freshDatabase = async (): Promise<{ readonly database: Database; readonly sqlite: Sqlite }> => {
  const sqlite = new Sqlite(":memory:")
  sqlite.exec("PRAGMA foreign_keys = ON")
  const migrations = (await readdir(`${ROOT}db/migrations/`)).filter((name) => name.endsWith(".sql")).toSorted()
  for (const migration of migrations) sqlite.exec(await readFile(`${ROOT}db/migrations/${migration}`, "utf8"))
  return { database: sqliteDatabase(sqlite), sqlite }
}

/** Ids from a counting clock, so a test's ids are distinct, ordered and repeatable. */
export const countingEffects = (): Effects => {
  const clock = { millis: 1_759_500_000_000 }
  return {
    newId: () => {
      clock.millis += 1
      const made = formatUuidV7(clock.millis, new Uint8Array(10))
      if (!made.ok) throw new Error("the test clock left the UUIDv7 range")
      return made.value
    },
    now: () => new Date(clock.millis).toISOString(),
    contentHash: runtimeEffects.contentHash,
  }
}

export const realPachinkoEngine = async (): Promise<PachinkoEngine.Engine> => {
  initSync({ module: await readFile(`${ROOT}packages/pachinko-engine/pachinko_bg.wasm`) })
  return PachinkoEngine.engineThrough(normalize, analyze)
}

export const realPachislotEngine = async (): Promise<PachislotEngine.Engine> => {
  initPachislotSync({ module: await readFile(`${ROOT}packages/pachislot-engine/pachislot_bg.wasm`) })
  return PachislotEngine.engineThrough(normalizePachislot, analyzePachislot)
}

/** A pachinko fixture's file, parsed. */
export const pachinkoFixture = async (name: string, file: string): Promise<any> =>
  JSON.parse(await readFile(`${ROOT}packages/contracts/fixtures/pachinko/${name}/${file}`, "utf8"))

/** A pachislot fixture's file, parsed. */
export const pachislotFixture = async (name: string, file: string): Promise<any> =>
  JSON.parse(await readFile(`${ROOT}packages/contracts/fixtures/pachislot/${name}/${file}`, "utf8"))

/** A device's own id, as the web app makes one: a UUIDv7. */
export const device = (millis: number): string => {
  const made = formatUuidV7(millis, new Uint8Array(10).fill(millis % 251))
  if (!made.ok) throw new Error("a test device id left the UUIDv7 range")
  return made.value
}

export interface Api {
  readonly call: (method: string, path: string, options?: { readonly as?: string; readonly body?: unknown; readonly origin?: string; readonly site?: string; readonly headers?: Readonly<Record<string, string>> }) => Promise<{ readonly status: number; readonly body: any; readonly headers: Headers }>
  readonly sqlite: Sqlite
}

/** The whole API over a fresh database, called as HTTP, each write as the device named by `as`, from the page `origin` if one is named. */
/** What a test's API is set up with beyond the database and the engines: by default, open to any page and unlimited. */
export interface Setup {
  readonly origins: OriginPolicy
  readonly basePath: string
  readonly adminToken: string | undefined
  readonly limits: Limits
  readonly humanCheck: HumanCheck
  readonly quotas: Quotas | undefined
  readonly effects: Effects
}

const OPEN: Omit<Setup, "effects"> = { origins: { type: "any" }, basePath: "", adminToken: undefined, limits: async () => true, humanCheck: async () => true, quotas: undefined }

export const api = async (setup: Partial<Setup> = {}): Promise<Api> => {
  const { database, sqlite } = await freshDatabase()
  const pachinkoEngine = await realPachinkoEngine()
  const pachislotEngine = await realPachislotEngine()
  const ports = { database, effects: countingEffects(), pachinkoEngine: () => pachinkoEngine, pachislotEngine: () => pachislotEngine, authenticate: byDevice, ...OPEN, ...setup }
  return {
    sqlite,
    call: async (method, path, options = {}) => {
      const response = await handle(
        new Request(`https://api.test${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(options.as === undefined ? {} : { "X-P-Lens-Device": options.as }),
            ...(options.origin === undefined ? {} : { Origin: options.origin }),
            ...(options.site === undefined ? {} : { "Sec-Fetch-Site": options.site }),
            ...options.headers,
          },
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        }),
        ports,
      )
      const text = await response.text()
      return { status: response.status, body: text === "" ? undefined : JSON.parse(text), headers: response.headers }
    },
  }
}

/** Every formula of a machine, as the API lists them. */
export const formulasOf = async (client: Api, machineId: string): Promise<readonly any[]> => (await client.call("GET", `/machines/${machineId}`)).body.formulas

/** How many rows a table holds. */
export const countOf = (client: Api, table: string): number => (client.sqlite.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
