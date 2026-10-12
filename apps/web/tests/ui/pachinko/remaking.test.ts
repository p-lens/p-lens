import { describe, expect, test } from "bun:test"

import type { Formula } from "../../../src/core/pachinko/formula"
import { remadeIn, startedFrom } from "../../../src/ui/features/pachinko/formulas/remaking"

const formula = (id: string, kind: Formula["kind"]): Formula => ({ id, kind }) as Formula

describe("the formula a new one of a machine starts from", () => {
  test("is the first in the list as shown that was not typed in, made again in the tab it was made in", () => {
    const from = startedFrom([formula("typed", "manual"), formula("solved", "simulated"), formula("sampled", "sampled")])
    expect<string | undefined>(from?.id).toBe("solved")
    expect(from === undefined ? undefined : remadeIn(from)).toBe("basis")
    expect<string | undefined>(startedFrom([formula("sampled", "sampled"), formula("solved", "simulated")])?.id).toBe("sampled")
  })

  test("is none where every formula was typed in, or the machine has none", () => {
    expect(startedFrom([formula("a", "manual"), formula("b", "manual")])).toBeUndefined()
    expect(startedFrom([])).toBeUndefined()
  })
})
