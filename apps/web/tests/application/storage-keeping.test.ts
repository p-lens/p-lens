import { describe, expect, test } from "bun:test"

import { keepStorage } from "../../src/application/storage-keeping"
import type { StorageKeeper, StorageKeeping } from "../../src/storage/port/storage-keeping"

const keeperThat = (standing: StorageKeeping, answers: StorageKeeping): StorageKeeper & { readonly asked: () => number } => {
  const held: { asked: number } = { asked: 0 }
  return {
    standing: async () => standing,
    ask: async () => {
      held.asked += 1
      return answers
    },
    asked: () => held.asked,
  }
}

describe("having the browser keep what the device stores", () => {
  test("asks where the storage may be cleared, and says what the browser answered", async () => {
    const granted = keeperThat("clearable", "kept")
    expect(await keepStorage(granted)).toBe("kept")
    expect(granted.asked()).toBe(1)
    expect(await keepStorage(keeperThat("clearable", "clearable"))).toBe("clearable")
  })

  test("asks nothing where it is kept already, or where the browser cannot say", async () => {
    const kept = keeperThat("kept", "clearable")
    const silent = keeperThat("unknown", "kept")
    expect(await keepStorage(kept)).toBe("kept")
    expect(await keepStorage(silent)).toBe("unknown")
    expect(kept.asked() + silent.asked()).toBe(0)
  })
})
