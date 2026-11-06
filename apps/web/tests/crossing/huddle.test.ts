import { afterEach, describe, expect, test } from "bun:test"

import { huddleNow } from "../../src/application/huddle"
import type { IsoDate } from "../../src/core/calendar/calendar"
import { huddleText, type Huddle } from "../../src/core/huddle/huddle"
import { huddleArrivalOf, huddleDepartureOf, huddlePostOf, huddleWithdrawalOf, othersHere, othersPlays, type HuddleEntry } from "../../src/core/huddle/post"
import type { PachinkoDraft } from "../../src/core/live-play/draft"
import type { PlayId } from "../../src/core/play/play"
import { Ok } from "../../src/core/result/result"
import { joinHuddle, startHuddle, type HuddlePorts } from "../../src/crossing/application/huddle"
import { openHuddleLine, type HuddleLine } from "../../src/crossing/application/huddle-line"
import { createWebCryptoKeys } from "../../src/crossing/browser/web-crypto-keys"
import { createWebSocketRelays } from "../../src/crossing/browser/websocket-relays"
import { huddleCodeOf, huddleExpiration, readHuddleCode } from "../../src/crossing/core/huddle"
import { startTestRelay } from "./support/test-relay"

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

const keys = createWebCryptoKeys()
const relays = createWebSocketRelays()

const held = { relay: undefined as ReturnType<typeof startTestRelay> | undefined, lines: [] as HuddleLine[] }

afterEach(() => {
  held.lines.forEach((line) => line.close())
  held.lines = []
  held.relay?.stop()
})

/** One device on a relay, giving lines the labels said: what it keeps of its huddle is its own. */
const deviceOn = (relayUrl: string | undefined, labels = 0): HuddlePorts => {
  const kept: { huddle: string | undefined } = { huddle: undefined }
  return {
    keys,
    relays,
    information: { labelsOf: async () => Ok(labels) },
    preferences: { huddle: () => kept.huddle, setHuddle: (written) => (kept.huddle = written) },
    relayUrl,
  }
}

const unwrapped = <T>(outcome: { readonly ok: true; readonly value: T } | { readonly ok: false }): T => {
  if (!outcome.ok) throw new Error("expected ok")
  return outcome.value
}

const until = async (condition: () => boolean, ms = 3_000): Promise<void> => {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > ms) throw new Error("waited too long")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/** A huddle's line kept open, with every entry it handed on as it last stood. */
const opened = async (huddle: Huddle) => {
  const seen: { entries: readonly HuddleEntry[]; caughtUp: boolean } = { entries: [], caughtUp: false }
  const line = await openHuddleLine(keys, relays, huddle, {
    onEntries: (entries) => (seen.entries = entries),
    onHeard: (problem) => (seen.caughtUp = problem === undefined),
  })
  held.lines.push(line)
  await until(() => seen.caughtUp)
  return { line, seen }
}

describe("a huddle's code", () => {
  test("carries its secret, its business day and its relay, and is read back however it was pasted", () => {
    const huddle = { secret: "a".repeat(43), businessDay: DAY, relay: "wss://relay.example.com/3f" }
    expect(huddleCodeOf(huddle)).toBe(`p-lens-huddle:2:${"a".repeat(43)}:2026-10-20:wss://relay.example.com/3f`)
    expect(readHuddleCode(`  ${huddleCodeOf(huddle)}\n`)).toEqual({ secret: "a".repeat(43), day: DAY, relay: "wss://relay.example.com/3f" })
  })

  test.each([["a bare secret", "a".repeat(43)], ["the old code", `p-lens-huddle:1:${"a".repeat(43)}`], ["a code with no relay", `p-lens-huddle:2:${"a".repeat(43)}:2026-10-20:`], ["a relay by http", `p-lens-huddle:2:${"a".repeat(43)}:2026-10-20:https://relay.example.com`]])("is not %s", (_, text) => {
    expect(readHuddleCode(text)).toBeUndefined()
  })

  test("lets its states run out two whole days after its day begins", () => {
    expect(huddleExpiration(DAY)).toBe(Date.UTC(2026, 9, 22) / 1000)
  })
})

