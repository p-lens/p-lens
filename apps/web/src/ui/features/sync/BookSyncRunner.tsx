import { createEffect, on, onCleanup, type JSX } from "solid-js"

import type { BookId } from "../../../core/book/book"
import { Ok } from "../../../core/result/result"
import { isOwnersLink, openBookLine, openInboxLine, openPlaysLine, openSendingLine, stopSync, type BookLink, type CrossingServices, type Destination } from "../../../crossing"
import { useApp } from "../../context"
import { onShownAgain } from "../../primitives/shown-again"
import { toast } from "../../primitives/toast"
import { lostReadingsText, YIELDED } from "../../wording/play-line"
import { REMOVED_FROM_BOOK, removedFromSendingText } from "../../wording/sharing"

/** How long the lines are kept open after the page goes out of sight, in milliseconds: long enough for what waits in an outbox to go (PROTOCOL.md §11). */
const CLOSED_AFTER = 3_000

/** Whether the page is out of sight: another app or tab before it, or the screen off. */
const away = (): boolean => document.visibilityState === "hidden"

/**
 * Every book this device keeps on a line, kept there for as long as the app
 * is open, wherever it is: each book's line and its plays' open on its
 * relay, over one connection, while the page is in sight — what the
 * owner's other devices wrote coming into the book as it is written, what
 * is written here going out a moment after, the plays each device holds
 * copied to the others, and the plays people send to the owner's books read
 * off their inboxes — and each book's inbox this device sends plays to, what
 * the person chose to send going out as it changes; all let go a moment
 * after the page goes away, opened again as it comes back. A book taken off the device lets
 * its lines go, as does a book its owner took this device's person out of.
 * Nothing is drawn.
 */
