/** What a character Shift_JIS has no code for is written as. */
const UNWRITABLE = "?".charCodeAt(0)

/** The lead bytes of Shift_JIS's two-byte codes, but those of the rows NEC chose of IBM's, whose characters have codes of their own elsewhere, which an encoder writes. */
const LEAD_BYTES: readonly number[] = [...Array.from({ length: 0x9f - 0x81 + 1 }, (_, index) => 0x81 + index), ...Array.from({ length: 0xfc - 0xe0 + 1 }, (_, index) => 0xe0 + index)].filter((lead) => lead !== 0xed && lead !== 0xee)

const TRAIL_BYTES: readonly number[] = Array.from({ length: 0xfc - 0x40 + 1 }, (_, index) => 0x40 + index).filter((trail) => trail !== 0x7f)

const SINGLE_BYTES: readonly number[] = [...Array.from({ length: 0x80 }, (_, index) => index), ...Array.from({ length: 0xdf - 0xa1 + 1 }, (_, index) => 0xa1 + index)]

/** A code read as Shift_JIS, or none where it stands for no character. */
const readOf = (decoder: TextDecoder, bytes: readonly number[]): string | undefined => {
  try {
    return decoder.decode(new Uint8Array(bytes))
  } catch {
    return undefined
  }
}

/**
 * Each character Shift_JIS writes, as Windows writes it (CP932, as the
 * WHATWG encoding has it), with its bytes: drawn from the platform's own
 * decoder, every code read once, the first code that reads as a character
 * kept for it. Made the first time it is asked for.
 */
const codes: { table: ReadonlyMap<string, readonly number[]> | undefined } = { table: undefined }

const tableOf = (): ReadonlyMap<string, readonly number[]> => {
  if (codes.table !== undefined) return codes.table
  const decoder = new TextDecoder("shift_jis", { fatal: true })
  const found = new Map<string, readonly number[]>()
  const keep = (bytes: readonly number[]): void => {
    const read = readOf(decoder, bytes)
    if (read !== undefined && [...read].length === 1 && !found.has(read)) found.set(read, bytes)
  }
  SINGLE_BYTES.forEach((byte) => keep([byte]))
  LEAD_BYTES.forEach((lead) => TRAIL_BYTES.forEach((trail) => keep([lead, trail])))
  codes.table = found
  return found
}

/** A text as Shift_JIS bytes, as Windows writes it, a character it has no code for written as `?`. */
export const shiftJisOf = (text: string): Uint8Array<ArrayBuffer> => {
  const table = tableOf()
  return new Uint8Array([...text].flatMap((character) => table.get(character) ?? [UNWRITABLE]))
}
