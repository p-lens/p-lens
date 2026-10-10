import { describe, expect, test } from "bun:test"

import { singleJournalOf } from "../../../src/core/export/single-journal"

describe("a book's journals as one file", () => {
  test("each included journal is written in where its include stood, under its name", () => {
    const files = {
      "main.journal": "; book-title-p: 帳簿\n\ninclude accounts.journal\ninclude transactions.journal\n",
      "accounts.journal": "account 資産:現金\n",
      "transactions.journal": "2026-10-01 稼働\n    資産:現金  -1000 JPY\n    費用:遊技  1000 JPY\n\n\n",
    }
    expect(singleJournalOf(files)).toBe(
      "; book-title-p: 帳簿\n\n; accounts.journal\naccount 資産:現金\n\n; transactions.journal\n2026-10-01 稼働\n    資産:現金  -1000 JPY\n    費用:遊技  1000 JPY\n",
    )
  })

  test("what no journal includes is left out", () => {
    expect(singleJournalOf({ "main.journal": "include accounts.journal\n", "accounts.journal": "account 資産:現金\n", "pachinko-play/one.jsonl": "{}\n" })).toBe("; accounts.journal\naccount 資産:現金\n")
  })

  test("an include of a file the book does not hold stays as written", () => {
    expect(singleJournalOf({ "main.journal": "include elsewhere.journal\n" })).toBe("include elsewhere.journal\n")
  })

  test("a journal that includes itself, or the one including it, is written in once", () => {
    expect(singleJournalOf({ "main.journal": "include a.journal\n", "a.journal": "include main.journal\ninclude a.journal\n; a\n" })).toBe("; a.journal\ninclude main.journal\ninclude a.journal\n; a\n")
  })
})
