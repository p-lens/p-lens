import type { Huddle } from "../../core/huddle/huddle"
import type { HuddleEntry } from "../../core/huddle/post"
import { Err, Ok, type Result } from "../../core/result/result"
import { tagValues, type NostrEvent } from "../core/event"
import { addressNameOf, entryOfState, huddleExpiration, stateOf } from "../core/huddle"
import { KIND } from "../core/kinds"
import type { Place } from "../core/seal"
import type { Keys } from "../port/keys"
import type { Connection, ConnectionState, Relays } from "../port/relay"
import { huddleLineKeysOf, type HuddleLineKeys, type HuddleProblem } from "./huddle"

/** How long the relay's word that it kept an entry is waited for. */
const ANSWER_WAIT_MS = 10_000

/** What a huddle's line tells whoever keeps it up: every entry as it now stands, and how reading and showing go. */
export interface HuddleLineHandlers {
  readonly onEntries: (entries: readonly HuddleEntry[]) => void
  /** Reading the line: caught up (nothing wrong), or why not. */
  readonly onHeard: (problem: HuddleProblem | undefined) => void
}

/** A huddle's line kept open: what is put on it, and how it is let go. */
export interface HuddleLine {
  readonly put: (entry: HuddleEntry) => Promise<Result<void, HuddleProblem>>
  /** Opens again at once, if it dropped: the page came back in sight, or the device online. */
  readonly reopen: () => void
  readonly close: () => void
}

type Held = { readonly states: Map<string, { readonly createdAt: number; readonly entry: HuddleEntry }>; readonly lastWritten: Map<string, number> }

const placeOf = (keys: HuddleLineKeys, d: string, pubkey: string): Place => ({ kind: KIND.huddleState, v: keys.v, d, pubkey })

const heardFrom = (state: ConnectionState): HuddleProblem | undefined => (state.type === "failing" ? { type: "unreachable" } : undefined)

/** The newer of two versions of one address: by when it was made, and, in one second, by the later entry. */
const newer = (held: { readonly createdAt: number; readonly entry: HuddleEntry } | undefined, createdAt: number, entry: HuddleEntry): boolean =>
  held === undefined || createdAt > held.createdAt || (createdAt === held.createdAt && entry.postedAt > held.entry.postedAt)

/**
 * Keeps a huddle's line open on its relay (PROTOCOL.md §8): every state on it
 * read at once and as it comes, each opened and held to its author, the
 * latest of each address kept, and every entry handed on as it changes; and
 * this device's entries sealed and signed by its key in the huddle.
 */
export const openHuddleLine = async (keys: Keys, relays: Relays, huddle: Huddle, handlers: HuddleLineHandlers): Promise<HuddleLine> => {
  const lineKeys = await huddleLineKeysOf(keys, huddle)
  const connection: Connection = relays.connect(huddle.relay)
  const held: Held = { states: new Map(), lastWritten: new Map() }
  const expiration = String(huddleExpiration(huddle.businessDay))

  const handOn = (): void =>
    handlers.onEntries([...held.states.values()].map(({ entry }) => entry).toSorted((one, other) => one.postedAt.localeCompare(other.postedAt)))

  const onEvent = async (event: NostrEvent): Promise<void> => {
    const d = tagValues(event, "d")[0]
    if (d === undefined) return
    const opened = await keys.openJson(lineKeys.sealKey, placeOf(lineKeys, d, event.pubkey), event.content)
    const entry = opened.ok ? entryOfState(event.pubkey, opened.value) : undefined
    const key = `${event.pubkey} ${d}`
    if (entry === undefined || !newer(held.states.get(key), event.created_at, entry)) return
    held.states.set(key, { createdAt: event.created_at, entry })
    handOn()
  }

  connection.onState((state) => handlers.onHeard(heardFrom(state)))
  connection.subscribe([{ kinds: [KIND.huddleState], "#v": [lineKeys.v] }], {
    onEvent: (event) => void onEvent(event),
    onCaughtUp: () => handlers.onHeard(undefined),
  })

  const signedEntry = async (entry: HuddleEntry): Promise<Result<NostrEvent, HuddleProblem>> => {
    const d = await keys.address(lineKeys.secret, addressNameOf(entry))
    const createdAt = Math.max(Math.floor(Date.now() / 1000), (held.lastWritten.get(d) ?? 0) + 1)
    const sealed = await keys.sealJson(lineKeys.sealKey, placeOf(lineKeys, d, lineKeys.participant.pubkey), stateOf(entry))
    if (!sealed.ok) return Err({ type: "too-large" })
    held.lastWritten.set(d, createdAt)
    return Ok(keys.sign(lineKeys.participant, { created_at: createdAt, kind: KIND.huddleState, tags: [["v", lineKeys.v], ["d", d], ["expiration", expiration]], content: sealed.value }))
  }

  return {
    put: async (entry) => {
      const event = await signedEntry(entry)
      if (!event.ok) return event
      const answer = await connection.publish(event.value, ANSWER_WAIT_MS)
      if (!answer.ok) return Err({ type: "unreachable" })
      return answer.value.type === "kept" ? Ok(undefined) : Err({ type: "refused", refusal: answer.value.refusal })
    },
    reopen: connection.reopen,
    close: connection.close,
  }
}

