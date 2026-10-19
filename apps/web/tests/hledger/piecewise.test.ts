import { describe, expect, test } from "bun:test"

import type { BookId } from "../../src/core/book/book"
import { withEntriesFiled } from "../../src/core/journal/filing"
import { BOOK_FILES, ENTRY_FILE, type BookFiles } from "../../src/core/journal/layout"
import type { JournalAccess } from "../../src/hledger/client/client"
import {
  actualRequest,
  everyBalanceRequest,
  everyEntryRequest,
  parlorSavingsByDayRequest,
  pricesRequest,
  savingsRevaluationRequest,
  savingsValueRequest,
  theoreticalRequest,
} from "../../src/hledger/query/requests"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { fixtureBook, inProcessHledger } from "../support/in-process"

/** What a book reads as across the questions the app asks of it most, every one answered. */
const readingOf = async (journal: JournalAccess): Promise<unknown> => {
  const answers = await Promise.all([
    journal.ask(everyEntryRequest),
    journal.ask(everyBalanceRequest),
    journal.ask(actualRequest("")),
    journal.ask(theoreticalRequest("date:2026-09")),
    journal.ask(savingsValueRequest("")),
    journal.ask(savingsRevaluationRequest("date:2026-09-15..")),
    journal.ask(parlorSavingsByDayRequest("マレハン東京皇国店", "2025-12-30" as IsoDate, "2026-10-04" as IsoDate)),
    journal.ask(pricesRequest("")),
  ])
  expect(answers.map((answer) => answer.ok)).toEqual(answers.map(() => true))
  return answers
}

/** The same book with a main journal hledger is left to read whole: a comment block is more than includes. */
const readWhole = (files: BookFiles): BookFiles => ({ ...files, [BOOK_FILES.main]: `${files[BOOK_FILES.main] ?? ""}\ncomment\nread whole\nend comment\n` })

/** The fixture's plays filed by year, the first of them moved back a year. */
const byYear = (files: BookFiles): BookFiles => {
  const entries = (files[BOOK_FILES.transactions] ?? "").split("\n\n").map((text, at) => (at === 0 ? text.replace("2026-09-05", "2025-12-31") : text))
  return withEntriesFiled(
    { ...files, [BOOK_FILES.transactions]: "" },
    entries.map((text) => ({ date: text.slice(0, 10) as IsoDate, text: `${text.replace(/\n*$/, "")}\n` })),
  )
}

const readingsOf = async (files: BookFiles): Promise<readonly [unknown, unknown]> => {
  const hledger = await inProcessHledger()
  return hledger.inTurn(async (journal) => {
    const piecewise = await journal.open(files, ENTRY_FILE)
    expect(piecewise.ok).toBe(true)
    const read = await readingOf(journal)
    const whole = await journal.open(readWhole(files), ENTRY_FILE)
    expect(whole.ok).toBe(true)
    return [read, await readingOf(journal)] as const
  })
}

describe("a book read file by file", () => {
  test("reads as hledger reads it whole, a file at a time or filed by year", async () => {
    const fixture = await fixtureBook("basic-play", { id: "piecewise" as BookId, members: [] })
    for (const files of [fixture.files, byYear(fixture.files)]) {
      const [piecewise, whole] = await readingsOf(files)
      expect(piecewise).toEqual(whole)
    }
  })

  test("reads a file changed since anew, and the others as they were kept", async () => {
    const fixture = await fixtureBook("basic-play", { id: "piecewise" as BookId, members: [] })
    const files = byYear(fixture.files)
    const changed = { ...files, "transactions/2026.journal": (files["transactions/2026.journal"] ?? "").replace("-12000 JPY", "-13000 JPY").replace("1290 JPY", "2290 JPY") }
    const hledger = await inProcessHledger()
    const [first, again] = await hledger.inTurn(async (journal) => {
      await journal.open(files, ENTRY_FILE)
      await journal.open(changed, ENTRY_FILE)
      const read = await readingOf(journal)
      await journal.open(readWhole(changed), ENTRY_FILE)
      return [read, await readingOf(journal)] as const
    })
    expect(first).toEqual(again)
  })

  test("is refused as hledger refuses it whole, where a file it includes is missing or does not read", async () => {
    const fixture = await fixtureBook("basic-play", { id: "piecewise" as BookId, members: [] })
    const hledger = await inProcessHledger()
    const broken = { ...fixture.files, [BOOK_FILES.transactions]: `${fixture.files[BOOK_FILES.transactions] ?? ""}\n2026-10-05 x\n    資産:現金  -1 JPY\n    費用:遊技  2 JPY\n` }
    const { [BOOK_FILES.prices]: _prices, ...missing } = fixture.files
    const [unbalanced, absent] = await hledger.inTurn(async (journal) => [await journal.open(broken, ENTRY_FILE), await journal.open(missing, ENTRY_FILE)] as const)
    expect([unbalanced.ok, absent.ok]).toEqual([false, false])
  })
})
