import { isWrittenReversed } from "../../src/core/journal/accounts"
import { describe, expect, test } from "bun:test"

import { fileChangesBetween } from "../../src/core/change/journal-change"
import { describedBy } from "../../src/core/journal/entry"
import { appendEntry, inBookOrder } from "../../src/core/journal/layout"

describe("journal files", () => {
  test("an entry is appended after exactly one blank line", () => {
    expect(appendEntry("", "B\n")).toBe("B\n")
    expect(appendEntry("A\n", "B\n")).toBe("A\n\nB\n")
    expect(appendEntry("A\n\n\n", "B\n")).toBe("A\n\nB\n")
    expect(appendEntry("A", "B\n")).toBe("A\n\nB\n")
  })

  test("a change names the files that differ, and only those", () => {
    expect(fileChangesBetween({ "a.journal": "1", "b.journal": "2" }, { "a.journal": "1", "b.journal": "3", "c.journal": "4" })).toEqual([
      { path: "b.journal", before: "2", after: "3" },
      { path: "c.journal", before: undefined, after: "4" },
    ])
    expect(fileChangesBetween({ "a.journal": "1" }, { "a.journal": "1" })).toEqual([])
  })
})

describe("a book's files", () => {
  test("read in the order main includes them, then the rest by path", () => {
    expect(inBookOrder(["logs/b.jsonl", "transactions.journal", "logs/a.jsonl", "main.journal", "prices.journal", "accounts.journal"])).toEqual([
      "main.journal",
      "accounts.journal",
      "prices.journal",
      "transactions.journal",
      "logs/a.jsonl",
      "logs/b.jsonl",
    ])
  })
})

describe("an account whose amounts are written turned over", () => {
  test("is revenue and whatever is under it, and nothing else", () => {
    expect(isWrittenReversed("収益:遊技")).toBe(true)
    expect(isWrittenReversed("収益")).toBe(true)
    expect(isWrittenReversed("費用:遊技")).toBe(false)
    expect(isWrittenReversed("資産:現金")).toBe(false)
    expect(isWrittenReversed("統計:期待値")).toBe(false)
    expect(isWrittenReversed("収益金")).toBe(false)
  })
})

describe("an entry's description", () => {
  test("is the payee, a bar and the note", () => {
    expect(describedBy("マレハン第3新東京店", "流星 123番台")).toBe("マレハン第3新東京店 | 流星 123番台")
  })

  test("is one side alone where the other is missing, with no bar beside it", () => {
    expect(describedBy(undefined, "流星 123番台")).toBe("流星 123番台")
    expect(describedBy("マレハン第3新東京店", "")).toBe("マレハン第3新東京店")
    expect(describedBy(undefined, "")).toBe("")
  })

  test("keeps a bar inside a name from ending the payee", () => {
    expect(describedBy("A|B店", "C|D")).toBe("A｜B店 | C｜D")
    expect(describedBy(undefined, "C|D")).toBe("C｜D")
  })
})
