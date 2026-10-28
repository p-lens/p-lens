import { describe, expect, test } from "bun:test"

import type { IsoDate } from "../../src/core/calendar/calendar"
import { invitationCode } from "../../src/core/sync/invitation"
import type { LineKeys } from "../../src/sync/port/sealer"
import { createWebCryptoSealer } from "../../src/sync/web-crypto/web-crypto-sealer"

const sealer = createWebCryptoSealer()
const SECRET = sealer.newSecret()
const TODAY = "2026-10-28" as IsoDate
const YESTERDAY = "2026-10-27" as IsoDate

const keysOf = async (made: Promise<{ readonly ok: true; readonly value: LineKeys } | { readonly ok: false }>): Promise<LineKeys> => {
  const keys = await made
  if (!keys.ok) throw new Error("expected keys")
  return keys.value
}

/** Whether what one set of keys sealed the other opens. */
const opensWith = async (sealing: LineKeys, opening: LineKeys): Promise<boolean> => {
  const box = await sealer.seal(sealing, "commit-1", "a play")
  if (!box.ok) throw new Error("expected a box")
  return (await sealer.open(opening, "commit-1", box.value)).ok
}

describe("a book's plays' line", () => {
  test("is the same line on every device with the book's secret, for the same day", async () => {
    const [one, other] = [await keysOf(sealer.playsKeysOf(SECRET, TODAY)), await keysOf(sealer.playsKeysOf(SECRET, TODAY))]
    expect([one.lineId, one.token]).toEqual([other.lineId, other.token])
    expect(await opensWith(one, other)).toBe(true)
  })

  test("is another line each day, and none of the book's, its inbox's or its huddle's", async () => {
    const today = await keysOf(sealer.playsKeysOf(SECRET, TODAY))
    const others = [await keysOf(sealer.playsKeysOf(SECRET, YESTERDAY)), await keysOf(sealer.keysOf(SECRET)), await keysOf(sealer.inboxKeysOf(SECRET)), await keysOf(sealer.huddleKeysOf(SECRET))]
    const ids = [today, ...others].flatMap((keys) => [keys.lineId, keys.token])
    expect(new Set(ids).size).toBe(ids.length)
    expect(await Promise.all(others.map((keys) => opensWith(today, keys)))).toEqual([false, false, false, false])
  })

  test("is drawn from a book's own secret alone: an invitation to the book opens none", async () => {
    const editor = await sealer.invitationOf(SECRET, "editor", "")
    const sender = await sealer.invitationOf(SECRET, "sender", "帳簿")
    if (!editor.ok || !sender.ok) throw new Error("expected invitations")
    expect(await sealer.playsKeysOf(invitationCode(editor.value), TODAY)).toEqual({ ok: false, error: { type: "bad-secret" } })
    expect(await sealer.playsKeysOf(invitationCode(sender.value), TODAY)).toEqual({ ok: false, error: { type: "bad-secret" } })
    expect(await sealer.playsKeysOf("short", TODAY)).toEqual({ ok: false, error: { type: "bad-secret" } })
  })
})
