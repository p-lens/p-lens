import type { IsoDate } from "../core/calendar/calendar"
import { huddleInOn, huddleOn, huddlePlayKey, huddleText, readHuddle, secretOfHuddleCode, type Huddle } from "../core/huddle/huddle"
import { huddleDepartureOf, huddleEntryText, huddlePostOf, huddleWithdrawalOf, readHuddleEntry, type HuddleEntry } from "../core/huddle/post"
import type { PlayDraft } from "../core/live-play/draft"
import type { PlayId } from "../core/play/play"
import { Err, Ok, mapErr, type Result } from "../core/result/result"
import type { Preferences } from "../preferences/port/preferences"
import type { Packer } from "../sync/port/packer"
import type { LineAccess, Relay } from "../sync/port/relay"
import { accessOf, type LineKeys, type Sealer } from "../sync/port/sealer"
import type { Outcome, SyncProblem } from "./errors"

/** Everything a huddle reaches: the relay its line is on, the sealing and packing of what it carries, where the device keeps it, and the moment and a fresh id. */
export interface HuddlePorts {
  readonly relay: Relay
  readonly sealer: Sealer
  readonly packer: Packer
  readonly preferences: Pick<Preferences, "huddle" | "setHuddle">
  readonly relayUrl: string | undefined
  readonly now: () => string
  readonly newId: () => string
}

/** What a huddle's line has given so far: where it ends, and every play shown and taken back on it, in the order it was put there. */
export interface HuddleRead {
  readonly head: number
  readonly entries: readonly HuddleEntry[]
}

const problem = (found: SyncProblem): Outcome<never> => Err({ type: "sync", problem: found })

const fromSync = <T>(result: Result<T, SyncProblem>): Outcome<T> => mapErr(result, (found) => ({ type: "sync", problem: found }))

/** The huddle this device is in on a business day; none where it joined none, left the one it joined, or joined one on a day gone by. */
export const huddleNow = (preferences: Pick<Preferences, "huddle">, businessDay: IsoDate): Huddle | undefined => huddleInOn(readHuddle(preferences.huddle()), businessDay)

/** The huddle this device left on a business day, to be come back to by its code: none where it is still in one, or left none that day. */
export const huddleLeftOn = (preferences: Pick<Preferences, "huddle">, businessDay: IsoDate): Huddle | undefined => ((found) => (found?.left === true ? found : undefined))(huddleOn(readHuddle(preferences.huddle()), businessDay))

const kept = (ports: Pick<HuddlePorts, "preferences">, huddle: Huddle): Outcome<Huddle> => {
  ports.preferences.setHuddle(huddleText(huddle))
  return Ok(huddle)
}

/** Begin a huddle, under a name: a fresh secret, whose code the others read to join it. */
export const startHuddle = (ports: HuddlePorts, name: string, businessDay: IsoDate): Outcome<Huddle> =>
  ports.relayUrl === undefined ? problem({ type: "no-relay" }) : kept(ports, { secret: ports.sealer.newSecret(), businessDay, member: ports.newId(), name, dismissed: [] })

/**
 * Join a huddle by its code, under a name. A device that reads the code of
 * the huddle it is already in, or left that day, stays the member it was,
 * under the name given now, so that it is still one to the others, and
 * keeps what it let go of from its list. Come back, it shows its plays
 * again, and the others no longer mark it as left.
 */
export const joinHuddle = (ports: HuddlePorts, code: string, name: string, businessDay: IsoDate): Outcome<Huddle> => {
  const secret = secretOfHuddleCode(code)
  if (secret === undefined) return problem({ type: "not-a-huddle-code" })
  if (ports.relayUrl === undefined) return problem({ type: "no-relay" })
  const already = huddleOn(readHuddle(ports.preferences.huddle()), businessDay)
  const same = already?.secret === secret ? already : undefined
  return kept(ports, { secret, businessDay, member: same?.member ?? ports.newId(), name, dismissed: same?.dismissed ?? [] })
}

/** Go by another name in the huddle this device is in: its plays are shown again under it, so the others see it too. */
export const renameInHuddle = (preferences: Pick<Preferences, "setHuddle">, huddle: Huddle, name: string): Huddle => {
  const renamed = { ...huddle, name }
  preferences.setHuddle(huddleText(renamed))
  return renamed
}

/** Let one of the others' plays go from this device's list: theirs, and the others', stay as they are. */
export const dismissHuddlePlay = (preferences: Pick<Preferences, "setHuddle">, huddle: Huddle, member: string, playId: PlayId): Huddle => {
  const key = huddlePlayKey(member, playId)
  const letGo = huddle.dismissed.includes(key) ? huddle : { ...huddle, dismissed: [...huddle.dismissed, key] }
  preferences.setHuddle(huddleText(letGo))
  return letGo
}


