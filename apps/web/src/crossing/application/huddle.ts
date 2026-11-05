import type { IsoDate } from "../../core/calendar/calendar"
import { huddleOn, huddleText, readHuddle, type Huddle } from "../../core/huddle/huddle"
import { Err, Ok, type Result } from "../../core/result/result"
import type { Preferences } from "../../preferences/port/preferences"
import { fromBase64Url, toBase64Url } from "../core/bytes"
import { readHuddleCode } from "../core/huddle"
import { LABEL, NAMES } from "../core/keyring"
import type { Refusal } from "../core/messages"
import type { Keys, SigningKey } from "../port/keys"
import type { Relays } from "../port/relay"
import type { RelayInformation } from "../port/relay-information"

/**
 * Why something of a huddle could not be done.
 *
 * - `no-relay`: this build names no relay to begin a huddle on.
 * - `not-a-huddle-code`: what was read is no huddle's code.
 * - `huddle-over`: the code is of a business day other than today's.
 * - `unreachable`: the relay did not answer, or the device is offline.
 * - `refused`: the relay would not keep what was sent, and why.
 * - `too-large`: a play too large to be shown in one seal.
 */
export type HuddleProblem =
  | { readonly type: "no-relay" }
  | { readonly type: "not-a-huddle-code" }
  | { readonly type: "huddle-over" }
  | { readonly type: "unreachable" }
  | { readonly type: "refused"; readonly refusal: Refusal }
  | { readonly type: "too-large" }

/** What a huddle reaches: the keys, the relays and what they say of themselves, where the device keeps the huddle, and the relay this build begins huddles on. */
export interface HuddlePorts {
  readonly keys: Keys
  readonly relays: Relays
  readonly information: RelayInformation
  readonly preferences: Pick<Preferences, "huddle" | "setHuddle">
  readonly relayUrl: string | undefined
}

/** What a huddle's line is opened, sealed and signed with, drawn from its secret, its business day and this device's seed. */
export interface HuddleLineKeys {
  readonly secret: Uint8Array
  readonly v: string
  readonly sealKey: Uint8Array
  readonly participant: SigningKey
}

const bytesOf = (text: string): Uint8Array<ArrayBuffer> => fromBase64Url(text) ?? new Uint8Array(32)

/** The key a device signs with in a huddle (PROTOCOL.md §8): the same device, by the same seed, is always the same participant. */
const participantOf = async (keys: Keys, secret: Uint8Array, seed: Uint8Array, day: IsoDate): Promise<SigningKey> => {
  const root = await keys.derive(secret, new Uint8Array([...new TextEncoder().encode(LABEL.device), ...seed]))
  return keys.signingKey(root, NAMES.participant(day))
}

export const huddleLineKeysOf = async (keys: Keys, huddle: Huddle): Promise<HuddleLineKeys> => {
  const secret = bytesOf(huddle.secret)
  return {
    secret,
    v: await keys.locator(secret, NAMES.huddle(huddle.businessDay)),
    sealKey: await keys.sealKey(secret, NAMES.huddle(huddle.businessDay)),
    participant: await participantOf(keys, secret, bytesOf(huddle.seed), huddle.businessDay),
  }
}

const kept = (ports: Pick<HuddlePorts, "preferences">, huddle: Huddle): Result<Huddle, never> => {
  ports.preferences.setHuddle(huddleText(huddle))
  return Ok(huddle)
}

const LABEL_DIGITS = 2

/** A relay's address for a new line: followed by a label drawn at random where the relay gives lines labels (PROTOCOL.md §10). */
const addressFor = (relayUrl: string, labels: number): string =>
  labels === 0 ? relayUrl : `${relayUrl.replace(/\/+$/, "")}/${Math.floor(Math.random() * labels).toString(16).padStart(LABEL_DIGITS, "0")}`

const memberOf = async (keys: Keys, secret: string, seed: string, day: IsoDate): Promise<string> => (await participantOf(keys, bytesOf(secret), bytesOf(seed), day)).pubkey

/** Begin a huddle, under a name: a fresh secret on the relay this build names, whose code the others read to join it. */
export const startHuddle = async (ports: HuddlePorts, name: string, day: IsoDate): Promise<Result<Huddle, HuddleProblem>> => {
  if (ports.relayUrl === undefined) return Err({ type: "no-relay" })
  const labels = await ports.information.labelsOf(ports.relayUrl)
  if (!labels.ok) return Err({ type: "unreachable" })
  const secret = toBase64Url(ports.keys.newSecret())
  const seed = toBase64Url(ports.keys.newSecret())
  return kept(ports, { secret, businessDay: day, relay: addressFor(ports.relayUrl, labels.value), seed, member: await memberOf(ports.keys, secret, seed, day), name, dismissed: [] })
}

/**
 * Join a huddle by its code, under a name. A device that reads the code of
 * the huddle it is already in, or left that day, keeps its seed and so stays
 * the member it was, under the name given now, and keeps what it let go of
 * from its list. A code of another business day is over.
 */
export const joinHuddle = async (ports: HuddlePorts, code: string, name: string, day: IsoDate): Promise<Result<Huddle, HuddleProblem>> => {
  const read = readHuddleCode(code)
  if (read === undefined) return Err({ type: "not-a-huddle-code" })
  if (read.day !== day) return Err({ type: "huddle-over" })
  const already = huddleOn(readHuddle(ports.preferences.huddle()), day)
  const same = already?.secret === read.secret ? already : undefined
  const seed = same?.seed ?? toBase64Url(ports.keys.newSecret())
  return kept(ports, { secret: read.secret, businessDay: day, relay: read.relay, seed, member: await memberOf(ports.keys, read.secret, seed, day), name, dismissed: same?.dismissed ?? [] })
}
