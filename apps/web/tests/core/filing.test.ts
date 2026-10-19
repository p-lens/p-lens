import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { includingYear, isTransactionsFile, unfiledYears, withEntriesFiled, withEntryFiled, withoutTallyFiled, withTallyFiled, withYearFiled, yearFileOf } from "../../src/core/journal/filing"
import { appendEntry, BOOK_FILES, type BookFiles } from "../../src/core/journal/layout"
import type { PlayId } from "../../src/core/play/play"

const day = (text: string): IsoDate => text as IsoDate

const MAIN = "; a book\n\ninclude accounts.journal\ninclude prices.journal\ninclude transactions.journal\n"

const tally = (date: string, id: string, yen = "-1000"): string => `${date} 店 | 機種  ; play-id: ${id}\n    資産:現金  ${yen} JPY\n    費用:遊技\n`

describe("the file a transaction is kept in", () => {
  test("is its day's year's, and a book's transactions are the years' and those not filed by year", () => {
    expect(yearFileOf(day("2026-01-01"))).toBe("transactions/2026.journal")
    expect(yearFileOf(day("2025-12-31"))).toBe("transactions/2025.journal")
    expect(["transactions.journal", "transactions/2026.journal", "accounts.journal", "transactions/26.journal", "pachinko-play/x.jsonl"].map(isTransactionsFile)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ])
  })
})

describe("the main journal including a year", () => {
  test("names it among the years in their order, before what is not filed by year", () => {
    const with2026 = includingYear(MAIN, "transactions/2026.journal")
    expect(with2026).toBe("; a book\n\ninclude accounts.journal\ninclude prices.journal\ninclude transactions/2026.journal\ninclude transactions.journal\n")
    expect(includingYear(includingYear(with2026, "transactions/2024.journal"), "transactions/2025.journal")).toBe(
      "; a book\n\ninclude accounts.journal\ninclude prices.journal\ninclude transactions/2024.journal\ninclude transactions/2025.journal\ninclude transactions/2026.journal\ninclude transactions.journal\n",
    )
  })

  test("is as it was where it names the year already, and names it after its last include where it has nothing to stand before", () => {
    const with2026 = includingYear(MAIN, "transactions/2026.journal")
    expect(includingYear(with2026, "transactions/2026.journal")).toBe(with2026)
    expect(includingYear("include accounts.journal\n", "transactions/2026.journal")).toBe("include accounts.journal\ninclude transactions/2026.journal\n")
    expect(includingYear("", "transactions/2026.journal")).toBe("\ninclude transactions/2026.journal\n")
  })
})

describe("an entry filed", () => {
  test("goes at the end of its year's file, which the main journal comes to include, or at its head where it opens the book", () => {
    const files = withEntryFiled({ [BOOK_FILES.main]: MAIN, [BOOK_FILES.transactions]: "" }, day("2026-10-04"), tally("2026-10-04", "a"))
    const both = withEntryFiled(files, day("2026-01-02"), tally("2026-01-02", "opening"), "head")
    expect(both["transactions/2026.journal"]).toBe(`${tally("2026-01-02", "opening")}\n${tally("2026-10-04", "a")}`)
    expect(both[BOOK_FILES.main]).toContain("include transactions/2026.journal\ninclude transactions.journal\n")
    expect(both[BOOK_FILES.transactions]).toBe("")
  })

  test("many at once are each in their year's file, set apart as when filed one by one", () => {
    const entries = [tally("2025-12-31", "a"), tally("2026-01-01", "b"), tally("2025-12-31", "c")].map((text) => ({ date: day(text.slice(0, 10)), text }))
    const files = withEntriesFiled({ [BOOK_FILES.main]: MAIN }, entries)
    const oneByOne = entries.reduce<BookFiles>((built, entry) => withEntryFiled(built, entry.date, entry.text), { [BOOK_FILES.main]: MAIN })
    expect(files).toEqual(oneByOne)
    expect(files["transactions/2025.journal"]).toBe(appendEntry(tally("2025-12-31", "a"), tally("2025-12-31", "c")))
  })
})

