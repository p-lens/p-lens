import { describe, expect, test } from "bun:test"
import { unzipSync, zipSync } from "fflate"

import { createZipArchiver } from "../../src/backup/zip/zip-archiver"

const archiver = createZipArchiver()

const files = { "main.journal": "; book-title-p: 帳簿\ninclude accounts.journal\n", "logs/0199.jsonl": '{"spins":0}\n', "empty.journal": "" }

describe("a zip archive", () => {
  test("unpacks to the files it was packed from", () => {
    const packed = archiver.pack(files)
    expect(packed.ok && archiver.unpack(packed.value)).toEqual({ ok: true, value: files })
  })

  test("is a zip any tool opens, each file at its own path as UTF-8", () => {
    const packed = archiver.pack(files)
    const opened = packed.ok ? unzipSync(packed.value) : {}
    expect(Object.keys(opened).toSorted()).toEqual(["empty.journal", "logs/0199.jsonl", "main.journal"])
    expect(new TextDecoder().decode(opened["main.journal"])).toBe(files["main.journal"])
  })

  test("passes over the folders a zip made elsewhere lists", () => {
    const made = new Uint8Array(zipSync({ "logs/": new Uint8Array(), "logs/a.jsonl": new TextEncoder().encode("{}\n") }))
    expect(archiver.unpack(made)).toEqual({ ok: true, value: { "logs/a.jsonl": "{}\n" } })
  })

  test("refuses bytes that are no zip", () => {
    const unpacked = archiver.unpack(new TextEncoder().encode("2026-10-07 not a zip"))
    expect(!unpacked.ok && unpacked.error.type).toBe("archive-unreadable")
  })

  test("refuses a file that is not text", () => {
    const unpacked = archiver.unpack(new Uint8Array(zipSync({ "main.journal": new Uint8Array([0xff, 0xfe, 0xfd]) })))
    expect(!unpacked.ok && unpacked.error.type).toBe("archive-unreadable")
  })
})
