import { readdir, readFile } from "node:fs/promises"

import { describe, expect, test } from "bun:test"

const ROOT = new URL("../../../", import.meta.url).pathname

/** Where the code of every part lives; the shell is no game's, and its slot is a pane's. */
const SOURCES = ["apps/web/src/", "apps/api/src/", "apps/relay/src/", "packages/contracts/src/", "crates/", "wasm/hledger-bindings/src/"] as const

/** The one place `slot` is said: the reading of a game as books and devices wrote it before pachislot's name was settled. */
const READS_SLOT = "apps/web/src/core/play/play.ts"

const sourcesUnder = async (directory: string): Promise<readonly string[]> =>
  (await readdir(`${ROOT}${directory}`, { recursive: true }))
    .filter((path) => /\.(ts|tsx|rs|hs)$/.test(path))
    .map((path) => `${directory}${path}`)

const saysSlot = (text: string): boolean => /slot/i.test(text.replace(/pachislot/gi, ""))

describe("pachislot is called by its name", () => {
  test("no code calls it a bare slot, but the reading of what was written so before", async () => {
    const files = (await Promise.all(SOURCES.map(sourcesUnder))).flat()
    const texts = await Promise.all(files.map((path) => readFile(`${ROOT}${path}`, "utf8")))
    expect(files.filter((path, index) => path !== READS_SLOT && saysSlot(texts[index] ?? ""))).toEqual([])
  })
})
