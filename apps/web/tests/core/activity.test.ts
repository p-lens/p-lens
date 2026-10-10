import { describe, expect, test } from "bun:test"

import { ACTIVITY_LOG, activityLineOf, activityOf, activityOfText, retold, withActivity, type ActivityLine } from "../../src/core/activity/activity"
import type { MemberId } from "../../src/core/book/book"
import { fileChangesBetween, patchesOf, type ChangeIntent } from "../../src/core/change/journal-change"
import { patchBetween } from "../../src/core/change/patch"
import type { BookFiles } from "../../src/core/journal/layout"
import type { PlayId } from "../../src/core/play/play"
import { received, type Changing } from "../../src/core/sync/rebase"
import { describeActivity } from "../../src/ui/wording/activity"
import { dec } from "../support/values"

const ME = "me" as MemberId

/** A change's line, for a change the activity tells of. */
const lineOf = (id: string, change: Parameters<typeof activityLineOf>[1]): ActivityLine => {
  const line = activityLineOf(id, change)
  if (line === undefined) throw new Error("the activity should tell of this change")
  return line
}

const CREATED = lineOf("a1", { at: "2026-10-01T10:00:00.000Z", author: ME, intent: { type: "book-created" }, files: [] })
const PLAYED = lineOf("a2", {
  at: "2026-10-04T12:00:00.000Z",
  author: ME,
  intent: { type: "play-recorded", playId: "p1" as PlayId, description: "梅田 流星", theoreticalValue: dec("-1234.5") },
  files: [],
})
const UNWEIGHED = lineOf("a3", { at: "2026-10-05T12:00:00.000Z", author: ME, intent: { type: "play-recorded", playId: "p2" as PlayId, description: "流星", theoreticalValue: undefined }, files: [] })
const RENAMED = lineOf("a4", { at: "2026-10-06T09:00:00.000Z", author: ME, intent: { type: "book-renamed", title: "勝負帳" }, files: [] })
const OPENED = lineOf("a5", { at: "2026-10-07T09:00:00.000Z", author: ME, intent: { type: "savings-opened", parlor: "梅田", tier: "4円" }, files: [] })

const logOf = (...lines: readonly ActivityLine[]): string => lines.reduce<BookFiles>((files, line) => withActivity(files, [], line), {})[ACTIVITY_LOG] ?? ""

describe("a line of a book's activity", () => {
  test("says what a change did as a word and the parts it was done to, each part there or not", () => {
    expect<unknown>(PLAYED).toEqual({ id: "a2", at: "2026-10-04T12:00:00.000Z", by: ME, did: "play-recorded", parts: { play: { id: "p1", description: "梅田 流星" }, theoretical: { value: dec("-1234.5") } } })
    expect<unknown>(UNWEIGHED.parts).toEqual({ play: { id: "p2", description: "流星" } })
    expect([CREATED.parts, RENAMED.parts, OPENED.parts]).toEqual([{}, { book: { title: "勝負帳" } }, { pool: { parlor: "梅田", tier: "4円" } }])
  })

  test("is written with its parts beside its id, when, by whom and what, a decimal as its digits, and reads back as it was", () => {
    const text = logOf(CREATED, PLAYED, UNWEIGHED, RENAMED, OPENED)
    expect(text.split("\n")[1]).toBe('{"v":1,"id":"a2","at":"2026-10-04T12:00:00.000Z","by":"me","did":"play-recorded","play":{"id":"p1","description":"梅田 流星"},"theoretical":{"value":"-1234.5"}}')
    expect(text.endsWith("\n")).toBe(true)
    expect(activityOfText(text)).toEqual([CREATED, PLAYED, UNWEIGHED, RENAMED, OPENED])
  })

  test("is read without a part this app does not know, or one that does not read as itself, and with a word it does not know", () => {
    const text = [
      '{"v":1,"id":"b1","at":"2026-10-08T00:00:00.000Z","by":"me","did":"play-recorded","play":{"id":"p9","description":"流星"},"note":{"text":"あとで見る"},"theoretical":{"value":"lots"}}',
      '{"v":1,"id":"b2","at":"2026-10-09T00:00:00.000Z","by":"me","did":"backed-up","store":{"name":"drive"}}',
      '{"v":1,"id":"b3","at":"2026-10-09T01:00:00.000Z","by":"me","did":"book-renamed"}',
    ].join("\n")
    const lines = activityOfText(text)
    expect<unknown>(lines.map((line) => [line.did, line.parts])).toEqual([["play-recorded", { play: { id: "p9", description: "流星" } }], ["backed-up", {}], ["book-renamed", {}]])
    expect(lines.map(describeActivity)).toEqual(["流星 の稼働を追加", "帳簿を変更", "帳簿を変更"])
  })

  test("is asked about a play, or a parlor, by that part alone, whatever was done", () => {
    const lines = activityOfText(logOf(CREATED, PLAYED, UNWEIGHED, RENAMED, OPENED))
    expect<unknown>(lines.filter((line) => line.parts.play?.id === "p1").map((line) => line.id)).toEqual(["a2"])
    expect(lines.filter((line) => line.parts.pool?.parlor === "梅田").map((line) => line.did)).toEqual(["savings-opened"])
  })
})