describe("beginning and joining a huddle", () => {
  test("puts it on a label of the relay where the relay gives labels", async () => {
    const begun = unwrapped(await startHuddle(deviceOn("wss://relay.example.com", 256), "ルパン", DAY))
    expect(begun.relay).toMatch(/^wss:\/\/relay\.example\.com\/[0-9a-f]{2}$/)
    expect(unwrapped(await startHuddle(deviceOn("wss://plain.example.com"), "ルパン", DAY)).relay).toBe("wss://plain.example.com")
  })

  test("makes a device the same member when it reads the same code again, keeping what it let go of", async () => {
    const device = deviceOn("wss://relay.example.com")
    const begun = unwrapped(await startHuddle(device, "ルパン", DAY))
    device.preferences.setHuddle(huddleText({ ...begun, dismissed: ["x p-9"], left: true }))
    const again = unwrapped(await joinHuddle(device, huddleCodeOf(begun), "すばやいおサル", DAY))
    expect([again.member, again.seed, again.dismissed, again.left]).toEqual([begun.member, begun.seed, ["x p-9"], undefined])
    expect(huddleNow(device.preferences, DAY)?.name).toBe("すばやいおサル")
  })

  test("makes two devices two members", async () => {
    const begun = unwrapped(await startHuddle(deviceOn("wss://relay.example.com"), "ルパン", DAY))
    const joined = unwrapped(await joinHuddle(deviceOn(undefined), huddleCodeOf(begun), "ジゲン", DAY))
    expect(joined.member).not.toBe(begun.member)
    expect(joined.relay).toBe(begun.relay)
  })

  test("refuses what is no huddle's code, a code of another day, and beginning with no relay", async () => {
    const device = deviceOn("wss://relay.example.com")
    expect(await joinHuddle(device, "a".repeat(43), "ルパン", DAY)).toEqual({ ok: false, error: { type: "not-a-huddle-code" } })
    const begun = unwrapped(await startHuddle(device, "ルパン", DAY))
    expect(await joinHuddle(deviceOn(undefined), huddleCodeOf(begun), "ジゲン", "2026-10-21" as IsoDate)).toEqual({ ok: false, error: { type: "huddle-over" } })
    expect(await startHuddle(deviceOn(undefined), "ルパン", DAY)).toEqual({ ok: false, error: { type: "no-relay" } })
  })

  test("says the relay was not reached where it would not say what it is", async () => {
    const device: HuddlePorts = { ...deviceOn("wss://relay.example.com"), information: { labelsOf: async () => ({ ok: false, error: { type: "unreachable" } }) } }
    expect(await startHuddle(device, "ルパン", DAY)).toEqual({ ok: false, error: { type: "unreachable" } })
  })
})

