import { unzipSync, zipSync } from "fflate"

import { Err, Ok } from "../../core/result/result"
import type { Archiver } from "../port/archiver"

const encoder = new TextEncoder()

const decoder = new TextDecoder("utf-8", { fatal: true })

/** An entry that is a folder's own, holding nothing: a zip made elsewhere may list them. */
const isFolder = (path: string): boolean => path.endsWith("/")

/**
 * Archives as zip files, each file at its own path as UTF-8 text: what any
 * desk opens, and what hledger reads once it is unpacked.
 */
export const createZipArchiver = (): Archiver => ({
  mediaType: "application/zip",
  pack: (files) => {
    try {
      return Ok(new Uint8Array(zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, encoder.encode(text)])))))
    } catch (cause) {
      return Err({ type: "archive-unwritable", detail: String(cause) })
    }
  },
  unpack: (bytes) => {
    try {
      return Ok(
        Object.fromEntries(
          Object.entries(unzipSync(bytes))
            .filter(([path]) => !isFolder(path))
            .map(([path, held]) => [path, decoder.decode(held)]),
        ),
      )
    } catch (cause) {
      return Err({ type: "archive-unreadable", detail: String(cause) })
    }
  },
})
