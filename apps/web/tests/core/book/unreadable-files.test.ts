import { describe, expect, test } from "bun:test"

import { unreadableFilesOf } from "../../../src/core/book/unreadable-files"

const PRESS = '{"v":1,"id":"l-1","at":"2026-10-14T01:00:00.000Z","by":"m-1","did":"favorite-kept","favorite":{"target":"formula","id":"f-1"}}'

describe("the files of a book that do not read", () => {
  test("are none where every file reads, or is not there", () => {
    expect(unreadableFilesOf({})).toEqual([])
    expect(unreadableFilesOf({ "settings.json": '{"order":1}\n', "logs/favorites.jsonl": `${PRESS}\n`, "pachinko-play/p-1.jsonl": '{"spins":0,"outlay":0}\n' })).toEqual([])
  })

  test("name a settings file whole, and the lines of a log that do not read, by number", () => {
    expect(unreadableFilesOf({ "settings.json": "{{" })).toEqual([{ path: "settings.json", lines: undefined }])
    expect(unreadableFilesOf({ "logs/favorites.jsonl": `${PRESS}\n{"v":1,"id":"l-2","at"\n${PRESS}\n` })).toEqual([{ path: "logs/favorites.jsonl", lines: [2] }])
    expect(unreadableFilesOf({ "logs/marks.jsonl": "not json\n" })).toEqual([{ path: "logs/marks.jsonl", lines: [1] }])
    expect(unreadableFilesOf({ "logs/activity.jsonl": '{"v":1,"id":""}\n' })).toEqual([{ path: "logs/activity.jsonl", lines: [1] }])
    expect(unreadableFilesOf({ "pachinko-play/p-1.jsonl": '{"spins":0,"outlay":0}\n{"spins":30,"event":{"kind":"ended"}}\n' })).toEqual([{ path: "pachinko-play/p-1.jsonl", lines: [2] }])
    expect(unreadableFilesOf({ "pachinko-play/p-1.jsonl": '{"header":true,"terms":{"rental":"500"}}\n{"spins":0,"outlay":0}\n' })).toEqual([{ path: "pachinko-play/p-1.jsonl", lines: [1] }])
  })

  test("pass over a line a later version wrote, in a shape or with a word this one does not know", () => {
    expect(unreadableFilesOf({ "logs/favorites.jsonl": '{"v":2,"anything":true}\n' })).toEqual([])
    expect(unreadableFilesOf({ "logs/favorites.jsonl": `${PRESS.replace("favorite-kept", "favorite-pinned")}\n` })).toEqual([])
  })
})