describe("a tally's entry written anew", () => {
  const filed = withEntriesFiled(
    { [BOOK_FILES.main]: MAIN, [BOOK_FILES.transactions]: tally("2024-05-05", "kept") },
    [day("2026-03-01"), day("2026-04-01")].map((date, at) => ({ date, text: tally(date, `t${String(at)}`) })),
  )

  test("stays where it stood in its year, every other line as it was", () => {
    const revised = withTallyFiled(filed, "t0" as PlayId, day("2026-03-02"), tally("2026-03-02", "t0", "-2000"))
    expect(revised?.["transactions/2026.journal"]).toBe(appendEntry(tally("2026-03-02", "t0", "-2000"), tally("2026-04-01", "t1")))
  })

  test("moves to its new year's file where its day moved to another year", () => {
    const revised = withTallyFiled(filed, "t1" as PlayId, day("2025-04-01"), tally("2025-04-01", "t1"))
    expect([revised?.["transactions/2026.journal"], revised?.["transactions/2025.journal"]]).toEqual([tally("2026-03-01", "t0"), tally("2025-04-01", "t1")])
    expect(revised?.[BOOK_FILES.main]).toContain("include transactions/2025.journal\ninclude transactions/2026.journal\n")
  })

  test("stays among the transactions not filed by year, a book being filed by year all at once", () => {
    const revised = withTallyFiled(filed, "kept" as PlayId, day("2024-05-06"), tally("2024-05-06", "kept"))
    expect([revised?.[BOOK_FILES.transactions], revised?.["transactions/2024.journal"]]).toEqual([tally("2024-05-06", "kept"), undefined])
  })

  test("is none, and so is one taken out, where no file holds the tally", () => {
    expect(withTallyFiled(filed, "nowhere" as PlayId, day("2026-01-01"), tally("2026-01-01", "nowhere"))).toBeUndefined()
    expect(withoutTallyFiled(filed, "nowhere" as PlayId)).toBeUndefined()
    expect(withoutTallyFiled(filed, "t0" as PlayId)?.["transactions/2026.journal"]).toBe(tally("2026-04-01", "t1"))
  })
})

describe("the years to file", () => {
  const inbox = (text: string) => ({ [BOOK_FILES.main]: MAIN, [BOOK_FILES.transactions]: text })

  test("are those the transactions not filed by year hold, oldest first, each moved whole and as it was written", () => {
    const files = inbox(`${tally("2026-01-02", "b")}\n${tally("2025-03-04", "a")}\n${tally("2026-05-06", "c")}`)
    expect(unfiledYears(files)).toEqual(["2025", "2026"])
    const filed = withYearFiled(files, "2026")
    expect(filed?.count).toBe(2)
    expect([filed?.files[BOOK_FILES.transactions], filed?.files["transactions/2026.journal"]]).toEqual([tally("2025-03-04", "a"), appendEntry(tally("2026-01-02", "b"), tally("2026-05-06", "c"))])
    expect(withYearFiled(files, "2024")).toBeUndefined()

    const first = withYearFiled(files, "2026", 1)
    expect([first?.count, first?.files["transactions/2026.journal"], unfiledYears(first?.files ?? {})]).toEqual([1, tally("2026-01-02", "b"), ["2025", "2026"]])
  })

  test("are none where those transactions hold what the app does not write", () => {
    for (const text of [
      `; by hand\n${tally("2026-01-02", "b")}`,
      tally("2026/01/02", "b"),
      `${tally("2026-01-02", "b")}    ; date: 2027-01-01\n`,
      `include more.journal\n${tally("2026-01-02", "b")}`,
    ]) {
      expect([text, unfiledYears(inbox(text))]).toEqual([text, []])
      expect(withYearFiled(inbox(text), "2026")).toBeUndefined()
    }
  })
})
