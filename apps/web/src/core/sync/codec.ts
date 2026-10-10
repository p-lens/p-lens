import type { JournalChange } from "../change/journal-change"
import { isFilePatch } from "../change/patch"
import { Err, Ok, type Result } from "../result/result"

/** A commit's change could not be read back from the text it travelled as. */
export type CodecProblem = { readonly type: "unreadable-change" }

const BIGINT = "bigint:"

/**
 * A change as text, to be sealed and carried: JSON, a decimal's mantissa
 * written out as digits because JSON has no whole number that large.
 */
export const changeText = (change: JournalChange): string =>
  JSON.stringify(change, (_key, value: unknown) => (typeof value === "bigint" ? `${BIGINT}${value.toString()}` : value))

const revived = (_key: string, value: unknown): unknown =>
  typeof value === "string" && value.startsWith(BIGINT) && /^-?\d+$/.test(value.slice(BIGINT.length)) ? BigInt(value.slice(BIGINT.length)) : value

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const isChange = (value: unknown): value is JournalChange =>
  isRecord(value) &&
  typeof value["bookId"] === "string" &&
  typeof value["author"] === "string" &&
  typeof value["at"] === "string" &&
  isRecord(value["intent"]) &&
  typeof value["intent"]["type"] === "string" &&
  Array.isArray(value["files"]) &&
  value["files"].every(isFilePatch)

/** The change a text carries, if it is one: what arrives from elsewhere is not taken on trust. */
export const changeOfText = (text: string): Result<JournalChange, CodecProblem> => {
  try {
    const parsed: unknown = JSON.parse(text, revived)
    return isChange(parsed) ? Ok(parsed) : Err({ type: "unreadable-change" })
  } catch {
    return Err({ type: "unreadable-change" })
  }
}
