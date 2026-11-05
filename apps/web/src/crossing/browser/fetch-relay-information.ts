import { Err, Ok } from "../../core/result/result"
import type { RelayInformation } from "../port/relay-information"

/** How long a relay is waited for to say what it is. */
const WAIT_MS = 8_000

const httpOf = (url: string): string => url.replace(/^ws(s?):\/\//, "http$1://")

const labelsIn = (document: unknown): number => {
  const labels = (document as { pln?: { labels?: unknown } } | null)?.pln?.labels
  return typeof labels === "number" && Number.isSafeInteger(labels) && labels >= 1 && labels <= 256 ? labels : 0
}

/** NIP-11 read by `fetch`: the relay's address by HTTP, asking for `application/nostr+json`. */
export const createFetchRelayInformation = (fetchOf: typeof fetch = fetch): RelayInformation => ({
  labelsOf: async (url) => {
    const answer = await fetchOf(httpOf(url), { headers: { accept: "application/nostr+json" }, signal: AbortSignal.timeout(WAIT_MS) }).catch(() => undefined)
    if (answer === undefined) return Err({ type: "unreachable" })
    if (!answer.ok) return Err({ type: "unreadable" })
    const document: unknown = await answer.json().catch(() => undefined)
    return document === undefined ? Err({ type: "unreadable" }) : Ok(labelsIn(document))
  },
})
