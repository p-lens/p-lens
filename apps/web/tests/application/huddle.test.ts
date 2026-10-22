import { describe, expect, test } from "bun:test"

import { dismissHuddlePlay, huddleLeftOn, huddleNow, joinHuddle, leaveHuddle, readHuddleAfter, showToHuddle, startHuddle, withdrawFromHuddle, type HuddlePorts } from "../../src/application/huddle"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { huddleCodeOf, type Huddle } from "../../src/core/huddle/huddle"
import { isShown, othersPlays } from "../../src/core/huddle/post"
import type { PachinkoDraft } from "../../src/core/live-play/draft"
import type { PlayId } from "../../src/core/play/play"
import { createDeflatePacker } from "../../src/sync/deflate/deflate-packer"
import { createWebCryptoSealer } from "../../src/sync/web-crypto/web-crypto-sealer"
import { memoryRelay } from "../support/sync"

const DAY = "2026-10-20" as IsoDate

const DRAFT: PachinkoDraft = {
  id: "p-1" as PlayId,
  date: DAY,
  venue: { type: "none", terms: undefined },
  gameKind: "pachinko",
  machine: "made-up",
  pachinko: undefined,
  cabinetNumber: undefined,
  startedAt: "2026-10-20T01:00:00.000Z",
  log: '{"spins":0,"outlay":0}\n',
}

/** One device's ports onto a shared relay: what it keeps of its huddle is its own. */
const deviceOn = (relay: HuddlePorts["relay"], ids: readonly string[]): HuddlePorts => {
  const kept: { huddle: string | undefined; next: number } = { huddle: undefined, next: 0 }
  return {
    relay,
    sealer: createWebCryptoSealer(),
    packer: createDeflatePacker(),
    preferences: { huddle: () => kept.huddle, setHuddle: (written) => (kept.huddle = written) },
    relayUrl: "https://relay.example",
    now: () => "2026-10-20T02:00:00.000Z",
    newId: () => ids[kept.next++] ?? `id-${kept.next}`,
  }
}

const unwrapped = <T>(outcome: { readonly ok: true; readonly value: T } | { readonly ok: false }): T => {
  if (!outcome.ok) throw new Error("expected ok")
  return outcome.value
}

