import { describe, expect, test } from "bun:test"

import type { BookId } from "../../../src/core/book/book"
import type { IsoDate } from "../../../src/core/calendar/calendar"
import { bundleName, fileStemsOf, tallyTableName, singleJournalName } from "../../../src/core/export/file-name"

const DAY = "2026-10-09" as IsoDate

/** Two UUIDv7s made a second apart. */
const FIRST = "019a0e0f-4520-7abc-8def-0123456789ab" as BookId
const SECOND = "019a0e0f-4908-7abc-8def-0123456789ab" as BookId

describe("the names files written out go by", () => {
  test("say the book, what the file is of, and the day it was written out, joined by underscores", () => {
    expect(singleJournalName("サンプル帳簿", DAY)).toBe("サンプル帳簿_2026-10-09_exported.journal")
    expect(tallyTableName("サンプル帳簿", DAY)).toBe("サンプル帳簿_収支_2026-10-09_exported.csv")
    expect(bundleName(DAY)).toBe("帳簿_2026-10-09_exported.zip")
  })

  test("name a book by its title, or by its id where it has none", () => {
    expect([...fileStemsOf([{ id: FIRST, title: "一冊目" }, { id: SECOND, title: undefined }]).values()]).toEqual(["一冊目", SECOND])
  })

  test("tell books of one title apart by the moment in each one's id, every one of them alike", () => {
    const stems = fileStemsOf([{ id: FIRST, title: "帳簿" }, { id: SECOND, title: "帳簿" }, { id: "other" as BookId, title: "別の帳簿" }])
    expect([...stems.values()]).toEqual(["帳簿(019a0e0f4520)", "帳簿(019a0e0f4908)", "別の帳簿"])
  })

  test("use an id whole where it carries no moment", () => {
    expect([...fileStemsOf([{ id: "kept" as BookId, title: "帳簿" }, { id: "twin" as BookId, title: "帳簿" }]).values()]).toEqual(["帳簿(kept)", "帳簿(twin)"])
  })
})
