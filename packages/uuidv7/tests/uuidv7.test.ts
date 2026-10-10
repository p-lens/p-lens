import { describe, expect, test } from "bun:test"

import { RANDOM_BYTES, formatUuidV7, isUuidV7, retimeUuidV7 } from "../src/index.ts"

const zeros = new Uint8Array(RANDOM_BYTES)
const ones = new Uint8Array(RANDOM_BYTES).fill(0xff)

describe("UUIDv7", () => {
  test("lays out the time, version and variant as RFC 9562 does", () => {
    expect(formatUuidV7(0x017f22e279b0, zeros)).toEqual({ ok: true, value: "017f22e2-79b0-7000-8000-000000000000" as never })
    expect(formatUuidV7(0x017f22e279b0, ones)).toEqual({ ok: true, value: "017f22e2-79b0-7fff-bfff-ffffffffffff" as never })
  })

  test("an id made later sorts later", () => {
    const earlier = formatUuidV7(1_759_500_000_000, ones)
    const later = formatUuidV7(1_759_500_000_001, zeros)
    expect(earlier.ok && later.ok && earlier.value < later.value).toBe(true)
  })

  test("refuses a time it cannot hold and randomness of the wrong length", () => {
    expect(formatUuidV7(-1, zeros)).toEqual({ ok: false, error: { type: "time-out-of-range" } })
    expect(formatUuidV7(2 ** 48, zeros)).toEqual({ ok: false, error: { type: "time-out-of-range" } })
    expect(formatUuidV7(0, new Uint8Array(3))).toEqual({ ok: false, error: { type: "wrong-random-length", length: 3 } })
  })

  test("recognises its own form and nothing else", () => {
    const made = formatUuidV7(1_759_500_000_000, zeros)
    expect(made.ok && isUuidV7(made.value)).toBe(true)
    expect(isUuidV7("0aa6c5e2-0000-4000-8000-000000000000")).toBe(false)
    expect(isUuidV7("017F22E2-79B0-7000-8000-000000000000")).toBe(false)
  })

  test("an id moved to another moment keeps everything but its time, and sorts by the new one", () => {
    const made = formatUuidV7(0x017f22e279b0, ones)
    const moved = made.ok ? retimeUuidV7(made.value, 0x010000000000) : made
    expect(moved).toEqual({ ok: true, value: "01000000-0000-7fff-bfff-ffffffffffff" as never })
    expect(moved.ok && isUuidV7(moved.value)).toBe(true)
    expect(made.ok && retimeUuidV7(made.value, -1)).toEqual({ ok: false, error: { type: "time-out-of-range" } })
  })
})
