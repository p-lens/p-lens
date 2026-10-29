import { afterEach, describe, expect, test } from "bun:test"

import { decimal } from "../../src/core/decimal/decimal"
import type { Group } from "../../src/core/report/breakdown"
import { startMumming, stopMumming } from "../../src/mummer"
import { shownOrder } from "../../src/ui/features/breakdown/shown-order"

afterEach(() => stopMumming("2026-10-29"))

const group = (key: string, actual: bigint): Group => ({ key, actual: decimal(actual, 0), theoretical: decimal(0n, 0), inferred: decimal(0n, 0), seconds: decimal(0n, 0) })

const GROUPS = [group("ピエロット", -8000n), group("流星", 3000n), group("森物語", 3000n), group("アクア", 500n)]

describe("groups as a list shows them", () => {
  test("rank what made most first, and the same by key", () => {
    expect(shownOrder(GROUPS, "machine").map((each) => each.key)).toEqual(["森物語", "流星", "アクア", "ピエロット"])
  })

  test("while mumming, tell nothing of how they stand: by key alone", () => {
    startMumming("2026-10-29")
    expect(shownOrder(GROUPS, "parlor").map((each) => each.key)).toEqual(["アクア", "ピエロット", "森物語", "流星"])
  })

  test("leave time as it runs", () => {
    expect(shownOrder(GROUPS, "day")).toBe(GROUPS)
  })
})
