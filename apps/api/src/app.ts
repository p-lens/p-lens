import type { ApiError } from "./domain/errors"
import type { Quotas } from "./domain/quota"
import { Err, Ok, type Result } from "./domain/result"
import { isAdmin } from "./infrastructure/admin"
import type { Authenticate } from "./infrastructure/auth"
import type { Database } from "./infrastructure/database"
import type { Effects } from "./infrastructure/effects"
import type * as PachinkoEngine from "./infrastructure/pachinko/engine"
import type { HumanCheck } from "./infrastructure/human-check"
import { errorResponse, preflightResponse, replyResponse } from "./infrastructure/http"
import type { Limits } from "./infrastructure/limits"
import { fromOurPages, type OriginPolicy, readableFrom, routedPath } from "./infrastructure/origins"
import type * as PachislotEngine from "./infrastructure/pachislot/engine"
import { ADMIN_ROUTES } from "./routes/admin"
import { type Handler, ROUTES } from "./routes/handlers"
import { type Route, match } from "./routes/router"

export interface Ports {
  readonly database: Database
  readonly effects: Effects
  readonly pachinkoEngine: () => PachinkoEngine.Engine
  readonly pachislotEngine: () => PachislotEngine.Engine
  readonly authenticate: Authenticate
  readonly origins: OriginPolicy
  /** The prefix the API is served under when it shares the app's origin, such as `/api`; empty when it has an origin of its own. */
  readonly basePath: string
  /** The deployment's admin token; none, and there is no administrator. */
  readonly adminToken: string | undefined
  readonly limits: Limits
  readonly humanCheck: HumanCheck
  /** How much one device, and one address, may register in a day; none, and registering is not counted. */
  readonly quotas: Quotas | undefined
}

const READS = new Set(["GET", "HEAD"])

/** Whether a write registers something new — a machine, a formula, a 設定配分, a tag — rather than marking or using what is there. */
const registers = (method: string, path: string): boolean => method === "POST" && !path.endsWith("/uses")

const addressOf = (request: Request): string | undefined => request.headers.get("CF-Connecting-IP") ?? undefined

/**
 * What a request from the app's pages must also get past before its route:
 * a write, the limits on its address; registering something, the check that
 * a person on the app's page is doing it.
 */
const admitted = async (request: Request, path: string, ports: Ports): Promise<Result<void, ApiError>> => {
  if (READS.has(request.method)) return Ok(undefined)
  const address = addressOf(request) ?? "unknown"
  if (!(await ports.limits("write", address))) return Err({ type: "too-many-requests" })
  if (!registers(request.method, path)) return Ok(undefined)
  if (!(await ports.limits("create", address))) return Err({ type: "too-many-requests" })
  return (await ports.humanCheck(request.headers.get("X-Turnstile-Token") ?? undefined, addressOf(request))) ? Ok(undefined) : Err({ type: "human-check-failed" })
}

/** A route's reply, or a typed error; never a throw. */
const answered = async (routes: readonly Route<Handler>[], request: Request, url: URL, path: string, ports: Ports, corsOrigin: string | undefined): Promise<Response> => {
  const matched = match(routes, request.method, path)
  if (!matched.ok) return errorResponse(matched.error, corsOrigin)
  try {
    const reply = await matched.value.handler({
      request,
      url,
      params: matched.value.params,
      database: ports.database,
      effects: ports.effects,
      pachinkoEngine: ports.pachinkoEngine,
      pachislotEngine: ports.pachislotEngine,
      authenticate: ports.authenticate,
      address: addressOf(request),
      quotas: ports.quotas,
    })
    return reply.ok ? replyResponse(reply.value, corsOrigin) : errorResponse(reply.error, corsOrigin)
  } catch (cause) {
    return errorResponse({ type: "storage", detail: String(cause) }, corsOrigin)
  }
}

/**
 * One request, answered. The administrator's go by the admin token alone,
 * from anywhere, and are never readable in a browser. Anyone else's must come
 * from a page the deployment serves the app from — refused before anything
 * else is looked at — and get past the limits and the check on registering.
 */
export const handle = async (request: Request, ports: Ports): Promise<Response> => {
  const url = new URL(request.url)
  const path = routedPath(url.pathname, ports.basePath)
  if (path?.startsWith("/admin/") === true) {
    return isAdmin(ports.adminToken, request) ? answered(ADMIN_ROUTES, request, url, path, ports, undefined) : errorResponse({ type: "not-found", what: "route" }, undefined)
  }
  const corsOrigin = readableFrom(ports.origins, request)
  if (request.method === "OPTIONS") return preflightResponse(corsOrigin)
  if (!fromOurPages(ports.origins, request)) return errorResponse({ type: "forbidden-origin" }, corsOrigin)
  if (path === undefined) return errorResponse({ type: "not-found", what: "route" }, corsOrigin)
  const admission = await admitted(request, path, ports)
  return admission.ok ? answered(ROUTES, request, url, path, ports, corsOrigin) : errorResponse(admission.error, corsOrigin)
}