export function BookSyncRunner(props: { readonly crossing: CrossingServices }): JSX.Element {
  const app = useApp()
  const lines = app.bookLines
  const held = lines.held
  const timers: { closing: ReturnType<typeof setTimeout> | undefined } = { closing: undefined }

  const gone = async (bookId: BookId): Promise<void> => {
    lines.letGo(bookId)
    await stopSync(props.crossing.books, bookId)
    lines.setStanding(bookId, undefined)
    lines.setFollowed(bookId, [])
    lines.relinked()
  }

  const yielded = (lost: number): void => {
    toast(lost === 0 ? { title: YIELDED } : { title: YIELDED, description: lostReadingsText(lost), tone: "error" })
  }

  /** A person let into a book taken back out by its owner: the line let go of, and the book left as it stood. */
  const removed = async (bookId: BookId): Promise<void> => {
    await gone(bookId)
    toast({ title: REMOVED_FROM_BOOK.title, description: REMOVED_FROM_BOOK.description })
  }

  const open = async (link: BookLink): Promise<void> => {
    if (held.lines.has(link.bookId) || held.opening.has(link.bookId)) return
    held.opening.add(link.bookId)
    const connection = props.crossing.books.relays.connect(link.relay)
    const [book, plays] = await Promise.all([
      openBookLine(props.crossing.books, link, connection, {
        onStanding: (standing) => lines.setStanding(link.bookId, standing),
        onBookChanged: () => app.wrote(),
        onGone: () => void gone(link.bookId),
        onRemoved: () => void removed(link.bookId),
      }),
      isOwnersLink(link)
        ? openPlaysLine(props.crossing.books, link, connection, {
            onFollowed: (followed) => lines.setFollowed(link.bookId, followed),
            onYielded: (_playId, lost) => yielded(lost),
            onDraftsChanged: () => app.played(),
          })
        : Promise.resolve(Ok(undefined)),
    ])
    held.opening.delete(link.bookId)
    if (!book.ok || !plays.ok) {
      void Promise.all([book.ok ? book.value.close() : undefined, plays.ok ? plays.value?.close() : undefined]).finally(connection.close)
      const problem = !book.ok ? book.error : !plays.ok ? plays.error : undefined
      return problem === undefined ? undefined : lines.setStanding(link.bookId, { type: "stopped", problem })
    }
    const line = book.value
    const inbox = isOwnersLink(link) ? await openInboxLine(props.crossing.books, link, connection, () => line.members(), { onReceived: (received) => lines.setArrived(link.bookId, received) }) : undefined
    lines.keep(link.bookId, { book: line, plays: plays.value, inbox, connection })
    if (away()) lines.letGo(link.bookId)
  }

  /** What the device sends and where, read again for the screens. */
  const sendingChanged = async (): Promise<void> => {
    const [destinations, sent] = await Promise.all([props.crossing.books.lines.destinations(), props.crossing.books.lines.sentPlays()])
    if (destinations.ok && sent.ok) lines.setSending(destinations.value, sent.value)
  }

  /** A book's inbox this device sends to, kept open: what the person chose to send going out as it changes. */
  const openSending = async (destination: Destination): Promise<void> => {
    const key = destination.invitation
    if (destination.removed || held.sendings.has(key) || held.openingSendings.has(key)) return
    held.openingSendings.add(key)
    const connection = props.crossing.books.relays.connect(destination.relay)
    const line = await openSendingLine(props.crossing.books, destination, connection, {
      onRemoved: () => {
        lines.letSendingGo(key)
        void sendingChanged()
        toast({ title: removedFromSendingText(destination.title) })
      },
      onChanged: () => void sendingChanged(),
    })
    held.openingSendings.delete(key)
    if (!line.ok) return connection.close()
    held.sendings.set(key, { line: line.value, connection })
    if (away()) lines.letSendingGo(key)
  }

  /** Every line the device keeps opened, and every line it no longer keeps let go of. */
  const keepUp = async (): Promise<void> => {
    if (away()) return
    const [links, destinations] = await Promise.all([props.crossing.books.lines.links(), props.crossing.books.lines.destinations()])
    if (links.ok) {
      const linked = new Set(links.value.map((link) => link.bookId))
      Array.from(held.lines.keys()).filter((bookId) => !linked.has(bookId)).forEach(lines.letGo)
    }
    if (destinations.ok) {
      const sending = new Set(destinations.value.filter((destination) => !destination.removed).map((destination) => destination.invitation))
      Array.from(held.sendings.keys()).filter((key) => !sending.has(key)).forEach(lines.letSendingGo)
    }
    await sendingChanged()
    await Promise.all([...(links.ok ? links.value.map(open) : []), ...(destinations.ok ? destinations.value.map(openSending) : [])])
  }

  createEffect(on(lines.linked, () => void keepUp()))
  createEffect(on(app.written, () => held.lines.forEach((line) => line.book.wrote()), { defer: true }))
  createEffect(
    on(
      app.revision,
      () => {
        held.lines.forEach((line) => line.plays?.wrote())
        held.sendings.forEach((open) => open.line.wrote())
      },
      { defer: true },
    ),
  )
  createEffect(on(app.written, () => held.lines.forEach((line) => line.inbox?.sendersChanged()), { defer: true }))

  /** Back in sight: the lines opened again. */
  const back = (): void => {
    if (away()) return
    clearTimeout(timers.closing)
    held.lines.forEach((line) => line.connection.reopen())
    held.sendings.forEach((open) => open.connection.reopen())
    void keepUp()
  }
  /** Gone from sight: the lines let go a moment after, so that a phone's radio rests. */
  const hidden = (): void => {
    if (!away()) return
    clearTimeout(timers.closing)
    held.lines.forEach((line) => line.plays?.copyNow())
    held.sendings.forEach((open) => open.line.sendNow())
    timers.closing = setTimeout(() => {
      Array.from(held.lines.keys()).forEach(lines.letGo)
      Array.from(held.sendings.keys()).forEach(lines.letSendingGo)
    }, CLOSED_AFTER)
  }
  const stopListening = onShownAgain(back)
  document.addEventListener("visibilitychange", hidden)
  window.addEventListener("online", back)
  onCleanup(() => {
    stopListening()
    document.removeEventListener("visibilitychange", hidden)
    window.removeEventListener("online", back)
    clearTimeout(timers.closing)
    Array.from(held.lines.keys()).forEach(lines.letGo)
    Array.from(held.sendings.keys()).forEach(lines.letSendingGo)
  })
  return undefined
}
