import type { CatalogDto, CatalogVersionDto, CreatedDto, QuotaDto, RegisteredDto } from "@p-lens/contracts"

import { Err, Ok, type Result } from "../../core/result/result"
import type { ApiFailure, CatalogApi, CatalogRequest } from "../port/catalog-api"

/** What the client needs from outside: where the API is, how to ask, how long to wait, and the device's own id. */
export interface HttpCatalogPorts {
  /** Where the API answers, without a trailing slash. */
  readonly base: string
  readonly request: (url: string, init: RequestInit) => Promise<Response>
  /** How long an answer is waited for, in milliseconds, before the device makes do without one. */
  readonly answerWithin: number
  readonly device: () => Promise<string>
  /** A token showing a person is registering, sent with what is registered; none where the deployment asks for none. */
  readonly humanCheck: (() => Promise<string | undefined>) | undefined
}

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

const hasTexts = (value: unknown, ...names: readonly string[]): boolean => isFields(value) && names.every((name) => typeof value[name] === "string")

const isVersion = (value: unknown): value is CatalogVersionDto => hasTexts(value, "version")

const isMachineDetail = (value: unknown): boolean => isFields(value) && isFields(value["machine"]) && Array.isArray(value["formulas"])

const isCatalog = (value: unknown): value is CatalogDto => isVersion(value) && isFields(value) && Array.isArray(value["machines"]) && value["machines"].every(isMachineDetail)

const isStanding = (value: unknown): boolean => isFields(value) && typeof value["remaining"] === "number" && (value["nextAt"] === undefined || typeof value["nextAt"] === "string")

const isQuota = (value: unknown): value is QuotaDto =>
  isFields(value) && (value["type"] === "unlimited" || (value["type"] === "limited" && isStanding(value["machine"]) && isStanding(value["addition"]) && isStanding(value["tag"])))

const isRegistered = (value: unknown): value is RegisteredDto => hasTexts(value, "machineId", "formulaId")

const isCreated = (value: unknown): value is CreatedDto => hasTexts(value, "id")

const isAnything = (_value: unknown): _value is unknown => true

/** How a request is sent: read, as this device — a write, or a reading that is the device's own — or registering something new, which also carries the check that a person is doing it. */
type Sending = "read" | "write" | "register"

type Json = Readonly<Record<string, unknown>>

const isJson = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

const errorOf = (body: unknown, status: number): Extract<ApiFailure, { type: "answered" }>["error"] =>
  isJson(body) && isJson(body["error"]) && typeof body["error"]["type"] === "string"
    ? (body["error"] as Extract<ApiFailure, { type: "answered" }>["error"])
    : { type: "unexpected", status }

const jsonOf = async (response: Response): Promise<unknown> => {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

/**
 * The shared catalog reached over HTTP. A hall's network must never leave the
 * app waiting, so every request gives up after a while; a write names this
 * device in `X-P-Lens-Device`, and registering something new carries the
 * Turnstile token in `X-Turnstile-Token`.
 */
export const createHttpCatalogApi = (ports: HttpCatalogPorts): CatalogApi => {
  const checked = async (sending: Sending): Promise<Readonly<Record<string, string>>> => {
    if (sending !== "register" || ports.humanCheck === undefined) return {}
    const token = await ports.humanCheck()
    return token === undefined ? {} : { "X-Turnstile-Token": token }
  }

  const asked = async <T>(method: string, path: string, body: unknown, sending: Sending, reads: (answer: unknown) => answer is T, as?: string): Promise<Result<T, ApiFailure>> => {
    try {
      const headers: Record<string, string> = body === undefined ? {} : { "Content-Type": "application/json" }
      const named = sending === "read" ? headers : { ...headers, "X-P-Lens-Device": as ?? (await ports.device()), ...(await checked(sending)) }
      const response = await ports.request(`${ports.base}${path}`, {
        method,
        headers: named,
        signal: AbortSignal.timeout(ports.answerWithin),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const answer = response.status === 204 ? undefined : await jsonOf(response)
      if (!response.ok) return Err({ type: "answered", status: response.status, error: errorOf(answer, response.status) })
      return reads(answer) ? Ok(answer) : Err({ type: "unreadable-answer" })
    } catch (cause) {
      return Err({ type: "unreachable", detail: String(cause) })
    }
  }

  return {
    version: async () => {
      const read = await asked("GET", "/catalog/version", undefined, "read", isVersion)
      return read.ok ? Ok(read.value.version) : read
    },
    catalog: () => asked("GET", "/catalog", undefined, "read", isCatalog),
    quota: () => asked("GET", "/quota", undefined, "write", isQuota),
    register: (machine) => asked("POST", "/machines", machine, "register", isRegistered),
    addFormula: (machineId, formula) => asked("POST", `/machines/${encodeURIComponent(machineId)}/formulas`, formula, "register", isCreated),
    addDistribution: (machineId, distribution) => asked("POST", `/machines/${encodeURIComponent(machineId)}/distributions`, distribution, "register", isCreated),
    send: async (request: CatalogRequest) => {
      const sent = await asked(request.method, request.path, undefined, "write", isAnything, request.as)
      return sent.ok ? Ok(undefined) : sent
    },
  }
}
