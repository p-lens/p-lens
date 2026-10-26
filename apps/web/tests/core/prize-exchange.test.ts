import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { toPlainString } from "../../src/core/decimal/decimal"
import { renderEntry } from "../../src/core/journal/entry"
import { rentalPriceOfTier } from "../../src/core/parlor/terms"
import { exchangedOddPrizes, prizeExchangeEntry, withPrizesDeclared, type PrizeExchange } from "../../src/core/savings/prize-exchange"
import { PRICES, MALEHAN, dec } from "../support/values"

const EXCHANGE: PrizeExchange = { parlor: MALEHAN, pool: { kind: "ball", tier: "4円" }, date: "2026-09-10" as IsoDate, tokens: dec("1455"), specialPrizes: dec("5000") }

const rendered = (exchange: PrizeExchange): string => ((entry) => (entry.ok ? renderEntry(entry.value) : entry.error.type))(prizeExchangeEntry(exchange, PRICES))

describe("a prize exchange as an entry", () => {
  test("takes the tokens out at the day's rate, as special prizes, the odd tokens left as odd prizes at the rental price, and the translation adjustment for hledger to balance — and moves no cash", () => {
    expect(rendered(EXCHANGE)).toBe(
      [
        "2026-09-10 マレハン東京皇国第8支店 | 景品交換  ; parlor-id: malehan-tokyokoukoku, savings: prize-exchange",
        '    資産:貯玉:マレハン東京皇国第8支店:4円  -1455 "玉(4円・マレハン東京皇国第8支店)" @ 3.57 JPY',
        "    純資産:特殊景品                     5000 JPY",
        "    純資産:端玉景品                     220 JPY",
        "    純資産:換算調整勘定",
        "",
      ].join("\n"),
    )
    expect(rendered(EXCHANGE)).not.toContain("現金")
  })

  test("writes no odd prizes where the special prizes took every token, and negative ones where they took more", () => {
    expect(rendered({ ...EXCHANGE, tokens: dec("1400") })).not.toContain("端玉景品")
    expect(rendered({ ...EXCHANGE, tokens: dec("1400"), specialPrizes: dec("5100") })).toContain("純資産:端玉景品                     -112 JPY")
  })

  test("takes tokens exchanged for no special prize at all — sweets or general prizes alone — as odd prizes at the rental price, the rest to the translation adjustment", () => {
    expect(rendered({ ...EXCHANGE, tokens: dec("1400"), specialPrizes: dec("0") })).toBe(
      [
        "2026-09-10 マレハン東京皇国第8支店 | 景品交換  ; parlor-id: malehan-tokyokoukoku, savings: prize-exchange",
        '    資産:貯玉:マレハン東京皇国第8支店:4円  -1400 "玉(4円・マレハン東京皇国第8支店)" @ 3.57 JPY',
        "    純資産:端玉景品                     5600 JPY",
        "    純資産:換算調整勘定",
        "",
      ].join("\n"),
    )
    expect(rendered({ ...EXCHANGE, tokens: dec("20"), specialPrizes: dec("0") })).toContain("純資産:端玉景品                     80 JPY")
  })

  test("uses the rate in force on its own day", () => {
    expect(rendered({ ...EXCHANGE, date: "2026-10-04" as IsoDate })).toContain("@ 3.5 JPY")
  })

  test("is refused with nothing exchanged, part of a token, prizes below nothing, or no rate for the day", () => {
    expect(rendered({ ...EXCHANGE, tokens: dec("0") })).toBe("nothing-exchanged")
    expect(rendered({ ...EXCHANGE, tokens: dec("10.5") })).toBe("fractional-tokens")
    expect(rendered({ ...EXCHANGE, specialPrizes: dec("-1") })).toBe("negative-prizes")
    expect(rendered({ ...EXCHANGE, date: "2026-08-01" as IsoDate })).toBe("no-exchange-rate")
  })
})

describe("the odd prizes of an exchange", () => {
  const odd = (tokens: string, rate: string, specialPrizes: string, tier: string): string => toPlainString(exchangedOddPrizes(dec(tokens), dec(rate), dec(specialPrizes), rentalPriceOfTier(tier)))

  test("count the special prizes' tokens by the board the rate was rounded from, down or up, to two places or six", () => {
    expect(odd("1455", "3.57", "5000", "4円")).toBe("220")
    expect(odd("1455", "3.571429", "5000", "4円")).toBe("220")
    expect(odd("300", "17.86", "5000", "20円")).toBe("400")
    expect(odd("300", "17.857143", "5000", "20円")).toBe("400")
  })

  test("count the fewest whole tokens a special prize is exchanged from", () => {
    expect(odd("500", "19.42", "9500", "20円")).toBe("200")
    expect(odd("4800", "3.5", "16500", "4円")).toBe("340")
  })

  test("are the odd tokens at the rate where the tier names no rental price", () => {
    expect(odd("55", "3.57", "0", "レート不明")).toBe("196")
  })

  test("are what lies between at a rate of nothing, which only a hand can write", () => {
    expect(odd("100", "0", "300", "4円")).toBe("-300")
  })
})

describe("the accounts of a prize exchange", () => {
  test("are declared once, with the equity they stand under, in a book that lacks them", () => {
    const declared = withPrizesDeclared("account 費用                           ; type: X\n")
    expect(declared.split("\n").filter((line) => line.startsWith("account 純資産"))).toEqual(["account 純資産                         ; type: E", "account 純資産:開始残高", "account 純資産:残高調整", "account 純資産:特殊景品", "account 純資産:端玉景品", "account 純資産:換算調整勘定"])
    expect(withPrizesDeclared(declared)).toBe(declared)
  })
})

