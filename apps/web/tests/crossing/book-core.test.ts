import { describe, expect, test } from "bun:test"

import type { BookFiles } from "../../src/core/journal/layout"
import { canonicalJson } from "../../src/crossing/core/book/canonical"
import { changeIdOf, readChange, stateDigestOf, type Change, type ChangeId } from "../../src/crossing/core/book/change"
import { ancestryOf, headsOf, mergeBaseOf, missingOf, sinceBase, wholeOf } from "../../src/crossing/core/book/graph"
import { contestedIn, mergeStates, outlineOf, settledText } from "../../src/crossing/core/book/merge"
import { madeOn, patchesBetween, stateOf, takenBack, type Held } from "../../src/crossing/core/book/state"
import { readLineMessage, readSyncCode, readTip, syncCodeText, tipJson } from "../../src/crossing/core/book/wire"

const WRITER = "a".repeat(64)

const unwrapped = <T>(outcome: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown }): T => {
  if (!outcome.ok) throw new Error(`expected ok: ${JSON.stringify(outcome.error)}`)
  return outcome.value
}

const baseOf = (files: BookFiles, at = 1): Change => ({ sort: "base", parents: [], writer: WRITER, at, book: "book-1", files, result: stateDigestOf(files) })

const editOf = (parent: ChangeId, before: BookFiles, after: BookFiles, at = 2): Change => ({ sort: "edit", parents: [parent], writer: WRITER, at, patches: unwrapped(patchesBetween(before, after)), result: stateDigestOf(after) })

/** A line held as changes, each added under its id. */
const line = () => {
  const held = new Map<ChangeId, Change>()
  const add = (change: Change): ChangeId => {
    const id = changeIdOf(change)
    held.set(id, change)
    return id
  }
  return { held: held as Held, add }
}

const JOURNAL = "transactions.journal"

describe("canonical JSON", () => {
  test("keys go in order and nothing else is written", () => {
    expect(canonicalJson({ b: 1, a: [true, null, "x"], c: { z: "", y: 2 } })).toBe('{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":""}}')
  })

  test("a change's id does not hang on the order its keys were written in", () => {
    const change = baseOf({ "main.journal": "x" })
    const shuffled = Object.fromEntries(Object.entries(change).toReversed()) as unknown as Change
    expect(changeIdOf(shuffled)).toBe(changeIdOf(change))
  })
})

describe("reading a change", () => {
  test("a change reads back as it was written, and anything else does not", () => {
    const base = baseOf({ "main.journal": "x" })
    expect(readChange(JSON.parse(JSON.stringify(base)))).toEqual(base)
    expect(readChange({ ...base, extra: 1 })).toBeUndefined()
    expect(readChange({ ...base, writer: "" })).toBeUndefined()
    expect(readChange({ ...base, at: -1 })).toBeUndefined()
    expect(readChange("change")).toBeUndefined()
  })

  test("a merge's parents are in id order, and only a merge may leave its writer empty", () => {
    const [one, other] = ["1".repeat(64), "2".repeat(64)]
    const merge = { sort: "merge", parents: [one, other], writer: "", at: 3, patches: [], result: "f".repeat(64) }
    expect(readChange(merge)).toEqual(merge as unknown as Change)
    expect(readChange({ ...merge, parents: [other, one] })).toBeUndefined()
    expect(readChange({ ...merge, parents: [one, one] })).toBeUndefined()
    expect(readChange({ ...merge, sort: "edit" })).toBeUndefined()
  })

  test("what a patch carries beyond its own fields is let go, so every device hashes the same change", () => {
    const edit = editOf("1".repeat(64) as ChangeId, { [JOURNAL]: "a" }, { [JOURNAL]: "a\nb" })
    const padded = JSON.parse(JSON.stringify(edit)) as { patches: { hunks: Record<string, unknown>[]; note?: string }[] }
    padded.patches[0]!.note = "x"
    padded.patches[0]!.hunks[0]!["note"] = "y"
    expect(readChange(padded)).toEqual(edit)
  })
})

