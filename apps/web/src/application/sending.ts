import type { IsoDate } from "../core/calendar/calendar"
import { awaitsSending, type PlayDraft } from "../core/live-play/draft"
import { Err, Ok, mapErr, type Result } from "../core/result/result"
import { readInvitation } from "../core/sync/invitation"
import { sentDraftOf, sentDraftText } from "../core/sync/sent-draft"
import type { Destination, DestinationStore } from "../sync/port/destination-store"
import type { LineAccess, Relay } from "../sync/port/relay"
import { accessOf, type Sealer } from "../sync/port/sealer"
import type { DraftStorage } from "../storage/port/draft-storage"
import type { Outcome, SyncProblem } from "./errors"
import { fromDraft } from "./lift"
import { loadTodaysPlays } from "./live-play"
import { linksProblemOf } from "./kept-links"

/** Everything sending a play to another person reaches: the day's plays, the relay, the sealing, and the moment and a fresh id for what is sent. */
export interface SendingPorts {
  readonly drafts: DraftStorage
  readonly relay: Relay
  readonly sealer: Sealer
  readonly now: () => string
  readonly newId: () => string
}

/** How much of a sender's token a sent play carries to say who sent it: enough for the owner, who holds every token they gave out, to tell which. */
export const SENDER_MARK = 12

const problem = (found: SyncProblem): Outcome<never> => Err({ type: "sync", problem: found })

const fromSync = <T>(result: Result<T, SyncProblem>): Outcome<T> => mapErr(result, (found) => ({ type: "sync", problem: found }))

/** The books this device may send plays to, in the order it was let into them. */
export const destinationsOf = async (destinations: DestinationStore): Promise<Outcome<readonly Destination[]>> =>
  mapErr(await destinations.list(), (error) => ({ type: "sync", problem: linksProblemOf(error) }) as const)

/** Stop sending to a book: the invitation is let go of on this device. Its grant is the owner's to take away. */
export const forgetDestination = async (destinations: DestinationStore, destination: Destination): Promise<Outcome<void>> =>
  mapErr(await destinations.remove(destination.lineId), (error) => ({ type: "sync", problem: linksProblemOf(error) }) as const)

/** How many times a play is put on an inbox that moved under it before the sending is given up. */
const TRIES = 5

/**
 * Put a sealed play on the end of an inbox. A sender is never told what an
 * inbox holds, only — on being refused — where it ends: so it is put at
 * the start, which is taken unless the inbox is empty, and then where it
 * was said to end, again where another sender got there first.
 */
const putOn = async (relay: Relay, access: LineAccess, entry: { readonly commitId: string; readonly box: string }, after: number, left: number): Promise<Outcome<void>> => {
  const put = await relay.append(access, after, [entry])
  if (put.ok) return Ok(undefined)
  if (put.error.type !== "behind") return problem(put.error)
  return left > 0 ? putOn(relay, access, entry, put.error.head, left - 1) : problem({ type: "unsettled" })
}

/**
 * Send one of the day's plays to another person, as it stands: its
 * readings, what it is weighed by, and everything done to its log since it
 * began, sealed so that only the owner of the book it is sent to opens it.
 * Recorded or not makes no difference, and a play set right after it was
 * sent is sent again. What is sent is the play as the device keeps it, not
 * as a screen happens to hold it, so nothing of its history is left behind.
 * The play is marked as sent, with the log it then had.
 */
export const sendDraft = async (ports: SendingPorts, play: PlayDraft, destination: Destination): Promise<Outcome<PlayDraft>> => {
  const invitation = readInvitation(destination.code)
  if (invitation === undefined) return problem({ type: "not-a-pairing-code" })
  const kept = fromDraft(await ports.drafts.readDraft(play.id))
  if (!kept.ok) return kept
  const draft = kept.value
  const keys = fromSync(await ports.sealer.keysOf(destination.code))
  if (!keys.ok) return keys
  const commitId = ports.newId()
  const at = ports.now()
  const box = fromSync(await ports.sealer.seal(keys.value, commitId, sentDraftText(sentDraftOf(draft, invitation.token.slice(0, SENDER_MARK), at))))
  if (!box.ok) return box
  const put = await putOn(ports.relay, accessOf(destination.relayUrl, keys.value), { commitId, box: box.value }, 0, TRIES)
  if (!put.ok) return put
  const marked: PlayDraft = { ...draft, sent: [...(draft.sent ?? []), { lineId: destination.lineId, at, log: draft.log }] }
  const written = fromDraft(await ports.drafts.updateDraft(marked, draft.log))
  return written.ok ? Ok(marked) : written
}

/**
 * Send every play of the day that has not gone to a destination as it now
 * stands: those never sent there, and those set right since. How many went.
 * The first that cannot be sent stops the rest, which wait for another press.
 */
export const sendTodaysPlays = async (ports: SendingPorts, destination: Destination, businessDay: IsoDate): Promise<Outcome<number>> => {
  const plays = await loadTodaysPlays(ports.drafts, businessDay)
  if (!plays.ok) return plays
  return plays.value
    .filter((draft) => awaitsSending(draft, destination.lineId))
    .reduce<Promise<Outcome<number>>>(async (so, draft) => {
      const sent = await so
      if (!sent.ok) return sent
      const one = await sendDraft(ports, draft, destination)
      return one.ok ? Ok(sent.value + 1) : one
    }, Promise.resolve(Ok(0)))
}
