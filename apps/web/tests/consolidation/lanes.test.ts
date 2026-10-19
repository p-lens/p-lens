import { afterEach, describe, expect, test } from "bun:test"

import { lanesFor } from "../../src/consolidation/lanes/lanes-plan"
import { createManyLanes } from "../../src/consolidation/lanes/many-lanes"
import { createWorkMark } from "../../src/consolidation/lanes/work-mark"

/** A device's storage as a page sees it, kept in memory for the test. */
const storageOf = (): Storage => {
  const held = new Map<string, string>()
  return {
    get length() {
      return held.size
    },
    clear: () => held.clear(),
    getItem: (key) => held.get(key) ?? null,
    key: (at) => [...held.keys()][at] ?? null,
    removeItem: (key) => void held.delete(key),
    setItem: (key, value) => void held.set(key, value),
  }
}

const withStorage = (storage: Storage): void => {
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true })
}

afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: undefined, configurable: true })
})

describe("how many hledgers a consolidation reads on", () => {
  test("is one for up to three books, two from four, three from twelve and four from twenty, and no more", () => {
    const roomy = { cores: 16, memoryGigabytes: 16 }
    expect([1, 3, 4, 11, 12, 19, 20, 60].map((books) => lanesFor(books, roomy))).toEqual([1, 1, 2, 2, 3, 3, 4, 4])
  })

  test("is held to the cores beside the page's own and to two gigabytes each, two where the device says nothing of its memory", () => {
    expect(lanesFor(40, { cores: 2, memoryGigabytes: 16 })).toBe(1)
    expect(lanesFor(40, { cores: 16, memoryGigabytes: 4 })).toBe(2)
    expect(lanesFor(40, { cores: 16, memoryGigabytes: 1 })).toBe(1)
    expect(lanesFor(40, { cores: 16, memoryGigabytes: undefined })).toBe(2)
  })
})

describe("the lanes a consolidation is given", () => {
  const lanes = (on: boolean, stopped: boolean) => {
    const made = { count: 0 }
    const given = createManyLanes({
      first: "first",
      another: () => `more ${String((made.count += 1))}`,
      plan: (books) => Math.min(3, 1 + Math.floor(books / 8)),
      on: () => on,
      stopped: { stopped: () => stopped, told: () => undefined },
      working: () => undefined,
    })
    return { given, made }
  }

  test("start another hledger only when as many books want it, and keep those started", () => {
    const { given, made } = lanes(true, false)
    expect(given.sessionsFor(3)).toEqual(["first"])
    expect(made.count).toBe(0)
    expect(given.sessionsFor(17)).toEqual(["first", "more 1", "more 2"])
    expect(given.sessionsFor(9)).toEqual(["first", "more 1"])
    expect(made.count).toBe(2)
  })

  test("are the one every screen reads on alone while the consolidation is off, or the page before stopped at work", () => {
    expect(lanes(false, false).given.sessionsFor(40)).toEqual(["first"])
    expect(lanes(true, true).given.sessionsFor(40)).toEqual(["first"])
  })
})

describe("the mark of reading on several hledgers", () => {
  test("stands while any such reading is under way, and is gone once the last of it ends", () => {
    const storage = storageOf()
    withStorage(storage)
    const mark = createWorkMark()
    expect(mark.stopped()).toBe(false)
    mark.working(true)
    mark.working(true)
    mark.working(false)
    expect(storage.getItem("p-lens.consolidation-at-work")).not.toBeNull()
    mark.working(false)
    expect(storage.getItem("p-lens.consolidation-at-work")).toBeNull()
  })

  test("found by the next page says it stopped at work, and is taken away once that is told", () => {
    const storage = storageOf()
    withStorage(storage)
    createWorkMark().working(true)
    const next = createWorkMark()
    expect(next.stopped()).toBe(true)
    next.told()
    expect(storage.getItem("p-lens.consolidation-at-work")).toBeNull()
    expect(createWorkMark().stopped()).toBe(false)
  })

  test("is nothing where the device lets no storage be reached", () => {
    const mark = createWorkMark()
    mark.working(true)
    expect(mark.stopped()).toBe(false)
  })
})