describe("a huddle's line", () => {
  const twoDevices = async () => {
    held.relay = startTestRelay()
    const begun = unwrapped(await startHuddle(deviceOn(held.relay.url), "ルパン", DAY))
    const joined = unwrapped(await joinHuddle(deviceOn(undefined), huddleCodeOf(begun), "ジゲン", DAY))
    return { begun, joined, mine: await opened(begun), theirs: await opened(joined) }
  }

  test("shows one device's play to the other as it is shown", async () => {
    const { begun, joined, mine, theirs } = await twoDevices()
    expect(await mine.line.put(huddlePostOf(DRAFT, begun, "2026-10-20T02:00:00.000Z"))).toEqual({ ok: true, value: undefined })
    await until(() => othersPlays(theirs.seen.entries, joined.member).length === 1)
    expect(othersPlays(theirs.seen.entries, joined.member)[0]?.post.name).toBe("ルパン")
  })

  test("keeps a play's latest showing alone, and lets it go once it is taken back", async () => {
    const { begun, joined, mine, theirs } = await twoDevices()
    await mine.line.put(huddlePostOf(DRAFT, begun, "2026-10-20T02:00:00.000Z"))
    await mine.line.put(huddlePostOf({ ...DRAFT, log: `${DRAFT.log}{"spins":30,"outlay":1000}\n` }, begun, "2026-10-20T02:01:00.000Z"))
    await until(() => othersPlays(theirs.seen.entries, joined.member)[0]?.post.postedAt === "2026-10-20T02:01:00.000Z")
    expect(theirs.seen.entries.length).toBe(1)
    await mine.line.put(huddleWithdrawalOf(DRAFT.id, begun, "2026-10-20T02:02:00.000Z"))
    await until(() => othersPlays(theirs.seen.entries, joined.member).length === 0)
  })

  test("marks one who left as left, until they show anything again", async () => {
    const { begun, joined, mine, theirs } = await twoDevices()
    await mine.line.put(huddlePostOf(DRAFT, begun, "2026-10-20T02:00:00.000Z"))
    await mine.line.put(huddleDepartureOf(begun, "2026-10-20T02:05:00.000Z"))
    await until(() => othersPlays(theirs.seen.entries, joined.member)[0]?.departed === true)
    await mine.line.put(huddlePostOf(DRAFT, begun, "2026-10-20T02:10:00.000Z"))
    await until(() => othersPlays(theirs.seen.entries, joined.member)[0]?.departed === false)
  })

  test("has one come in, playing nothing yet, in the others' room, a third joining by the second's code among them", async () => {
    const { begun, joined, mine, theirs } = await twoDevices()
    expect(await theirs.line.put(huddleArrivalOf(joined, "2026-10-20T02:00:00.000Z"))).toEqual({ ok: true, value: undefined })
    await until(() => othersHere(mine.seen.entries, begun.member).length === 1)
    const third = unwrapped(await joinHuddle(deviceOn(undefined), huddleCodeOf(joined), "ゴエモン", DAY))
    const thirds = await opened(third)
    await thirds.line.put(huddleArrivalOf(third, "2026-10-20T02:05:00.000Z"))
    await until(() => othersHere(mine.seen.entries, begun.member).length === 2 && othersHere(theirs.seen.entries, joined.member).length === 1)
    expect(othersHere(mine.seen.entries, begun.member).map((other) => other.name)).toEqual(["ジゲン", "ゴエモン"])
  })

  test("gives a device joining late everything shown so far", async () => {
    const { begun, mine } = await twoDevices()
    await mine.line.put(huddlePostOf(DRAFT, begun, "2026-10-20T02:00:00.000Z"))
    const late = unwrapped(await joinHuddle(deviceOn(undefined), huddleCodeOf(begun), "ゴエモン", DAY))
    const lately = await opened(late)
    await until(() => othersPlays(lately.seen.entries, late.member).length === 1)
  })

  test("takes nobody's word for another: a play shown under another member's name is dropped", async () => {
    const { begun, joined, theirs } = await twoDevices()
    const impostor = unwrapped(await joinHuddle(deviceOn(undefined), huddleCodeOf(begun), "ニセモノ", DAY))
    const impostorLine = await opened(impostor)
    await impostorLine.line.put({ ...huddlePostOf(DRAFT, begun, "2026-10-20T02:00:00.000Z"), member: begun.member })
    await impostorLine.line.put(huddlePostOf({ ...DRAFT, id: "p-2" as PlayId }, impostor, "2026-10-20T02:00:01.000Z"))
    await until(() => theirs.seen.entries.length === 1)
    expect(othersPlays(theirs.seen.entries, joined.member).map((shown) => shown.post.member)).toEqual([impostor.member])
  })

  test("seals everything it carries: the relay holds no parlor, machine or name", async () => {
    const { begun, mine } = await twoDevices()
    await mine.line.put(huddlePostOf({ ...DRAFT, machine: "テスト機 A" }, begun, "2026-10-20T02:00:00.000Z"))
    const kept = JSON.stringify(held.relay?.events() ?? [])
    expect(kept).not.toContain("テスト機")
    expect(kept).not.toContain("ルパン")
    expect(kept).not.toContain("p-1")
  })
})
