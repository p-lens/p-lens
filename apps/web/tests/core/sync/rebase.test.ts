import { describe, expect, test } from "bun:test"

import { ACTIVITY_LOG, activityLineOf, activityOfText, withActivity } from "../../../src/core/activity/activity"
import { fileChangesBetween, patchesOf, type JournalChange } from "../../../src/core/change/journal-change"
import type { BookFiles } from "../../../src/core/journal/layout"
import { patchBetween, patched } from "../../../src/core/change/patch"
import { changeOfText, changeText } from "../../../src/core/sync/codec"
import { pairingCode, readPairingCode } from "../../../src/core/sync/pairing"
import { lineFilesOf, rebased, received, type Changing } from "../../../src/core/sync/rebase"

const change = (path: string, before: string | undefined, after: string): { readonly change: JournalChange } => ({
  change: { bookId: "b" as never, author: "me" as never, at: "2026-10-07T00:00:00.000Z", intent: { type: "book-created" }, files: [patchBetween(path, before, after)] },
})

describe("a book and its line", () => {
  test("the line's files are the book's with its unsent commits taken back", () => {
    const unsent = [change("t", "a", "a\nb"), change("t", "a\nb", "a\nb\nc"), change("new", undefined, "x")]
    expect(lineFilesOf({ t: "a\nb\nc", new: "x", other: "o" }, unsent)).toEqual({ ok: true, value: { t: "a", other: "o" } })
  })

  test("files that are not what the unsent commits left have diverged", () => {
    expect(lineFilesOf({ t: "edited by hand" }, [change("t", "a", "a\nb")])).toEqual({ ok: false, error: { type: "diverged", path: "t" } })
  })

  test("commits received are made in order, each from what the last left", () => {
    expect(received({ t: "a" }, [change("t", "a", "a\nb"), change("u", undefined, "new")])).toEqual({ ok: true, value: { t: "a\nb", u: "new" } })
    expect(received({ t: "a" }, [change("t", "not a", "x")])).toEqual({ ok: false, error: { type: "line-broken", path: "t" } })
  })

  test("unsent commits are made again on the line, each still its own", () => {
    const made = rebased({ t: "a" }, { t: "a\ntheirs" }, [change("t", "a", "a\nmine"), change("t", "a\nmine", "a\nmine\nmore")], "stop")
    expect(made.ok && made.value.files).toEqual({ t: "a\ntheirs\nmine\nmore" })
    expect(made.ok && made.value.commits.map((commit) => commit.change.files[0])).toEqual([
      { path: "t", created: false, hunks: [{ at: 2, removed: [], added: ["mine"] }] },
      { path: "t", created: false, hunks: [{ at: 3, removed: [], added: ["more"] }] },
    ])
  })

  test("a line both rewrote is a conflict, named by its file", () => {
    expect(rebased({ t: "a" }, { t: "theirs" }, [change("t", "a", "mine")], "stop")).toEqual({ ok: false, error: { type: "conflict", path: "t" } })
  })

  test("a figure changed in the middle of an entry is made again beside what the line added and changed elsewhere", () => {
    const base = "2026-10-01 play\n    cash  -1000 JPY\n    rent  1000 JPY\n\n2026-10-02 other\n    cash  -500 JPY\n    rent  500 JPY"
    const mine = base.replace("-1000 JPY", "-1200 JPY").replace("rent  1000 JPY", "rent  1200 JPY")
    const theirs = `${base.replace("-500 JPY", "-700 JPY")}\n\n2026-10-03 new\n    cash  -1 JPY\n    rent  1 JPY`
    const made = rebased({ t: base }, { t: theirs }, [change("t", base, mine)], "stop")
    expect(made.ok && made.value.files["t"]).toBe(theirs.replace("-1000 JPY", "-1200 JPY").replace("rent  1000 JPY", "rent  1200 JPY"))
    expect(made.ok && made.value.commits[0]?.change.files[0]?.hunks).toEqual([{ at: 1, removed: ["    cash  -1000 JPY", "    rent  1000 JPY"], added: ["    cash  -1200 JPY", "    rent  1200 JPY"] }])
  })

  test("made again yielding, a commit lets the line's stand where both rewrote, and keeps the rest of what it did", () => {
    const base = "title: a\nentry"
    const made = rebased({ t: base }, { t: "title: theirs\nentry" }, [change("t", base, "title: mine\nentry\nmine appended")], "yield")
    expect(made.ok && made.value.files).toEqual({ t: "title: theirs\nentry\nmine appended" })
  })

  test("the same figure changed on both, each its own way, is a conflict", () => {
    const base = "2026-10-01 play\n    cash  -1000 JPY\n    rent  1000 JPY"
    expect(rebased({ t: base }, { t: base.replace("-1000", "-1100") }, [change("t", base, base.replace("-1000", "-1200"))], "stop")).toEqual({ ok: false, error: { type: "conflict", path: "t" } })
  })
})

