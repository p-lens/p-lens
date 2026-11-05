import { describe, expect, test } from "bun:test"

import { describeBackupProblem } from "../../src/ui/wording/backup"
import { describeCatalogError } from "../../src/ui/wording/catalog"
import { ENGINE_UNLOADED, NO_CONNECTION } from "../../src/ui/wording/connection"
import { describeError } from "../../src/ui/wording/errors"
import { describeHuddleProblem, huddleLeftUntoldText, huddleRoomUnheardLabel, huddleUnheardText } from "../../src/ui/wording/huddle"

/** Whether words carry anything a browser or a server said: a status code, an English word, or a cause's name. */
const raw = (words: string): boolean => /\d{3}|[A-Za-z]{4,}|unknown|Error/.test(words)


describe("no connection, as a person is told it", () => {
  test("reads the same where a huddle's relay could not be reached", () => {
    expect(describeHuddleProblem({ type: "unreachable" })).toBe(NO_CONNECTION)
  })

  test("reads the same for the shared catalog, the backup store and the parlor list", () => {
    expect(describeCatalogError({ type: "unavailable", detail: "TypeError: Load failed" })).toBe(NO_CONNECTION)
    expect(describeCatalogError({ type: "unreadable-answer" })).toBe(NO_CONNECTION)
    expect(describeBackupProblem({ type: "unreachable", detail: "TypeError: Failed to fetch" })).toBe(NO_CONNECTION)
    expect(describeError({ type: "directory", error: { type: "unreachable", detail: "TypeError: Failed to fetch" } })).toContain(NO_CONNECTION)
  })

  test("says what to do: where there is signal, and a hall's Wi-Fi", () => {
    expect(NO_CONNECTION).toContain("電波のある所")
    expect(NO_CONNECTION).toContain("Wi-Fi")
  })
})

describe("a failure that is not the connection", () => {
  test("never shows a status, a reason or a cause the browser gave", () => {
    expect(raw(describeHuddleProblem({ type: "refused", refusal: { type: "invalid" } }))).toBe(false)
    expect(raw(describeCatalogError({ type: "refused", reason: "unexpected" }))).toBe(false)
    expect(raw(describeCatalogError({ type: "refused", reason: "method-not-allowed" }))).toBe(false)
    expect(raw(describeCatalogError({ type: "storage-unavailable" }))).toBe(false)
    expect(raw(describeBackupProblem({ type: "refused", status: 403, reason: "Insufficient Permission" }))).toBe(false)
    expect(raw(describeBackupProblem({ type: "store-trouble", status: 503 }))).toBe(false)
    expect(raw(describeBackupProblem({ type: "receipts", detail: "InvalidStateError" }))).toBe(false)
    expect(describeError({ type: "hledger", trouble: { kind: "unreachable", detail: "TypeError: Failed to fetch" } })).toBe(ENGINE_UNLOADED)
  })

  test("a registration whose answer never came says it may be in already", () => {
    expect(describeCatalogError({ type: "unanswered" })).toContain("登録できている場合があります")
  })
})

describe("words fitted to where they are said", () => {
  test("a huddle is told as no book: as of when the others are, and that leaving went through here all the same", () => {
    expect(huddleUnheardText("2026-10-29T05:00:00.000Z", { type: "unreachable" })).toContain("時点のまま")
    expect(huddleUnheardText(undefined, { type: "unreachable" })).toContain("まだ読めていません")
    expect(describeHuddleProblem({ type: "unreachable" })).toBe(NO_CONNECTION)
    expect(describeHuddleProblem({ type: "refused", refusal: { type: "restricted", reason: "full" } })).toContain("満員")
    expect(describeHuddleProblem({ type: "huddle-over" })).not.toContain("帳簿")
    expect(huddleLeftUntoldText({ type: "unreachable" })).toContain("抜けました")
  })

  test("what is not up to date says why: no connection only where there was none", () => {
    expect(huddleRoomUnheardLabel({ type: "unreachable" })).toContain("つながっていません")
    expect(huddleRoomUnheardLabel({ type: "refused", refusal: { type: "other" } })).not.toContain("つながって")
  })

  test("a formula the catalog gave up on with no word of its own is refused, never said to be taken unchecked", () => {
    expect(describeCatalogError({ type: "gave-up" })).toContain("登録しません")
  })
})
