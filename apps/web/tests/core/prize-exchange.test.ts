import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { renderEntry } from "../../src/core/journal/entry"
import { prizeExchangeEntry, withPrizesDeclared, type PrizeExchange } from "../../src/core/savings/prize-exchange"
import { PRICES, UMEDA, dec } from "../support/values"

const EXCHANGE: PrizeExchange = { parlor: UMEDA, pool: { kind: "ball", tier: "4円" }, date: "2026-10-04" as IsoDate, tokens: dec("4800"), specialPrizes: dec("16500") }

const rendered = (exchange: PrizeExchange): string => ((entry) => (entry.ok ? renderEntry(entry.value) : entry.error.type))(prizeExchangeEntry(exchange, PRICES))

describe("a prize exchange as an entry", () => {
  test("takes the tokens out at the day's rate, as special prizes and, for what lies between, odd prizes — and moves no cash", () => {
    expect(rendered(EXCHANGE)).toBe(
      [
        "2026-10-04 景品交換 ホシゾラ梅田店  ; parlor-id: hoshizora-umeda, savings: prize-exchange",
        '    資産:貯玉:ホシゾラ梅田店:4円        -4800 "玉(4円・ホシゾラ梅田店)" @ 3.5 JPY',
        "    純資産:特殊景品                     16500 JPY",
        "    純資産:端玉景品                     300 JPY",
        "",
      ].join("\n"),
    )
    expect(rendered(EXCHANGE)).not.toContain("現金")
  })

  test("writes no odd prizes where the special prizes are what the rate gives, and negative ones where they are more", () => {
    expect(rendered({ ...EXCHANGE, specialPrizes: dec("16800") })).not.toContain("端玉景品")
    expect(rendered({ ...EXCHANGE, specialPrizes: dec("17000") })).toContain("純資産:端玉景品                     -200 JPY")
  })

  test("writes the odd prizes in whole yen, and the part of a yen left over as the translation adjustment", () => {
    const over = rendered({ ...EXCHANGE, date: "2026-09-10" as IsoDate, tokens: dec("4801"), specialPrizes: dec("16500") })
    expect(over).toContain("純資産:端玉景品                     640 JPY")
    expect(over).toContain("純資産:換算調整勘定                 -0.43 JPY")
    const under = rendered({ ...EXCHANGE, date: "2026-09-10" as IsoDate, tokens: dec("4799"), specialPrizes: dec("16500") })
    expect(under).toContain("純資産:端玉景品                     632 JPY")
    expect(under).toContain("純資産:換算調整勘定                 0.43 JPY")
    expect(rendered(EXCHANGE)).not.toContain("換算調整勘定")
  })

  test("uses the rate in force on its own day", () => {
    expect(rendered({ ...EXCHANGE, date: "2026-09-10" as IsoDate, specialPrizes: dec("17136") })).toContain("@ 3.57 JPY")
  })

  test("is refused with nothing exchanged, part of a token, prizes below nothing, or no rate for the day", () => {
    expect(rendered({ ...EXCHANGE, tokens: dec("0") })).toBe("nothing-exchanged")
    expect(rendered({ ...EXCHANGE, tokens: dec("10.5") })).toBe("fractional-tokens")
    expect(rendered({ ...EXCHANGE, specialPrizes: dec("-1") })).toBe("negative-prizes")
    expect(rendered({ ...EXCHANGE, date: "2026-08-01" as IsoDate })).toBe("no-exchange-rate")
  })
})

describe("the accounts of a prize exchange", () => {
  test("are declared once, with the equity they stand under, in a book that lacks them", () => {
    const declared = withPrizesDeclared("account 費用                           ; type: X\n")
    expect(declared.split("\n").filter((line) => line.startsWith("account 純資産"))).toEqual(["account 純資産                         ; type: E", "account 純資産:開始残高", "account 純資産:残高調整", "account 純資産:特殊景品", "account 純資産:端玉景品", "account 純資産:換算調整勘定"])
    expect(withPrizesDeclared(declared)).toBe(declared)
  })
})
