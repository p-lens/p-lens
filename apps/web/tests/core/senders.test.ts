import { describe, expect, test } from "bun:test"

import type { Transaction } from "../../src/hledger/protocol/wire"
import { mergedSenderNames, senderNamesOf } from "../../src/core/report/senders"

const entry = (date: string, tags: readonly (readonly [string, string])[]): Transaction => ({ tdate: date, tdescription: "", ttags: tags as Transaction["ttags"], tpostings: [] })

describe("who sent a book's plays", () => {
  test("is each id by the name on its last tally, the entries coming newest first, and no one where no id is said", () => {
    const names = senderNamesOf([
      entry("2026-10-03", [["sender-id", "grant-1"], ["sender", "ハナヤマ"]]),
      entry("2026-10-01", [["sender-id", "grant-1"], ["sender", "ハンマ"]]),
      entry("2026-10-02", [["sender", "ジャック"]]),
    ])
    expect([...names]).toEqual([["grant-1", { name: "ハナヤマ", date: "2026-10-03" }]])
  })

  test("over several books is the later tally's name where two books name one id", () => {
    const older = new Map([["grant-1", { name: "ハンマ", date: "2026-10-01" }]])
    const newer = new Map([["grant-1", { name: "ハナヤマ", date: "2026-10-05" }], ["grant-2", { name: "ジャック", date: "2026-10-02" }]])
    expect([...mergedSenderNames([newer, older])]).toEqual([["grant-1", { name: "ハナヤマ", date: "2026-10-05" }], ["grant-2", { name: "ジャック", date: "2026-10-02" }]])
  })
})
