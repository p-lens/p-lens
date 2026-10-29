import { describe, expect, test } from "bun:test"

import type { ApplicationError, SyncProblem } from "../../src/application/errors"
import type { BookId } from "../../src/core/book/book"
import { describeBackupProblem } from "../../src/ui/wording/backup"
import { describeCatalogError } from "../../src/ui/wording/catalog"
import { ENGINE_UNLOADED, NO_CONNECTION, SERVER_TROUBLE } from "../../src/ui/wording/connection"
import { describeError } from "../../src/ui/wording/errors"
import { describeHuddleProblem, huddleLeftUntoldText, huddleRoomUnheardLabel, huddleUnheardText } from "../../src/ui/wording/huddle"
import { continueFailedText, followedUnheardText } from "../../src/ui/wording/play-line"
import { describeSyncProblem, membersFailedText, sendFailedText, syncFailedText } from "../../src/ui/wording/sync"

const sync = (problem: SyncProblem): ApplicationError => ({ type: "sync", problem })

/** Whether words carry anything a browser or a server said: a status code, an English word, or a cause's name. */
const raw = (words: string): boolean => /\d{3}|[A-Za-z]{4,}|unknown|Error/.test(words)

const OFFLINE: readonly SyncProblem[] = [{ type: "unreachable", detail: "TypeError: Failed to fetch" }, { type: "unreachable", detail: "TimeoutError: The operation timed out." }, { type: "unreadable-answer" }]

describe("no connection, as a person is told it", () => {
  test("reads the same for no signal, a timeout and a hall's login page, wherever the relay was asked", () => {
    OFFLINE.forEach((problem) => {
      expect(describeSyncProblem(problem)).toBe(NO_CONNECTION)
      expect(describeHuddleProblem(problem)).toBe(NO_CONNECTION)
      expect(sendFailedText(sync(problem))).toBe(NO_CONNECTION)
      expect(continueFailedText(sync(problem))).toContain(NO_CONNECTION)
    })
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
    const problems: readonly SyncProblem[] = [
      { type: "refused", status: 400, reason: "invalid" },
      { type: "server-trouble", status: 500 },
      { type: "too-large" },
      { type: "too-many" },
      { type: "links", detail: "QuotaExceededError: The quota has been exceeded." },
      { type: "sealing-unavailable", detail: "NotSupportedError" },
    ]
    problems.forEach((problem) => expect(raw(describeSyncProblem(problem))).toBe(false))
    expect(describeSyncProblem({ type: "server-trouble", status: 503 })).toBe(SERVER_TROUBLE)
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
  test("a sender shut out is told the owner may only need to open the app", () => {
    expect(sendFailedText(sync({ type: "shut-out" }))).toContain("持ち主にアプリを開いてもらって")
  })

  test("a book full of people says how many it lets in", () => {
    expect(membersFailedText(sync({ type: "too-large" }))).toContain("50人まで")
  })

  test("a round names the book that stopped it", () => {
    const failure = { bookId: "b-1" as BookId, error: sync({ type: "shut-out" }) }
    expect(syncFailedText(failure, () => "仲間の帳簿")).toStartWith("「仲間の帳簿」: ")
    expect(syncFailedText({ bookId: undefined, error: sync({ type: "stalled" }) }, () => undefined)).not.toContain("「")
  })

  test("a huddle is told as no book: as of when the others are, and that leaving went through here all the same", () => {
    expect(huddleUnheardText("2026-10-29T05:00:00.000Z", { type: "unreachable", detail: "x" })).toContain("時点のまま")
    expect(huddleUnheardText(undefined, { type: "unreadable-answer" })).toContain("まだ読めていません")
    expect(describeHuddleProblem({ type: "shut-out" })).not.toContain("帳簿")
    expect(huddleLeftUntoldText({ type: "unreachable", detail: "x" })).toContain("抜けました")
  })

  test("what is not up to date says why: no connection only where there was none", () => {
    expect(followedUnheardText(undefined, sync({ type: "unreachable", detail: "x" }))).toStartWith("つながらないため")
    expect(followedUnheardText(undefined, sync({ type: "server-trouble", status: 500 }))).toStartWith("サーバが応えないため")
    expect(followedUnheardText(undefined, { type: "storage", error: { type: "unavailable", detail: "x" } } as ApplicationError)).toStartWith("読み込めないため")
    expect(huddleRoomUnheardLabel(sync({ type: "unreachable", detail: "x" }))).toContain("つながっていません")
    expect(huddleRoomUnheardLabel(sync({ type: "server-trouble", status: 500 }))).not.toContain("つながって")
  })

  test("a formula the catalog gave up on with no word of its own is refused, never said to be taken unchecked", () => {
    expect(describeCatalogError({ type: "gave-up" })).toContain("登録しません")
  })
})