describe("a book's activity log", () => {
  test("is given what the book's history says the first time, and only then", () => {
    const first = withActivity({ "main.journal": "" }, [CREATED, PLAYED], RENAMED)
    expect(activityOfText(first[ACTIVITY_LOG] ?? "")).toEqual([CREATED, PLAYED, RENAMED])
    expect(first["main.journal"]).toBe("")
    const second = withActivity(first, [CREATED, PLAYED], UNWEIGHED)
    expect(activityOfText(second[ACTIVITY_LOG] ?? "")).toEqual([CREATED, PLAYED, RENAMED, UNWEIGHED])
  })

  test("passes over a line that does not read or is of another version, and takes a line under an id already read as the one thing done", () => {
    const text = `${logOf(CREATED)}not json\n{"v":1,"at":"2026-10-02T00:00:00.000Z","by":"me","did":"book-created"}\n{"v":1,"id":"x","at":"never","by":"me","did":"book-created"}\n{"v":2,"id":"y","at":"2026-10-02T00:00:00.000Z","by":"me","did":"book-created"}\n{"id":"z","at":"2026-10-02T00:00:00.000Z","by":"me","did":"book-created"}\n${logOf(PLAYED, PLAYED, CREATED)}`
    expect(activityOfText(text)).toEqual([CREATED, PLAYED])
  })

  test("is read newest first, and stood in for by the history where the book keeps none yet", () => {
    expect(activityOf({ [ACTIVITY_LOG]: logOf(PLAYED, CREATED) }, [])).toEqual([PLAYED, CREATED])
    expect(activityOf({ "main.journal": "" }, [CREATED, PLAYED])).toEqual([PLAYED, CREATED])
    expect(activityOf({ [ACTIVITY_LOG]: logOf(RENAMED) }, [CREATED, PLAYED])).toEqual([RENAMED])
  })
})

describe("a press of the heart", () => {
  const kept = { at: "2026-10-08T09:00:00.000Z", author: ME, intent: { type: "favorite-kept", target: "formula", id: "f1" }, files: [] } as const

  test("is not told of in the activity: the book's favourites record it themselves", () => {
    expect(activityLineOf("a9", kept)).toBeUndefined()
    expect(activityLineOf("a9", { ...kept, intent: { ...kept.intent, type: "favorite-let-go" } })).toBeUndefined()
    const held = logOf(CREATED)
    expect(withActivity({ [ACTIVITY_LOG]: held }, [], activityLineOf("a9", kept))).toEqual({ [ACTIVITY_LOG]: held })
  })

  test("still gives a book that keeps no activity yet the log its history makes", () => {
    expect(activityOfText(withActivity({}, [CREATED], activityLineOf("a9", kept))[ACTIVITY_LOG] ?? "")).toEqual([CREATED])
  })
})

/** A book's files once a change is written as the session writes one: the change, and its line saying what it did. */
const written = (files: BookFiles, id: string, intent: ChangeIntent, next: BookFiles): BookFiles =>
  withActivity(next, [], lineOf(id, { at: `2026-10-0${id.slice(1)}T10:00:00.000Z`, author: ME, intent, files: patchesOf(fileChangesBetween(files, next)) }))

/** The files an activity log's lines leave, made in order from nothing. */
const replayed = (log: string): unknown =>
  received({}, activityOfText(log).map((line) => ({ change: { files: line.parts.changes?.files ?? [] } }) as Changing))

describe("what a line says its change did", () => {
  const created = written({}, "a1", { type: "book-created" }, { "main.journal": "; title: 帳簿\n", "transactions.journal": "" })
  const played = written(created, "a2", { type: "play-recorded", playId: "p1" as PlayId, description: "流星", theoreticalValue: undefined }, { ...created, "transactions.journal": "2026-10-02 流星\n", "pachislot-play/p1.jsonl": "{}\n" })
  const renamed = written(played, "a3", { type: "book-renamed", title: "勝負帳" }, { ...played, "main.journal": "; title: 勝負帳\n" })
  const without = (files: BookFiles): BookFiles => Object.fromEntries(Object.entries(files).filter(([path]) => path !== ACTIVITY_LOG))

  test("is every file it touched but the log itself, as the lines replaced, and reads back as written", () => {
    const [, second] = activityOfText(played[ACTIVITY_LOG] ?? "")
    expect(second?.parts.changes).toEqual({ files: [patchBetween("pachislot-play/p1.jsonl", undefined, "{}\n"), patchBetween("transactions.journal", "", "2026-10-02 流星\n")] })
    expect(lineOf("a9", { at: "2026-10-09T10:00:00.000Z", author: ME, intent: { type: "file-edited", path: ACTIVITY_LOG }, files: [patchBetween(ACTIVITY_LOG, "", "x")] }).parts.changes).toBeUndefined()
  })

  test("makes the book again: the lines in order from nothing leave its files as they stand, and the lines up to one as they stood then", () => {
    expect(replayed(renamed[ACTIVITY_LOG] ?? "")).toEqual({ ok: true, value: without(renamed) })
    expect(replayed((renamed[ACTIVITY_LOG] ?? "").split("\n").slice(0, 2).join("\n"))).toEqual({ ok: true, value: without(played) })
  })

  test("is told again for a commit made again, its own line and no other, whatever else the line holds", () => {
    const log = `${(played[ACTIVITY_LOG] ?? "").trimEnd().replace(/}$/, ',"later":{"part":1}}')}\n`
    const added = log.split("\n").slice(1, 2)
    const again = [patchBetween("transactions.journal", "theirs\n", "theirs\n2026-10-02 流星\n")]
    const told = retold(log, added, again)
    expect(told.split("\n")[0]).toBe(log.split("\n")[0] ?? "")
    expect(activityOfText(told)[1]?.parts.changes).toEqual({ files: again })
    expect(told.split("\n")[1]).toContain('"later":{"part":1}')
    expect(retold(log, [], again)).toBe(log)
  })
})