const lineOf = async (ports: HuddlePorts, huddle: Huddle): Promise<Outcome<{ readonly access: LineAccess; readonly keys: LineKeys }>> => {
  if (ports.relayUrl === undefined) return problem({ type: "no-relay" })
  const keys = fromSync(await ports.sealer.huddleKeysOf(huddle.secret))
  return keys.ok ? Ok({ access: accessOf(ports.relayUrl, keys.value), keys: keys.value }) : keys
}

/** How many times a play is put on a line that moved under it before the showing is given up. */
const TRIES = 5

const putOn = async (relay: Relay, access: LineAccess, entry: { readonly commitId: string; readonly box: string }, after: number, left: number): Promise<Outcome<number>> => {
  const put = await relay.append(access, after, [entry])
  if (put.ok) return Ok(put.value.head)
  if (put.error.type !== "behind") return problem(put.error)
  return left > 0 ? putOn(relay, access, entry, put.error.head, left - 1) : problem({ type: "unsettled" })
}

/**
 * Put an entry on the end of the huddle's line, sealed and packed, where
 * the line was last seen to end — and where it was said to end instead,
 * should another have put theirs there first. Where the line then ends.
 */
const putEntry = async (ports: HuddlePorts, huddle: Huddle, entry: HuddleEntry, after: number): Promise<Outcome<number>> => {
  const line = await lineOf(ports, huddle)
  if (!line.ok) return line
  const commitId = ports.newId()
  const box = fromSync(await ports.sealer.seal(line.value.keys, commitId, ports.packer.pack(huddleEntryText(entry))))
  if (!box.ok) return box
  return putOn(ports.relay, line.value.access, { commitId, box: box.value }, after, TRIES)
}

/** Show one play to the huddle as it stands. Where the line then ends. */
export const showToHuddle = (ports: HuddlePorts, huddle: Huddle, draft: PlayDraft, after: number): Promise<Outcome<number>> => putEntry(ports, huddle, huddlePostOf(draft, huddle, ports.now()), after)

/** Take a play back from the huddle, as one is shown: the others let it go. Where the line then ends. */
export const withdrawFromHuddle = (ports: HuddlePorts, huddle: Huddle, playId: PlayId, after: number): Promise<Outcome<number>> => putEntry(ports, huddle, huddleWithdrawalOf(playId, huddle, ports.now()), after)

/**
 * Leave the huddle: the device keeps it as left, and shows and is shown
 * nothing more, and says so on the line, so that the others mark the play
 * it was on as left. What it showed stays there for them. Where the line
 * then ends; the device has left it whether the line was reached or not.
 */
export const leaveHuddle = (ports: HuddlePorts, huddle: Huddle, after: number): Promise<Outcome<number>> => {
  ports.preferences.setHuddle(huddleText({ ...huddle, left: true }))
  return putEntry(ports, huddle, huddleDepartureOf(huddle, ports.now()), after)
}

const opened = async (ports: HuddlePorts, keys: LineKeys, entry: { readonly commitId: string; readonly box: string }): Promise<HuddleEntry | undefined> => {
  const text = await ports.sealer.open(keys, entry.commitId, entry.box)
  const unpacked = text.ok ? ports.packer.unpack(text.value) : undefined
  return unpacked === undefined ? undefined : readHuddleEntry(unpacked)
}

const readFrom = async (ports: HuddlePorts, line: { readonly access: LineAccess; readonly keys: LineKeys }, so: HuddleRead): Promise<Outcome<HuddleRead>> => {
  const read = await ports.relay.entriesAfter(line.access, so.head)
  if (!read.ok) return read.error.type === "line-missing" ? Ok(so) : problem(read.error)
  if (read.value.entries.length === 0) return Ok(so)
  const entries = (await Promise.all(read.value.entries.map((entry) => opened(ports, line.keys, entry)))).filter((entry): entry is HuddleEntry => entry !== undefined)
  const next: HuddleRead = { head: read.value.entries.at(-1)?.seq ?? so.head, entries: [...so.entries, ...entries] }
  return next.head >= read.value.head ? Ok(next) : readFrom(ports, line, next)
}

/**
 * What the huddle has shown and taken back since a place on its line, read
 * to its end: a line nobody has put anything on yet is an empty one, and
 * an entry this app cannot open or read is passed over.
 */
export const readHuddleAfter = async (ports: HuddlePorts, huddle: Huddle, after: number): Promise<Outcome<HuddleRead>> => {
  const line = await lineOf(ports, huddle)
  return line.ok ? readFrom(ports, line.value, { head: after, entries: [] }) : line
}
