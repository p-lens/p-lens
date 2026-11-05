/**
 * What crosses devices, over Nostr by PLN-1 (p-lens-relay's PROTOCOL.md):
 * walled off from everything that plays alone, which reaches nothing here.
 * The composition makes it (`createCrossing`) only where the build names a
 * relay; the screens reach it through `CrossingServices` on the context, and
 * through what this index gives them.
 */
import type { BookSession } from "../application/book-session"
import type { Member } from "../core/book/book"
import type { IsoDate } from "../core/calendar/calendar"
import type { DraftStorage } from "../storage/port/draft-storage"
import type { Preferences } from "../preferences/port/preferences"
import type { BookSyncPorts } from "./application/book-sync"
import type { HuddlePorts } from "./application/huddle"
import { createFetchRelayInformation } from "./browser/fetch-relay-information"
import { createIndexedDbLineStore } from "./browser/indexed-db-line-store"
import { createWebCryptoKeys } from "./browser/web-crypto-keys"
import { createWebSocketRelays } from "./browser/websocket-relays"

export { joinHuddle, startHuddle, type HuddleProblem } from "./application/huddle"
export { openHuddleLine, type HuddleLine } from "./application/huddle-line"
export { huddleCodeOf, showingEvery } from "./core/huddle"
export { openBookLine, type BookConflict, type BookLine, type LineStanding } from "./application/book-line"
export { joinByCode, type Joined } from "./application/joining"
export { openInboxLine, type InboxLine, type PlaySender, type ReceivedPlay } from "./application/inbox-line"
export { openSendingLine, type SendingLine, type SendingProblem } from "./application/sending-line"
export { isOwnersLink, startSync, stopSync, syncCodeOf, type BookSyncProblem, type OwnersLink } from "./application/book-sync"
export type { SharedMember } from "./application/book-sharing"
export type { InvitedRole, MemberRole } from "./core/book/roster"
export { clearCrossingDatabase } from "./browser/indexed-db-line-store"
export { contestedIn, outlineOf, settledText, type FileConflict, type MergePart, type Side } from "./core/book/merge"
export { openPlaysLine, type PlaysLine, type TakeOverProblem } from "./application/plays-line"
export type { BookLink, Destination, FollowedPlay, SentPlay } from "./port/line-store"
export type { Connection } from "./port/relay"
export type { Refusal } from "./core/messages"

/** Everything that crosses devices, made once for the app: huddles, and books — between one's own devices, shared, and sent plays to. */
export interface CrossingServices {
  readonly huddle: HuddlePorts
  readonly books: BookSyncPorts
}

/** What the app hands what crosses devices: where a huddle is kept, the books, the plays, who uses the device, and the business day. */
export interface CrossingNeeds {
  readonly preferences: Pick<Preferences, "huddle" | "setHuddle">
  readonly session: Pick<BookSession, "books" | "stored" | "fold" | "adoptBook">
  readonly drafts: Pick<DraftStorage, "listDrafts" | "createDraft" | "deleteDraft">
  readonly me: Member
  readonly businessDay: () => IsoDate
  readonly newId: () => string
}

/** What crosses devices, made with the browser's WebCrypto, WebSocket, fetch and IndexedDB, on the relay the build names. */
export const createCrossing = (relayUrl: string, needs: CrossingNeeds): CrossingServices => {
  const keys = createWebCryptoKeys()
  const relays = createWebSocketRelays()
  const information = createFetchRelayInformation()
  return {
    huddle: { keys, relays, information, preferences: needs.preferences, relayUrl },
    books: { keys, relays, information, lines: createIndexedDbLineStore(), session: needs.session, drafts: needs.drafts, me: needs.me, businessDay: needs.businessDay, relayUrl, clock: () => Date.now(), newId: needs.newId },
  }
}
