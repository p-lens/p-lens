import type { AppendDto, AppendedDto, GrantsDto, LineEntriesDto, NewGrantDto, RelayErrorDto } from "@p-lens/contracts/relay"

import { Err, Ok, mapOk, type Result } from "../../core/result/result"
import type { LineAccess, Relay, RelayFailure } from "../port/relay"

export interface HttpRelayPorts {
  readonly request: (url: string, init: RequestInit) => Promise<Response>
  /** How long a relay has to answer, in milliseconds. */
  readonly answerWithin: number
}

const failureOf = (status: number, body: unknown): RelayFailure => {
  const error = (body as Partial<RelayErrorDto> | undefined)?.error
  if (error?.type === "behind") return { type: "behind", head: error.head }
  if (error?.type === "line-missing") return { type: "line-missing" }
  if (error?.type === "too-many") return { type: "too-many" }
  if (error?.type === "unauthorized") return { type: "shut-out" }
  if (error?.type === "forbidden") return { type: "not-permitted" }
  return { type: "refused", status, reason: error?.type ?? "unknown" }
}

const bodyOf = async (response: Response): Promise<unknown> => {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

/** A relay reached over HTTP, by whatever address a line's access names. */
export const createHttpRelay = (ports: HttpRelayPorts): Relay => {
  const asked = async <T>(access: LineAccess, method: "GET" | "POST" | "DELETE", part: string, body: AppendDto | NewGrantDto | undefined): Promise<Result<T, RelayFailure>> => {
    try {
      const response = await ports.request(`${access.relayUrl}/lines/${encodeURIComponent(access.lineId)}/${part}`, {
        method,
        headers: { Authorization: `Bearer ${access.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        signal: AbortSignal.timeout(ports.answerWithin),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const answer = await bodyOf(response)
      return response.ok ? Ok(answer as T) : Err(failureOf(response.status, answer))
    } catch (cause) {
      return Err({ type: "unreachable", detail: String(cause) })
    }
  }
  return {
    entriesAfter: (access, after) => asked<LineEntriesDto>(access, "GET", `entries?after=${after}`, undefined),
    append: (access, after, entries) => asked<AppendedDto>(access, "POST", "entries", { after, entries }),
    grants: async (access) => mapOk(await asked<GrantsDto>(access, "GET", "grants", undefined), (answer) => answer.grants),
    grant: async (access, grant) => mapOk(await asked<GrantsDto>(access, "POST", "grants", grant), (answer) => answer.grants),
    revoke: async (access, grantId) => mapOk(await asked<GrantsDto>(access, "DELETE", `grants/${encodeURIComponent(grantId)}`, undefined), (answer) => answer.grants),
  }
}
