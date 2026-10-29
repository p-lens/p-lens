import type { AppendDto, AppendedDto, GrantDto, GrantsDto, LineEntriesDto, LineEntryDto, NewGrantDto, RelayErrorDto } from "@p-lens/contracts/relay"

import { Err, Ok, mapOk, type Result } from "../../core/result/result"
import type { LineAccess, Relay, RelayFailure } from "../port/relay"

export interface HttpRelayPorts {
  readonly request: (url: string, init: RequestInit) => Promise<Response>
  /** How long a relay has to answer, in milliseconds. */
  readonly answerWithin: number
}

/** Statuses a gateway or a hall's network answers with in the relay's place, when it could not reach the relay or wants a login first: as good as no connection. */
const IN_ITS_PLACE: ReadonlySet<number> = new Set([408, 502, 503, 504, 511, 520, 521, 522, 523, 524, 525, 526, 527, 530])

const failureOf = (status: number, body: unknown): RelayFailure => {
  const error = (body as Partial<RelayErrorDto> | undefined)?.error
  if (IN_ITS_PLACE.has(status) && error === undefined) return { type: "unreachable", detail: `answered ${status}` }
  if (error?.type === "too-large" || status === 413) return { type: "too-large" }
  if (error?.type === "storage" || status >= 500) return { type: "server-trouble", status }
  if (error?.type === "behind") return { type: "behind", head: error.head }
  if (error?.type === "line-missing") return { type: "line-missing" }
  if (error?.type === "too-many") return { type: "too-many" }
  if (error?.type === "unauthorized") return { type: "shut-out" }
  if (error?.type === "forbidden") return { type: "not-permitted" }
  return { type: "refused", status, reason: error?.type ?? "unknown" }
}

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

const isPlace = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0

const isEntry = (value: unknown): value is LineEntryDto => isFields(value) && isPlace(value["seq"]) && typeof value["commitId"] === "string" && typeof value["box"] === "string"

const isEntries = (value: unknown): value is LineEntriesDto =>
  isFields(value) && isPlace(value["head"]) && typeof value["begunAt"] === "string" && Array.isArray(value["entries"]) && value["entries"].every(isEntry)

const isAppended = (value: unknown): value is AppendedDto => isFields(value) && isPlace(value["head"]) && typeof value["begunAt"] === "string"

const GRANT_ROLES: ReadonlySet<unknown> = new Set(["editor", "viewer", "sender"])

const isGrant = (value: unknown): value is GrantDto => isFields(value) && typeof value["id"] === "string" && GRANT_ROLES.has(value["role"]) && typeof value["createdAt"] === "string"

const isGrants = (value: unknown): value is GrantsDto => isFields(value) && Array.isArray(value["grants"]) && value["grants"].every(isGrant)

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * A relay reached over HTTP, by whatever address a line's access names. An
 * answer that says it went through and is not what was asked for — a page
 * a hall's network put in its place, or one cut short — is told as such.
 */
export const createHttpRelay = (ports: HttpRelayPorts): Relay => {
  const asked = async <T>(
    access: LineAccess,
    method: "GET" | "POST" | "DELETE",
    part: string,
    body: AppendDto | NewGrantDto | undefined,
    reads: (answer: unknown) => answer is T,
  ): Promise<Result<T, RelayFailure>> => {
    try {
      const response = await ports.request(`${access.relayUrl}/lines/${encodeURIComponent(access.lineId)}/${part}`, {
        method,
        headers: { Authorization: `Bearer ${access.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        signal: AbortSignal.timeout(ports.answerWithin),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const answer = parsed(await response.text())
      if (!response.ok) return Err(failureOf(response.status, answer))
      return reads(answer) ? Ok(answer) : Err({ type: "unreadable-answer" })
    } catch (cause) {
      return Err({ type: "unreachable", detail: String(cause) })
    }
  }
  return {
    entriesAfter: (access, after) => asked(access, "GET", `entries?after=${after}`, undefined, isEntries),
    append: (access, after, entries, keep) => asked(access, "POST", "entries", { after, entries, ...(keep === undefined ? {} : { keep }) }, isAppended),
    grants: async (access) => mapOk(await asked(access, "GET", "grants", undefined, isGrants), (answer) => answer.grants),
    grant: async (access, grant) => mapOk(await asked(access, "POST", "grants", grant, isGrants), (answer) => answer.grants),
    revoke: async (access, grantId) => mapOk(await asked(access, "DELETE", `grants/${encodeURIComponent(grantId)}`, undefined, isGrants), (answer) => answer.grants),
  }
}
