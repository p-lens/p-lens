import { describe, expect, test } from "bun:test"

import { fingerprintText, noteOf, standingOf, type Receipt, type Standing } from "../../../src/core/backup/standing"
import type { BookId } from "../../../src/core/book/book"

const receipt: Receipt = { bookId: "book" as BookId, destination: "google-drive", at: "2026-10-07T03:00:00.000Z", fingerprint: "abc" }

const never: Standing = { type: "never" }
const changed: Standing = { type: "changed", receipt }
const kept: Standing = { type: "kept", receipt }

describe("where a book stands against its backups", () => {
  test("never, without a receipt", () => {
    expect(standingOf(undefined, "abc")).toEqual(never)
  })

  test("kept, while its files are the ones backed up", () => {
    expect(standingOf(receipt, "abc")).toEqual(kept)
  })

  test("changed, once its files are not", () => {
    expect(standingOf(receipt, "abd")).toEqual(changed)
  })
})

describe("the text a fingerprint is taken of", () => {
  test("is the same however the files were gathered", () => {
    expect(fingerprintText({ b: "2", a: "1" })).toBe(fingerprintText({ a: "1", b: "2" }))
  })

  test("differs when a file's text, its path, or which files there are differ", () => {
    const base = fingerprintText({ a: "1", b: "2" })
    expect(fingerprintText({ a: "1", b: "3" })).not.toBe(base)
    expect(fingerprintText({ a: "1", c: "2" })).not.toBe(base)
    expect(fingerprintText({ a: "1" })).not.toBe(base)
    expect(fingerprintText({ a: '1","b":"2' })).not.toBe(base)
  })
})

describe("the note a device's books come to", () => {
  test("says nothing when every book is kept, or there are none", () => {
    expect(noteOf([kept, kept])).toBeUndefined()
    expect(noteOf([])).toBeUndefined()
  })

  test("says a book has changed since its backup", () => {
    expect(noteOf([kept, changed])).toBe("changed")
  })

  test("says a book was never backed up before it says one changed", () => {
    expect(noteOf([changed, never, kept])).toBe("never")
  })
})