describe("what a change did to a file", () => {
  const long = Array.from({ length: 5_000 }, (_, index) => `line ${index}`).join("\n")

  test("is the lines it replaced, however long the file", () => {
    expect(patchBetween("t", long, `${long}\nnew entry`)).toEqual({ path: "t", created: false, hunks: [{ at: 5_000, removed: [], added: ["new entry"] }] })
    expect(patchBetween("t", long, long.replace("line 2500", "changed")).hunks).toEqual([{ at: 2_500, removed: ["line 2500"], added: ["changed"] }])
    expect(patchBetween("t", undefined, "a\nb")).toEqual({ path: "t", created: true, hunks: [{ at: 0, removed: [], added: ["a", "b"] }] })
  })

  test("is made on the text it was written against, and on no other", () => {
    const patch = patchBetween("t", "a\nb\nc", "a\nB\nc\nd")
    expect(patched("a\nb\nc", patch)).toEqual({ ok: true, value: "a\nB\nc\nd" })
    expect(patched("a\nx\nc", patch)).toEqual({ ok: false, error: { type: "patch-misfit", path: "t" } })
    expect(patched(undefined, patch)).toEqual({ ok: false, error: { type: "patch-misfit", path: "t" } })
  })
})

describe("a change as it travels", () => {
  test("comes back as it left, a decimal's digits and all", () => {
    const sent: JournalChange = {
      bookId: "b" as never,
      author: "me" as never,
      at: "2026-10-07T00:00:00.000Z",
      intent: { type: "play-recorded", playId: "p" as never, description: "流星", theoreticalValue: { mantissa: -123456789012345678901234567890n, places: 2 } },
      files: [patchBetween("transactions.journal", "a\nb", "a\nB\nc"), patchBetween("logs/p.jsonl", undefined, "{}")],
    }
    expect(changeOfText(changeText(sent))).toEqual({ ok: true, value: sent })
  })

  test("text that is not a change is refused", () => {
    expect(changeOfText("{")).toEqual({ ok: false, error: { type: "unreadable-change" } })
    expect(changeOfText(JSON.stringify({ bookId: "b", files: "no" }))).toEqual({ ok: false, error: { type: "unreadable-change" } })
    const whole = { bookId: "b", author: "me", at: "t", intent: { type: "book-created" }, files: [{ path: "t", before: "a", after: "b" }] }
    expect(changeOfText(JSON.stringify(whole))).toEqual({ ok: false, error: { type: "unreadable-change" } })
  })
})

describe("a pairing code", () => {
  const secret = "A".repeat(43)

  test("is the line's secret and names no relay, read back however it was pasted", () => {
    expect(pairingCode(secret)).toBe(secret)
    expect(readPairingCode(`  ${secret}\n`)).toEqual({ ok: true, value: secret })
  })

  test("anything else is not one", () => {
    expect(readPairingCode("hello")).toEqual({ ok: false, error: { type: "not-a-pairing-code" } })
    expect(readPairingCode(`https://relay.example#${secret}`)).toEqual({ ok: false, error: { type: "not-a-pairing-code" } })
    expect(readPairingCode("short")).toEqual({ ok: false, error: { type: "not-a-pairing-code" } })
  })
})

describe("a commit that wrote a line of the book's activity, made again", () => {
  /** A write as the session makes one: the files it leaves, its line among them, and its commit. */
  const written = (files: BookFiles, id: string, next: BookFiles): { readonly files: BookFiles; readonly commit: Changing } => {
    const told = { bookId: "b" as never, author: "me" as never, at: `2026-10-07T00:00:0${id}.000Z`, intent: { type: "file-edited", path: "t" } } as const
    const kept = withActivity(next, [], activityLineOf(id, { ...told, files: patchesOf(fileChangesBetween(files, next)) }))
    return { files: kept, commit: { change: { ...told, files: patchesOf(fileChangesBetween(files, kept)) } } }
  }
  const replayed = (files: BookFiles): unknown =>
    received({}, activityOfText(files[ACTIVITY_LOG] ?? "").map((line) => ({ change: { files: line.parts.changes?.files ?? [] } }) as Changing))
  const without = (files: BookFiles): BookFiles => Object.fromEntries(Object.entries(files).filter(([path]) => path !== ACTIVITY_LOG))

  test("has its line told what it does now, so the activity made in order from nothing still leaves the book", () => {
    const base = written({}, "1", { t: "a\nb\nc" })
    const theirs = written(base.files, "2", { ...base.files, t: "theirs\na\nb\nc" })
    const mine = written(base.files, "3", { ...base.files, t: "a\nb\nc\nmine", u: "new" })
    const made = rebased(base.files, theirs.files, [mine.commit], "stop")
    if (!made.ok) throw new Error("the commit should be made again")
    expect(without(made.value.files)).toEqual({ t: "theirs\na\nb\nc\nmine", u: "new" })
    expect(replayed(made.value.files)).toEqual({ ok: true, value: without(made.value.files) })
    expect(received(theirs.files, made.value.commits)).toEqual({ ok: true, value: made.value.files })
    expect(replayed(mine.files)).toEqual({ ok: true, value: without(mine.files) })
  })
})