describe("a huddle", () => {
  test("is joined by its code, and each shows the other their play", async () => {
    const relay = memoryRelay()
    const mine = deviceOn(relay, ["member-a", "commit-a1-xxxxxxxxxxxx", "commit-a2-xxxxxxxxxxxx"])
    const theirs = deviceOn(relay, ["member-b", "commit-b1-xxxxxxxxxxxx"])
    const begun: Huddle = unwrapped(startHuddle(mine, "アキラ", DAY))
    const joined: Huddle = unwrapped(joinHuddle(theirs, huddleCodeOf(begun), "ミサト", DAY))
    expect(joined.secret).toBe(begun.secret)
    expect(huddleNow(theirs.preferences, DAY)).toEqual(joined)

    expect(unwrapped(await showToHuddle(mine, begun, DRAFT, 0))).toBe(1)
    expect(unwrapped(await showToHuddle(theirs, joined, { ...DRAFT, machine: "theirs" }, 0))).toBe(2)
    expect(unwrapped(await showToHuddle(mine, begun, { ...DRAFT, log: '{"spins":0,"outlay":0}\n{"spins":20,"outlay":1000}\n' }, 0))).toBe(3)

    const read = unwrapped(await readHuddleAfter(theirs, joined, 0))
    expect(read.head).toBe(3)
    expect(read.entries.filter(isShown).map((post) => [post.name, post.play.machine])).toEqual([
      ["アキラ", "made-up"],
      ["ミサト", "theirs"],
      ["アキラ", "made-up"],
    ])
    expect(unwrapped(await readHuddleAfter(theirs, joined, 2)).entries.filter(isShown).map((post) => post.play.log)).toEqual(['{"spins":0,"outlay":0}\n{"spins":20,"outlay":1000}\n'])
  })

  test("lets a play taken back go from the others' lists", async () => {
    const relay = memoryRelay()
    const mine = deviceOn(relay, ["member-a", "commit-a1-xxxxxxxxxxxx", "commit-a2-xxxxxxxxxxxx"])
    const theirs = deviceOn(relay, ["member-b"])
    const begun: Huddle = unwrapped(startHuddle(mine, "アキラ", DAY))
    const joined: Huddle = unwrapped(joinHuddle(theirs, huddleCodeOf(begun), "ミサト", DAY))
    await showToHuddle(mine, begun, DRAFT, 0)
    expect(othersPlays(unwrapped(await readHuddleAfter(theirs, joined, 0)).entries, joined.member)).toHaveLength(1)
    expect(unwrapped(await withdrawFromHuddle(mine, begun, DRAFT.id, 1))).toBe(2)
    expect(othersPlays(unwrapped(await readHuddleAfter(theirs, joined, 0)).entries, joined.member)).toEqual([])
  })

  test("is an empty line until anything is shown on it", async () => {
    const device = deviceOn(memoryRelay(), ["member-a"])
    const begun = unwrapped(startHuddle(device, "アキラ", DAY))
    expect(unwrapped(await readHuddleAfter(device, begun, 0))).toEqual({ head: 0, entries: [] })
  })

  test("keeps a device the member it was when it reads the same code again, and is let go of on leaving", async () => {
    const device = deviceOn(memoryRelay(), ["member-a", "member-b"])
    const begun = unwrapped(startHuddle(device, "アキラ", DAY))
    dismissHuddlePlay(device.preferences, begun, "member-c", "p-9" as PlayId)
    const again = unwrapped(joinHuddle(device, huddleCodeOf(begun), "アキ", DAY))
    expect([again.member, again.dismissed]).toEqual(["member-a", ["member-c p-9"]])
    expect(huddleNow(device.preferences, DAY)?.dismissed).toEqual(["member-c p-9"])
    await leaveHuddle(device, again, 0)
    expect(huddleNow(device.preferences, DAY)).toBeUndefined()
  })

  test("marks the play of one who left as left for the others, until they come back by the same code and show it again", async () => {
    const relay = memoryRelay()
    const mine = deviceOn(relay, ["member-a", "commit-a1-xxxxxxxxxxxx", "commit-a2-xxxxxxxxxxxx", "commit-a3-xxxxxxxxxxxx"])
    const theirs = deviceOn(relay, ["member-b"])
    const begun = unwrapped(startHuddle(mine, "アキラ", DAY))
    const joined = unwrapped(joinHuddle(theirs, huddleCodeOf(begun), "ミサト", DAY))
    await showToHuddle(mine, begun, DRAFT, 0)
    expect(unwrapped(await leaveHuddle(mine, begun, 1))).toBe(2)
    const departedNow = async (): Promise<readonly boolean[]> => othersPlays(unwrapped(await readHuddleAfter(theirs, joined, 0)).entries, joined.member).map((shown) => shown.departed)
    expect(await departedNow()).toEqual([true])
    expect(huddleLeftOn(mine.preferences, DAY)?.name).toBe("アキラ")
    const back = unwrapped(joinHuddle(mine, huddleCodeOf(begun), "アキラ", DAY))
    expect([back.member, back.left]).toEqual(["member-a", undefined])
    expect(huddleLeftOn(mine.preferences, DAY)).toBeUndefined()
    await showToHuddle(mine, back, DRAFT, 2)
    expect(await departedNow()).toEqual([false])
  })

  test("is not joined by a book's code, nor begun where the build names no relay", () => {
    const device = deviceOn(memoryRelay(), [])
    expect(joinHuddle(device, "a".repeat(43), "アキラ", DAY)).toEqual({ ok: false, error: { type: "sync", problem: { type: "not-a-huddle-code" } } })
    expect(startHuddle({ ...device, relayUrl: undefined }, "アキラ", DAY)).toEqual({ ok: false, error: { type: "sync", problem: { type: "no-relay" } } })
  })
})