describe("states", () => {
  test("patches taken back give the text they were made on, a file they created going", () => {
    const before = { [JOURNAL]: "a\nb\nc\nd", "main.journal": "m" }
    const after = { [JOURNAL]: "a\nx\ny\nc", "main.journal": "m", "logs/activity.jsonl": "{}" }
    const patches = unwrapped(patchesBetween(before, after))
    expect(unwrapped(madeOn(before, patches))).toEqual(after)
    expect(unwrapped(takenBack(after, patches))).toEqual(before)
  })

  test("a book never loses a file", () => {
    expect(patchesBetween({ a: "1", b: "2" }, { a: "1" })).toEqual({ ok: false, error: { type: "file-removed", path: "b" } })
  })

  test("a state is worked out from its base, or taken back from the known one", () => {
    const { held, add } = line()
    const s0 = { [JOURNAL]: "one" }
    const s1 = { [JOURNAL]: "one\ntwo" }
    const s2 = { [JOURNAL]: "one\ntwo\nthree" }
    const b = add(baseOf(s0))
    const e1 = add(editOf(b, s0, s1))
    const e2 = add(editOf(e1, s1, s2))
    expect(unwrapped(stateOf(held, undefined, e2))).toEqual(s2)
    expect(unwrapped(stateOf(held, { id: e2, files: s2 }, e1))).toEqual(s1)
    expect(unwrapped(stateOf(held, { id: e1, files: s1 }, e2))).toEqual(s2)
  })

  test("a side branch is worked from where it leaves the known chain", () => {
    const { held, add } = line()
    const s0 = { [JOURNAL]: "one" }
    const mine = { [JOURNAL]: "one\nmine" }
    const theirs = { [JOURNAL]: "zero\none" }
    const b = add(baseOf(s0))
    const m = add(editOf(b, s0, mine))
    const t = add(editOf(b, s0, theirs, 3))
    expect(unwrapped(stateOf(held, { id: m, files: mine }, t))).toEqual(theirs)
  })

  test("a change that does not fit what it is made on says where", () => {
    const { held, add } = line()
    const s0 = { [JOURNAL]: "one" }
    const b = add(baseOf(s0))
    const wrong = add(editOf(b, { [JOURNAL]: "other" }, { [JOURNAL]: "changed" }))
    expect(stateOf(held, undefined, wrong)).toEqual({ ok: false, error: { type: "misfit", id: wrong, path: JOURNAL } })
  })

  test("a change whose ancestry is not held says which is missing", () => {
    const { held, add } = line()
    const gone = "9".repeat(64) as ChangeId
    const e = add(editOf(gone, { [JOURNAL]: "a" }, { [JOURNAL]: "b" }))
    expect(stateOf(held, undefined, e)).toEqual({ ok: false, error: { type: "missing", id: gone } })
    expect(missingOf(held)).toEqual([gone])
    expect(wholeOf(held).has(e)).toBe(false)
  })
})

