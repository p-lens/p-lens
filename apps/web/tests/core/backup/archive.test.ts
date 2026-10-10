import { describe, expect, test } from "bun:test"

import { archiveName, archiveOf, backupOf, MANIFEST_PATH, type Backup } from "../../../src/core/backup/archive"
import type { BookId } from "../../../src/core/book/book"
import type { IsoDate } from "../../../src/core/calendar/calendar"

const BOOK = "0199b9a0-0000-7000-8000-000000000001" as BookId

const backup: Backup = {
  bookId: BOOK,
  madeAt: "2026-10-07T03:00:00.000Z",
  files: { "main.journal": "; book-title-p: 帳簿\ninclude accounts.journal\n", "accounts.journal": "account 資産:現金\n", "logs/a.jsonl": '{"spins":0}\n' },
}

describe("an archive", () => {
  test("holds a book's files untouched, and a manifest beside them", () => {
    const archive = archiveOf(backup)
    expect(Object.keys(archive).toSorted()).toEqual(["accounts.journal", "logs/a.jsonl", "main.journal", "manifest.json"])
    expect(archive["main.journal"]).toBe(backup.files["main.journal"])
    expect(JSON.parse(archive[MANIFEST_PATH] ?? "")).toEqual({ format: 1, bookId: BOOK, madeAt: backup.madeAt })
  })

  test("reads back as the backup it was made from", () => {
    expect(backupOf(archiveOf(backup))).toEqual({ ok: true, value: backup })
  })

  test("without a manifest is not a backup", () => {
    expect(backupOf(backup.files)).toEqual({ ok: false, error: { type: "no-manifest" } })
  })

  test("with a manifest that names no book is not a backup", () => {
    const unreadable = ["not json", "[]", JSON.stringify({ format: 1 }), JSON.stringify({ format: 1, bookId: "", madeAt: "x" }), JSON.stringify({ bookId: BOOK, madeAt: "x" })]
    unreadable.forEach((manifest) => {
      expect(backupOf({ ...backup.files, [MANIFEST_PATH]: manifest })).toEqual({ ok: false, error: { type: "unreadable-manifest" } })
    })
  })

  test("made in a newer layout is refused as newer, not misread", () => {
    expect(backupOf({ ...backup.files, [MANIFEST_PATH]: JSON.stringify({ format: 2, bookId: BOOK, madeAt: "x" }) })).toEqual({ ok: false, error: { type: "newer-format", format: 2 } })
  })
})

describe("an archive's name", () => {
  test("is the book's title", () => {
    expect(archiveName("サンプル帳簿", BOOK, undefined)).toBe("サンプル帳簿_backup.zip")
  })

  test("carries the day where archives pile up", () => {
    expect(archiveName("サンプル帳簿", BOOK, "2026-10-07" as IsoDate)).toBe("サンプル帳簿_2026-10-07_backup.zip")
  })

  test("sets aside what a file's name cannot hold", () => {
    expect(archiveName('a/b\\c:d*e?f"g<h>i|j\n', BOOK, undefined)).toBe("a_b_c_d_e_f_g_h_i_j__backup.zip")
    expect(archiveName(" ..帳簿. ", BOOK, undefined)).toBe("帳簿_backup.zip")
  })

  test("is the book's id where it has no title", () => {
    expect(archiveName(undefined, BOOK, undefined)).toBe(`${BOOK}_backup.zip`)
    expect(archiveName(" . ", BOOK, undefined)).toBe(`${BOOK}_backup.zip`)
  })
})
