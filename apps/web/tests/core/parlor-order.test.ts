import { describe, expect, test } from "bun:test"

import type { Transaction } from "../../src/hledger/protocol/wire"
import { ZERO } from "../../src/core/decimal/decimal"
import type { ParlorHolding } from "../../src/core/report/holdings"
import { holdsNothing, inShowingOrder, lastMovedOf, namedLike } from "../../src/core/report/parlor-order"
import { dec } from "../support/values"

const entry = (date: string, ...accounts: readonly string[]): Transaction => ({ tdate: date, tdescription: "", ttags: [], tpostings: accounts.map((paccount) => ({ paccount, pamount: [], preal: "RealPosting", ptags: [] }) as never) })

const holding = (parlorName: string, quantity = dec("100")): ParlorHolding => ({ parlorName, parlor: undefined, tokens: [{ kind: "ball", tier: "4円", commodity: "", quantity, value: ZERO, rate: undefined }], value: ZERO })

describe("parlors as they are shown", () => {
  test("go by the day their savings last moved, latest first, a parlor that never moved last, and alike ones by name", () => {
    const moved = lastMovedOf([
      entry("2026-10-01", "資産:貯玉:梅田:4円", "収益:遊技"),
      entry("2026-10-05", "資産:貯メダル:難波:20円"),
      entry("2026-09-20", "資産:貯玉:難波:4円"),
      entry("2026-10-01", "資産:貯玉:京橋:1円"),
      entry("2026-10-09", "費用:遊技"),
    ])
    expect([...moved].map(([name, day]) => [name, String(day)]).sort()).toEqual([["京橋", "2026-10-01"], ["梅田", "2026-10-01"], ["難波", "2026-10-05"]])
    expect(inShowingOrder([holding("梅田"), holding("天王寺"), holding("難波"), holding("京橋")], moved).map((each) => each.parlorName)).toEqual(["難波", "京橋", "梅田", "天王寺"])
  })

  test("are found by part of a name, widths, case and kana aside, and every one is found by nothing typed", () => {
    const parlors = [holding("マルハン梅田"), holding("ＤＳＴＡＴＩＯＮ難波"), holding("キコーナ京橋")]
    expect(namedLike(parlors, "まるはん").map((each) => each.parlorName)).toEqual(["マルハン梅田"])
    expect(namedLike(parlors, "d station").map((each) => each.parlorName)).toEqual(["ＤＳＴＡＴＩＯＮ難波"])
    expect(namedLike(parlors, " ")).toHaveLength(3)
  })

  test("hold nothing only where every pool stands at none", () => {
    expect([holdsNothing(holding("梅田", ZERO)), holdsNothing(holding("梅田"))]).toEqual([true, false])
  })
})