describe("the graph", () => {
  test("heads are the changes nothing names, lowest id first", () => {
    const { held, add } = line()
    const s0 = { [JOURNAL]: "x" }
    const b = add(baseOf(s0))
    const one = add(editOf(b, s0, { [JOURNAL]: "x\n1" }))
    const two = add(editOf(b, s0, { [JOURNAL]: "x\n2" }))
    expect(headsOf(held, wholeOf(held))).toEqual([one, two].toSorted())
    expect(ancestryOf(held, one)).toEqual(new Set([one, b]))
  })

  test("the merge base of a criss-cross is the deeper common ancestor, then the lower id", () => {
    const { held, add } = line()
    const s0 = { [JOURNAL]: "x" }
    const b = add(baseOf(s0))
    const a1 = add(editOf(b, s0, { [JOURNAL]: "x\na" }))
    const b1 = add(editOf(b, s0, { [JOURNAL]: "b\nx" }, 3))
    const both = { [JOURNAL]: "b\nx\na" }
    const [low, high] = [a1, b1].toSorted() as [ChangeId, ChangeId]
    const m1 = add({ sort: "merge", parents: [low, high], writer: "", at: 3, patches: unwrapped(patchesBetween(low === a1 ? { [JOURNAL]: "x\na" } : { [JOURNAL]: "b\nx" }, both)), result: stateDigestOf(both) })
    const m2 = add({ sort: "merge", parents: [low, high], writer: WRITER, at: 4, patches: unwrapped(patchesBetween(low === a1 ? { [JOURNAL]: "x\na" } : { [JOURNAL]: "b\nx" }, both)), result: stateDigestOf(both) })
    expect(mergeBaseOf(held, m1, m2)).toBe(low)
    expect(mergeBaseOf(held, a1, b1)).toBe(b)
  })

  test("what a head carries above its base is counted", () => {
    const { held, add } = line()
    const s0 = { [JOURNAL]: "x" }
    const b = add(baseOf(s0))
    const e = add(editOf(b, s0, { [JOURNAL]: "x\ny" }))
    expect(sinceBase(held, e).changes).toBe(1)
    expect(sinceBase(held, b)).toEqual({ changes: 0, bytes: 0 })
  })
})

describe("merging", () => {
  const ENTRY_A = "2026-11-01 ホール | 台A  ; play-id: p-a\n    資産:現金  -1000\n    費用:遊技"
  const ENTRY_B = "2026-11-02 ホール | 台B  ; play-id: p-b\n    資産:現金  -2000\n    費用:遊技"

  test("entries each side added to a journal are both kept, the first side's first", () => {
    const base = { [JOURNAL]: "2026-10-31 ホール | 台\n    資産:現金  -500\n    費用:遊技" }
    const first = { [JOURNAL]: `${base[JOURNAL]}\n\n${ENTRY_A}` }
    const second = { [JOURNAL]: `${base[JOURNAL]}\n\n${ENTRY_B}` }
    expect(unwrapped(mergeStates(base, first, second))).toEqual({ [JOURNAL]: `${base[JOURNAL]}\n\n${ENTRY_A}\n\n${ENTRY_B}` })
  })

  test("lines each side added to the activity log are both kept", () => {
    const base = { "logs/activity.jsonl": "{\"a\":1}" }
    expect(unwrapped(mergeStates(base, { "logs/activity.jsonl": "{\"a\":1}\n{\"b\":2}" }, { "logs/activity.jsonl": "{\"a\":1}\n{\"c\":3}" }))).toEqual({ "logs/activity.jsonl": "{\"a\":1}\n{\"b\":2}\n{\"c\":3}" })
  })

  test("a play's log added to on both sides is put to a person", () => {
    const path = "pachinko-play/p-a.jsonl"
    expect(mergeStates({ [path]: "1", [JOURNAL]: "j" }, { [path]: "1\n2", [JOURNAL]: "j" }, { [path]: "1\n3", [JOURNAL]: "j\nk" })).toEqual({ ok: false, error: { type: "conflict", files: [{ path, why: "lines" }], merged: { [JOURNAL]: "j\nk" } } })
  })

  test("one line rewritten two ways is put to a person, and a choice settles it", () => {
    const base = { [JOURNAL]: "a\nb\nc" }
    const first = { [JOURNAL]: "a\nB1\nc" }
    const second = { [JOURNAL]: "a\nB2\nc" }
    expect(mergeStates(base, first, second)).toEqual({ ok: false, error: { type: "conflict", files: [{ path: JOURNAL, why: "lines" }], merged: {} } })
    const parts = outlineOf(JOURNAL, base[JOURNAL], first[JOURNAL], second[JOURNAL])
    expect(contestedIn(parts)).toBe(1)
    expect(settledText(parts, ["second"])).toBe("a\nB2\nc")
  })

  test("what both sides did alike is taken once, and what one side did is taken from it", () => {
    const base = { [JOURNAL]: "a\nb", "main.journal": "m" }
    const first = { [JOURNAL]: "a\nb\nc", "main.journal": "m2" }
    const second = { [JOURNAL]: "a\nb\nc", "main.journal": "m" }
    expect(unwrapped(mergeStates(base, first, second))).toEqual({ [JOURNAL]: "a\nb\nc", "main.journal": "m2" })
  })

  test("settings merge key by key, written as the app writes them, and a key set two ways is a conflict", () => {
    const written = (fields: object): string => `${JSON.stringify(fields, undefined, 2)}\n`
    const base = { "settings.json": written({ order: 1 }) }
    expect(unwrapped(mergeStates(base, { "settings.json": written({ order: 2 }) }, { "settings.json": written({ order: 1, businessDayTurn: 6 }) }))).toEqual({ "settings.json": written({ order: 2, businessDayTurn: 6 }) })
    expect(mergeStates(base, { "settings.json": written({ order: 2 }) }, { "settings.json": written({ order: 3 }) })).toEqual({ ok: false, error: { type: "conflict", files: [{ path: "settings.json", why: "keys" }], merged: {} } })
    expect(mergeStates(base, { "settings.json": "{" }, { "settings.json": written({ order: 3 }) }).ok).toBe(false)
  })

  test("one play recorded on both sides is put to a person, though its lines merge", () => {
    const base = { [JOURNAL]: "" }
    const first = { [JOURNAL]: ENTRY_A }
    const second = { [JOURNAL]: ENTRY_A.replace("-1000", "-1500") }
    expect(mergeStates(base, first, second)).toEqual({ ok: false, error: { type: "conflict", files: [{ path: JOURNAL, why: "play-twice" }], merged: {} } })
  })

  test("a journal both sides made is merged as though it had been empty; anything else made twice is a conflict", () => {
    expect(unwrapped(mergeStates({}, { "transactions/2025.journal": ENTRY_A }, { "transactions/2025.journal": ENTRY_B }))).toEqual({ "transactions/2025.journal": `${ENTRY_A}\n${ENTRY_B}` })
    expect(mergeStates({}, { "pachinko-play/x.jsonl": "1" }, { "pachinko-play/x.jsonl": "2" }).ok).toBe(false)
  })
})

