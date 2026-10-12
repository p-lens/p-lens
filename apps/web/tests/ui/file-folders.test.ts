import { describe, expect, test } from "bun:test"

import { entriesOf, folderOf } from "../../src/ui/features/files/folders"

const file = (path: string) => ({ path })

describe("a book's files, as the list lays them out", () => {
  test("are each a row at the root, and gathered under their folder where they are in one, under the rest of their path", () => {
    expect(entriesOf([file("main.journal"), file("pachinko-play/a.jsonl"), file("pachinko-play/b.jsonl"), file("settings.json")])).toEqual([
      { type: "file", listed: { file: file("main.journal"), name: "main.journal" } },
      { type: "folder", name: "pachinko-play", files: [{ file: file("pachinko-play/a.jsonl"), name: "a.jsonl" }, { file: file("pachinko-play/b.jsonl"), name: "b.jsonl" }] },
      { type: "file", listed: { file: file("settings.json"), name: "settings.json" } },
    ])
  })

  test("keep a folder where the first of its files stood, however its files are scattered, and each folder apart", () => {
    const entries = entriesOf([file("pachislot-play/x.jsonl"), file("a.journal"), file("pachinko-play/p.jsonl"), file("pachislot-play/y.jsonl")])
    expect(entries.map((entry) => (entry.type === "folder" ? `${entry.name}/ ${entry.files.map((listed) => listed.name).join(",")}` : entry.listed.name))).toEqual(["pachislot-play/ x.jsonl,y.jsonl", "a.journal", "pachinko-play/ p.jsonl"])
  })

  test("show one level of folders, what lies deeper keeping the rest of its path", () => {
    expect(entriesOf([file("logs/2026/a.jsonl")])).toEqual([{ type: "folder", name: "logs", files: [{ file: file("logs/2026/a.jsonl"), name: "2026/a.jsonl" }] }])
    expect([folderOf("main.journal"), folderOf("pachinko-play/a.jsonl"), folderOf("logs/2026/a.jsonl")]).toEqual([undefined, "pachinko-play", "logs"])
  })

  test("are nothing for a book with no files", () => {
    expect(entriesOf([])).toEqual([])
  })
})
