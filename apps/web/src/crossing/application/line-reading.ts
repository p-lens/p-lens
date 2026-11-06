import { Err, Ok, type Result } from "../../core/result/result"
import type { NostrEvent } from "../core/event"
import type { Filter } from "../core/messages"
import type { Connection } from "../port/relay"

/** The most events asked for at once (PROTOCOL.md §11): a relay must give at least a hundred, and many give five. */
const PAGE = 500

/** How long a page is waited for before the relay is taken not to be answering. */
const PAGE_WAIT_MS = 15_000

/** One page of what a filter matches, the newest a relay gives up to `until`: everything it sent before its `EOSE`. */
const pageOf = (connection: Connection, filter: Filter): Promise<Result<readonly NostrEvent[], "unanswered">> =>
  new Promise((resolve) => {
    const events: NostrEvent[] = []
    const ended = (result: Result<readonly NostrEvent[], "unanswered">): void => {
      clearTimeout(timer)
      subscription.close()
      resolve(result)
    }
    const timer = setTimeout(() => ended(Err("unanswered")), PAGE_WAIT_MS)
    const subscription = connection.subscribe(() => [filter], {
      onEvent: (event) => events.push(event),
      onCaughtUp: () => ended(Ok(events)),
      onEnded: () => ended(Err("unanswered")),
    })
  })

/** Whether a relay holds anything a filter matches made in a second: one event asked for, so that a whole base is never read to learn that it is there. */
export const holdsAt = async (connection: Connection, filter: Filter, second: number): Promise<Result<boolean, "unanswered">> => {
  const page = await pageOf(connection, { ...filter, since: second, until: second, limit: 1 })
  return page.ok ? Ok(page.value.length > 0) : page
}

/**
 * Everything a filter matches since a time, page by page back from the
 * newest, each page ending at the oldest second the one before reached and
 * what was had twice let go of. A second holding a page alone is as far as
 * paging goes (PROTOCOL.md §2.2); no writer puts that many in one.
 */
export const readSince = async (connection: Connection, filter: Filter): Promise<Result<readonly NostrEvent[], "unanswered">> => {
  const read: { events: Map<string, NostrEvent>; until: number | undefined } = { events: new Map(), until: undefined }
  for (;;) {
    const page = await pageOf(connection, { ...filter, limit: PAGE, ...(read.until === undefined ? {} : { until: read.until }) })
    if (!page.ok) return page
    const fresh = page.value.filter((event) => !read.events.has(event.id))
    fresh.forEach((event) => read.events.set(event.id, event))
    const oldest = Math.min(...page.value.map((event) => event.created_at))
    if (page.value.length < PAGE || fresh.length === 0 || oldest === read.until) return Ok([...read.events.values()])
    read.until = oldest
  }
}
