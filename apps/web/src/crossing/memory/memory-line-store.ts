import type { BookId } from "../../core/book/book"
import type { BookFiles } from "../../core/journal/layout"
import { Ok } from "../../core/result/result"
import type { NostrEvent } from "../core/event"
import type { BookLink, Destination, HeldChange, KeptPlay, LineStore, SentPlay } from "../port/line-store"

/** What one book's line keeps. */
interface Kept {
  readonly changes: Map<string, HeldChange>
  shadow: BookFiles
  readonly outbox: Map<string, NostrEvent>
  readonly loose: Map<string, NostrEvent>
}

/** What the device keeps of its lines, in memory and gone with it: where a test keeps them, and the app keeps them in IndexedDB. */
export const createMemoryLineStore = (): LineStore => {
  const links = new Map<BookId, BookLink>()
  const plays = new Map<string, KeptPlay>()
  const playKey = (bookId: BookId, playId: string): string => `${bookId} ${playId}`
  const books = new Map<BookId, Kept>()
  const destinations = new Map<string, Destination>()
  const sentPlays = new Map<string, SentPlay>()
  const of = (bookId: BookId): Kept => {
    const found = books.get(bookId)
    if (found !== undefined) return found
    const made: Kept = { changes: new Map(), shadow: {}, outbox: new Map(), loose: new Map() }
    books.set(bookId, made)
    return made
  }
  const done = Ok(undefined)
  return {
    links: async () => Ok([...links.values()]),
    putLink: async (link) => {
      links.set(link.bookId, link)
      return done
    },
    changes: async (bookId) => Ok([...of(bookId).changes.values()]),
    shadow: async (bookId) => Ok(of(bookId).shadow),
    receive: async (bookId, changes) => {
      changes.forEach((held) => of(bookId).changes.set(held.id, held))
      return done
    },
    settle: async ({ link, changes, shadow }) => {
      changes.forEach((held) => of(link.bookId).changes.set(held.id, held))
      of(link.bookId).shadow = shadow
      links.set(link.bookId, link)
      return done
    },
    outbox: async (bookId) => Ok([...of(bookId).outbox.values()]),
    queue: async (bookId, events) => {
      events.forEach((event) => of(bookId).outbox.set(event.id, event))
      return done
    },
    sent: async (bookId, ids) => {
      ids.forEach((id) => of(bookId).outbox.delete(id))
      return done
    },
    loose: async (bookId) => Ok([...of(bookId).loose.values()]),
    keepLoose: async (bookId, events) => {
      events.forEach((event) => of(bookId).loose.set(event.id, event))
      return done
    },
    dropLoose: async (bookId, ids) => {
      ids.forEach((id) => of(bookId).loose.delete(id))
      return done
    },
    plays: async () => Ok([...plays.values()]),
    putPlay: async (play) => {
      plays.set(playKey(play.bookId, play.playId), play)
      return done
    },
    dropPlay: async (bookId, playId) => {
      plays.delete(playKey(bookId, playId))
      return done
    },
    forget: async (bookId) => {
      links.delete(bookId)
      books.delete(bookId)
      ;[...plays.values()].filter((play) => play.bookId === bookId).forEach((play) => plays.delete(playKey(bookId, play.playId)))
      return done
    },
    destinations: async () => Ok([...destinations.values()]),
    putDestination: async (destination) => {
      destinations.set(destination.invitation, destination)
      return done
    },
    forgetDestination: async (invitation) => {
      destinations.delete(invitation)
      ;[...sentPlays.values()].filter((play) => play.invitation === invitation).forEach((play) => sentPlays.delete(play.playId))
      return done
    },
    sentPlays: async () => Ok([...sentPlays.values()]),
    putSentPlay: async (play) => {
      sentPlays.set(play.playId, play)
      return done
    },
    dropSentPlay: async (playId) => {
      sentPlays.delete(playId)
      return done
    },
  }
}
