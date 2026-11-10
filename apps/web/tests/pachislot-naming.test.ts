import { readdir, readFile } from "node:fs/promises"

import { describe, expect, test } from "bun:test"

const ROOT = new URL("../../../", import.meta.url).pathname

/** Where the code of every part lives; the shell is no game's, and its slot is a pane's. */
const SOURCES = ["apps/web/src/", "apps/api/src/", "packages/contracts/src/", "crates/", "wasm/hledger-bindings/src/"] as const

/**
 * The places `slot` is said: the reading of a game as books and devices
 * wrote it before pachislot's name was settled, and the writing of ぱち簿's
 * own file, whose keys are ぱち簿's words (`hall…_savings_slot`) and not
 * this app's.
 */
const SAYS_SLOT: readonly string[] = ["apps/web/src/core/play/play.ts", "apps/web/src/other-apps/pachibo/pcb-export.ts"]

const sourcesUnder = async (directory: string): Promise<readonly string[]> =>
  (await readdir(`${ROOT}${directory}`, { recursive: true }))
    .filter((path) => /\.(ts|tsx|rs|hs)$/.test(path))
    .map((path) => `${directory}${path}`)

const saysSlot = (text: string): boolean => /slot/i.test(text.replace(/pachislot/gi, ""))

describe("pachislot is called by its name", () => {
  test("no code calls it a bare slot, but the reading of what was written so before", async () => {
    const files = (await Promise.all(SOURCES.map(sourcesUnder))).flat()
    const texts = await Promise.all(files.map((path) => readFile(`${ROOT}${path}`, "utf8")))
    expect(files.filter((path, index) => !SAYS_SLOT.includes(path) && saysSlot(texts[index] ?? ""))).toEqual([])
  })
})
