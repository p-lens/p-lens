import { ENTRY_FILE, journalsTextOf } from "../../core/journal/layout"
import type { JournalsDigest } from "../port/summaries"

/** A book's journals digested by the browser's SHA-256, as hledger's worker keys what it reads. */
export const webCryptoJournalsDigest: JournalsDigest = async (files) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(journalsTextOf(files, ENTRY_FILE))))
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}
