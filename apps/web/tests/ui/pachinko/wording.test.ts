import { describe, expect, test } from "bun:test"

import type { ModeView } from "../../../src/core/pachinko/world"
import { kindText, nextText, probabilityText, roundPayoutText, shareText } from "../../../src/ui/features/pachinko/formulas/spec-text"
import { borderText, kindName, formulaHandle, formulaText, formulaNameAmong, oneInText, payoutText } from "../../../src/ui/wording/pachinko/formula"

describe("a basis as it reads", () => {
  test("keeps probabilities in the form the sheet wrote them", () => {
    expect(probabilityText({ type: "ratio", numerator: 1, denominatorHundredths: 31_970 })).toBe("1/319.7")
    expect(probabilityText({ type: "percent", basisPoints: 8150 })).toBe("81.5%")
    expect(shareText(5000)).toBe("50%")
  })

  test("names a mode by its label, and each kind of mode as its spec sheet does", () => {
    const modes: readonly ModeView[] = [{ id: "m1", label: "神RUSH", kind: { type: "until-hit" }, allotment: [], onMiss: { type: "regular" }, luckyTrigger: undefined }]
    expect(nextText({ type: "mode", mode: "m1" }, modes)).toBe("神RUSH")
    expect(nextText({ type: "regular" }, modes)).toBe("通常")
    expect(kindText({ type: "special-time", spins: 100, chance: { type: "ratio", numerator: 1, denominatorHundredths: 5000 } })).toBe("ST 100回転・1/50")
    expect(kindText({ type: "rapid", spins: 100 })).toBe("時短 100回転")
    expect(kindText({ type: "leftover-queue", draws: 4 })).toBe("残保留 4個")
  })

  test("says what a round pays", () => {
    expect(roundPayoutText({ roundPayout: { type: "from-spec" } }, 140)).toBe("スペック通り（1R 140個）")
    expect(roundPayoutText({ roundPayout: { type: "measured", balls: 130 } }, 140)).toBe("実測 1R 130個")
  })
})

describe("a formula's figures as they read", () => {
  test("a formula is named by its figures, and by the head of its id only where another says the same", () => {
    const first = { id: "01a11b2f-9319-7e51-be84-1664946599c5", figures: { roundChanceOneIn: 16.24, payoutPerRound: 140 } }
    const twin = { id: "01a11b36-4d90-787f-b164-89510c939be9", figures: { roundChanceOneIn: 16.21, payoutPerRound: 140.02 } }
    const other = { id: "01a11b40-0000-7000-8000-000000000000", figures: { roundChanceOneIn: 7.5, payoutPerRound: 132.44 } }
    expect(formulaText(first.figures)).toBe("1/16.2・140.0玉")
    expect(formulaNameAmong(other, [first, twin, other])).toBe("1/7.50・132.4玉")
    expect(formulaNameAmong(first, [first, twin, other])).toBe("1/16.2・140.0玉（01a11b2f）")
    expect(formulaNameAmong(twin, [first, twin, other])).toBe("1/16.2・140.0玉（01a11b36）")
    expect(formulaHandle(first)).toBe("01a11b2f 1/16.2・140.0玉")
  })

  test("rates as one-in, with more precision where it matters", () => {
    expect(oneInText(100 / 3)).toBe("1/33.3")
    expect(oneInText(100 / 30)).toBe("1/3.33")
    expect(payoutText(140)).toBe("140.0玉")
    expect(borderText(5.952)).toBe("6.0回転/千円")
    expect(kindName("simulated")).toBe("基礎値から計算")
  })
})
