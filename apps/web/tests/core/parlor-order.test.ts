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
      entry("2026-10-01", "資産:貯玉:東京皇国第8支店:4円", "収益:遊技"),
      entry("2026-10-05", "資産:貯メダル:見滝原:20円"),
      entry("2026-09-20", "資産:貯玉:見滝原:4円"),
      entry("2026-10-01", "資産:貯玉:ジオン公国支店:1円"),
      entry("2026-10-09", "費用:遊技"),
    ])
    expect([...moved].map(([name, day]) => [name, String(day)]).sort()).toEqual([["ジオン公国支店", "2026-10-01"], ["東京皇国第8支店", "2026-10-01"], ["見滝原", "2026-10-05"]])
    expect(inShowingOrder([holding("東京皇国第8支店"), holding("AB℃ルグニカ王国本店"), holding("見滝原"), holding("ジオン公国支店")], moved).map((each) => each.parlorName)).toEqual(["見滝原", "ジオン公国支店", "東京皇国第8支店", "AB℃ルグニカ王国本店"])
  })

  test("are found by part of a name, widths, case and kana aside, and every one is found by nothing typed", () => {
    const parlors = [holding("マレハン東京皇国第8支店"), holding("ジーステーション第3新東京市"), holding("キコーネジオン公国支店")]
    expect(namedLike(parlors, "まれはん").map((each) => each.parlorName)).toEqual(["マレハン東京皇国第8支店"])
    expect(namedLike(parlors, "ｼﾞｰ ｽﾃｰｼｮﾝ").map((each) => each.parlorName)).toEqual(["ジーステーション第3新東京市"])
    expect(namedLike(parlors, " ")).toHaveLength(3)
  })

  test("hold nothing only where every pool stands at none", () => {
    expect([holdsNothing(holding("東京皇国第8支店", ZERO)), holdsNothing(holding("東京皇国第8支店"))]).toEqual([true, false])
  })
})