describe("the wire", () => {
  test("a sync code reads back whole, and anything else is no code", () => {
    const code = { sync: new Uint8Array(32).fill(1), epoch: new Uint8Array(32).fill(2), relay: "wss://relay.example/0a" }
    expect(readSyncCode(syncCodeText(code))).toEqual(code)
    expect(readSyncCode("p-lens-sync:1:abc:def:wss://x")).toBeUndefined()
    expect(readSyncCode(syncCodeText({ ...code, relay: "https://relay.example" }))).toBeUndefined()
    expect(readSyncCode("p-lens-huddle:2:x")).toBeUndefined()
  })

  test("a tip and a manifest read back, and a change is read only whole", () => {
    const tip = { heads: ["1".repeat(64) as ChangeId], base: { id: "2".repeat(64) as ChangeId, createdAt: 10 }, stamp: 3 }
    expect(readTip(JSON.parse(JSON.stringify(tipJson(tip))))).toEqual(tip)
    expect(readTip({ ...(tipJson(tip) as object), heads: [] })).toBeUndefined()
    expect(readLineMessage({ parts: ["3".repeat(64)], sha256: "4".repeat(64) })).toEqual({ type: "manifest", parts: ["3".repeat(64)], sha256: "4".repeat(64) })
    expect(readLineMessage({ change: baseOf({ a: "b" }) })).toEqual({ type: "change", change: baseOf({ a: "b" }) })
    expect(readLineMessage({ change: { sort: "base" } })).toBeUndefined()
  })
})
