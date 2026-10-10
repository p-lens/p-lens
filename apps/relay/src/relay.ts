import type { Limits } from "./limits"
import { LINE_IDLE_DAYS, RELAY_LIMITS, type AppendedDto, type GrantDto, type GrantRole, type GrantsDto, type LineEntriesDto, type LineEntryDto, type RelayError, type RelayErrorDto, type SealedCommitDto } from "@p-lens/contracts/relay"

/**
 * The part of D1 the relay uses. D1 satisfies it as it is; the tests satisfy
 * it with SQLite, so the same SQL is run against the same migration.
 */
export interface Statement {
  bind(...values: readonly unknown[]): Statement
  all<T>(): Promise<{ readonly results: readonly T[] }>
  first<T>(): Promise<T | null>
}

export interface Database {
  prepare(query: string): Statement
  /** Every statement or none: D1 runs a batch as one transaction. */
  batch(statements: readonly Statement[]): Promise<unknown>
}

/** Which pages may ask: any, or only those named. */
export type Origins = { readonly type: "any" } | { readonly type: "only"; readonly origins: readonly string[] }

export interface Ports {
  readonly database: Database
  readonly origins: Origins
  readonly limits: Limits
  readonly now: () => string
}

type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: RelayError }

const refused = (error: RelayError): Answer<never> => ({ ok: false, error })

const STATUS: Readonly<Record<RelayError["type"], number>> = {
  unauthorized: 401,
  forbidden: 403,
  "line-missing": 404,
  behind: 409,
  invalid: 400,
  "too-large": 413,
  "too-many": 429,
  "not-found": 404,
  "forbidden-origin": 403,
  storage: 500,
}

/** The policy a comma-separated list of origins sets: none listed is any. */
export const originsOf = (listed: string | undefined): Origins => {
  const origins = (listed ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin !== "")
  return origins.length === 0 ? { type: "any" } : { type: "only", origins }
}

/** The origin an answer may be read from, or none: a page the relay does not serve reads nothing. */
const readableFrom = (origins: Origins, request: Request): string | undefined => {
  if (origins.type === "any") return "*"
  const origin = request.headers.get("Origin") ?? undefined
  return origin !== undefined && origins.origins.includes(origin) ? origin : undefined
}

const corsHeaders = (origin: string | undefined): Readonly<Record<string, string>> =>
  origin === undefined
    ? { Vary: "Origin" }
    : { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", Vary: "Origin" }

const responseOf = (answer: Answer<unknown>, origin: string | undefined): Response =>
  new Response(JSON.stringify(answer.ok ? answer.value : ({ error: answer.error } satisfies RelayErrorDto)), {
    status: answer.ok ? 200 : STATUS[answer.error.type],
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  })

const hexOf = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")

const hashOf = async (token: string): Promise<string> => hexOf(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))

/** What a line's id, a token and a commit's id are written in: base64url or a UUID's characters, and not too long. */
const NAME = /^[A-Za-z0-9_-]{16,128}$/

const tokenOf = (request: Request): string | undefined => {
  const header = request.headers.get("Authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : ""
  return NAME.test(token) ? token : undefined
}

const storage = (cause: unknown): Answer<never> => refused({ type: "storage", detail: String(cause) })

/** What a token may do with a line: everything, as the token that made it; or what the grant it answers to allows. */
type Role = "owner" | GrantRole

/** A line as whoever holds one of its tokens finds it: when it was begun, and what that token may do. */
interface Held {
  readonly begunAt: string
  readonly role: Role
}

/** The line, if the token is its own or one it was granted; `false` if it is neither; `undefined` when there is no such line. */
const holds = async (database: Database, line: string, token: string): Promise<Held | false | undefined> => {
  const kept = await database.prepare("SELECT access_hash, created_at FROM lines WHERE id = ?").bind(line).first<{ access_hash: string; created_at: string }>()
  if (kept === null) return undefined
  const hash = await hashOf(token)
  if (kept.access_hash === hash) return { begunAt: kept.created_at, role: "owner" }
  const granted = await database.prepare("SELECT role FROM grants WHERE line_id = ? AND access_hash = ?").bind(line, hash).first<{ role: GrantRole }>()
  return granted === null ? false : { begunAt: kept.created_at, role: granted.role }
}

const DAY = 86_400_000

const daysBefore = (moment: string, days: number): string => new Date(Date.parse(moment) - days * DAY).toISOString()

/** Say a line was used now, where it has not been said within a day: a line read every minute is written once a day. */
const used = (ports: Pick<Ports, "database" | "now">, line: string): Promise<unknown> =>
  ports.database.batch([ports.database.prepare("UPDATE lines SET used_at = ? WHERE id = ? AND (used_at IS NULL OR used_at < ?)").bind(ports.now(), line, daysBefore(ports.now(), 1))])

/**
 * Let go of every line nobody has read or added to for `LINE_IDLE_DAYS`,
 * its commits and its grants with it. Nothing is lost by it: each of a book's devices
 * keeps the book, and the first to come back makes the line again.
 */
export const letGoOfIdleLines = (ports: Pick<Ports, "database" | "now">): Promise<unknown> => {
  const idleSince = daysBefore(ports.now(), LINE_IDLE_DAYS)
  return ports.database.batch([
    ports.database.prepare("DELETE FROM entries WHERE line_id IN (SELECT id FROM lines WHERE COALESCE(used_at, created_at) < ?)").bind(idleSince),
    ports.database.prepare("DELETE FROM grants WHERE line_id IN (SELECT id FROM lines WHERE COALESCE(used_at, created_at) < ?)").bind(idleSince),
    ports.database.prepare("DELETE FROM lines WHERE COALESCE(used_at, created_at) < ?").bind(idleSince),
  ])
}

const headOf = async (database: Database, line: string): Promise<number> =>
  (await database.prepare("SELECT COALESCE(MAX(seq), 0) AS head FROM entries WHERE line_id = ?").bind(line).first<{ head: number }>())?.head ?? 0

const entriesAfter = async (ports: Ports, line: string, token: string, after: number): Promise<Answer<LineEntriesDto>> => {
  const held = await holds(ports.database, line, token)
  if (held === undefined) return refused({ type: "line-missing" })
  if (held === false) return refused({ type: "unauthorized" })
  if (held.role === "sender") return refused({ type: "forbidden" })
  await used(ports, line)
  const rows = await ports.database
    .prepare("SELECT seq, commit_id AS commitId, box FROM entries WHERE line_id = ? AND seq > ? ORDER BY seq LIMIT ?")
    .bind(line, after, RELAY_LIMITS.entriesPerAppend)
    .all<LineEntryDto>()
  return { ok: true, value: { head: await headOf(ports.database, line), begunAt: held.begunAt, entries: rows.results } }
}

const isSealed = (value: unknown): value is SealedCommitDto =>
  typeof value === "object" && value !== null && NAME.test(String((value as SealedCommitDto).commitId)) && typeof (value as SealedCommitDto).box === "string"

const readAppend = (body: unknown): Answer<{ readonly after: number; readonly entries: readonly SealedCommitDto[] }> => {
  const sent = body as { readonly after?: unknown; readonly entries?: unknown } | null
  if (typeof sent !== "object" || sent === null) return refused({ type: "invalid", field: "body" })
  if (typeof sent.after !== "number" || !Number.isInteger(sent.after) || sent.after < 0) return refused({ type: "invalid", field: "after" })
  if (!Array.isArray(sent.entries) || sent.entries.length === 0 || !sent.entries.every(isSealed)) return refused({ type: "invalid", field: "entries" })
  if (sent.entries.length > RELAY_LIMITS.entriesPerAppend || sent.entries.some((entry) => entry.box.length > RELAY_LIMITS.boxLength)) return refused({ type: "too-large" })
  return { ok: true, value: { after: sent.after, entries: sent.entries } }
}

/**
 * Put commits on the end of a line, all or none, only where the sender has
 * every entry before them. Two devices sending at once cannot both land at
 * one place: the second finds the place taken, and is told it is behind.
 */
const append = async (ports: Ports, line: string, token: string, body: unknown): Promise<Answer<AppendedDto>> => {
  const sent = readAppend(body)
  if (!sent.ok) return sent
  const held = await holds(ports.database, line, token)
  if (held === false) return refused({ type: "unauthorized" })
  if (held !== undefined && held.role === "viewer") return refused({ type: "forbidden" })
  const head = held === undefined ? 0 : await headOf(ports.database, line)
  if (sent.value.after !== head) return refused({ type: "behind", head })
  const made = ports.database.prepare("INSERT OR IGNORE INTO lines (id, access_hash, created_at) VALUES (?, ?, ?)").bind(line, await hashOf(token), ports.now())
  const added = sent.value.entries.map((entry, index) =>
    ports.database
      .prepare("INSERT INTO entries (line_id, seq, commit_id, box, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(line, head + index + 1, entry.commitId, entry.box, ports.now()),
  )
  try {
    await ports.database.batch([made, ...added])
  } catch (cause) {
    return /UNIQUE constraint failed/i.test(String(cause)) ? refused({ type: "behind", head: await headOf(ports.database, line) }) : storage(cause)
  }
  const kept = await holds(ports.database, line, token)
  if (kept === undefined || kept === false) return refused({ type: "unauthorized" })
  await used(ports, line)
  return { ok: true, value: { head: head + sent.value.entries.length, begunAt: kept.begunAt } }
}

/** The line a token is its owner's on, or why it is not: seeing to a line's grants is its owner's alone. */
const owned = async (ports: Ports, line: string, token: string): Promise<Answer<Held>> => {
  const held = await holds(ports.database, line, token)
  if (held === undefined) return refused({ type: "line-missing" })
  if (held === false) return refused({ type: "unauthorized" })
  return held.role === "owner" ? { ok: true, value: held } : refused({ type: "forbidden" })
}

const grantsOf = async (ports: Ports, line: string, token: string): Promise<Answer<GrantsDto>> => {
  const owner = await owned(ports, line, token)
  if (!owner.ok) return owner
  const rows = await ports.database.prepare("SELECT id, role, created_at AS createdAt FROM grants WHERE line_id = ? ORDER BY created_at, id").bind(line).all<GrantDto>()
  return { ok: true, value: { grants: rows.results } }
}

const isRole = (value: unknown): value is GrantRole => value === "editor" || value === "viewer" || value === "sender"

/**
 * Let one more person into a line: a token of their own, kept as its hash,
 * and what it may do. A grant made again under its id is the same grant
 * with what was sent in place of what it had, so a person's role is changed
 * by granting again.
 */
const grant = async (ports: Ports, line: string, token: string, body: unknown): Promise<Answer<GrantsDto>> => {
  const sent = body as { readonly id?: unknown; readonly token?: unknown; readonly role?: unknown } | null
  if (typeof sent !== "object" || sent === null) return refused({ type: "invalid", field: "body" })
  if (typeof sent.id !== "string" || !NAME.test(sent.id)) return refused({ type: "invalid", field: "id" })
  if (typeof sent.token !== "string" || !NAME.test(sent.token)) return refused({ type: "invalid", field: "token" })
  if (!isRole(sent.role)) return refused({ type: "invalid", field: "role" })
  const owner = await owned(ports, line, token)
  if (!owner.ok) return owner
  const held = await ports.database.prepare("SELECT COUNT(*) AS count FROM grants WHERE line_id = ? AND id <> ?").bind(line, sent.id).first<{ count: number }>()
  if ((held?.count ?? 0) >= RELAY_LIMITS.grantsPerLine) return refused({ type: "too-large" })
  await ports.database.batch([
    ports.database.prepare("DELETE FROM grants WHERE line_id = ? AND id = ?").bind(line, sent.id),
    ports.database.prepare("INSERT INTO grants (line_id, id, access_hash, role, created_at) VALUES (?, ?, ?, ?, ?)").bind(line, sent.id, await hashOf(sent.token), sent.role, ports.now()),
  ])
  return grantsOf(ports, line, token)
}

/** Take a grant away: its token opens nothing from then on. One that is not there is already gone. */
const revoke = async (ports: Ports, line: string, token: string, id: string): Promise<Answer<GrantsDto>> => {
  const owner = await owned(ports, line, token)
  if (!owner.ok) return owner
  await ports.database.batch([ports.database.prepare("DELETE FROM grants WHERE line_id = ? AND id = ?").bind(line, id)])
  return grantsOf(ports, line, token)
}

/** What of a line an address names: its entries, its grants, or one grant by its id. */
type Route = { readonly line: string } & ({ readonly of: "entries" } | { readonly of: "grants" } | { readonly of: "grant"; readonly id: string })

const routeOf = (pathname: string): Route | undefined => {
  const [lines, line, part, id, ...rest] = pathname.split("/").filter((segment) => segment !== "")
  if (lines !== "lines" || line === undefined || !NAME.test(line) || rest.length > 0) return undefined
  if (part === "entries" && id === undefined) return { line, of: "entries" }
  if (part === "grants" && id === undefined) return { line, of: "grants" }
  return part === "grants" && id !== undefined && NAME.test(id) ? { line, of: "grant", id } : undefined
}

/**
 * A stream's bytes while they stay within a limit, or nothing once they pass
 * it, at which point reading stops: a body is never taken whole to find out
 * that it was too large.
 */
const bytesWithin = async (reader: ReadableStreamDefaultReader<Uint8Array>, limit: number, read: readonly Uint8Array[] = [], size = 0): Promise<readonly Uint8Array[] | undefined> => {
  const next = await reader.read()
  if (next.done) return read
  if (size + next.value.byteLength > limit) {
    await reader.cancel()
    return undefined
  }
  return bytesWithin(reader, limit, [...read, next.value], size + next.value.byteLength)
}

const textOf = (chunks: readonly Uint8Array[]): string => {
  const decoder = new TextDecoder()
  return chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join("") + decoder.decode()
}

const jsonOf = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** What a request sent, read no further than a body may be long: how many bytes it was, and what they say. */
const sentBy = async (request: Request): Promise<{ readonly bytes: number; readonly body: unknown } | undefined> => {
  if (Number(request.headers.get("Content-Length") ?? "0") > RELAY_LIMITS.bodyBytes) return undefined
  const chunks = request.body === null ? [] : await bytesWithin(request.body.getReader(), RELAY_LIMITS.bodyBytes)
  return chunks === undefined ? undefined : { bytes: chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0), body: jsonOf(textOf(chunks)) }
}

/** Who sent a request, as far as senders can be told apart: the address Cloudflare saw it come from, and one key for all it saw none for. */
const senderOf = (request: Request): string => request.headers.get("CF-Connecting-IP") ?? "unknown"

/**
 * A sending, held to what one address may send: counted before its body is
 * read, the body read no further than one may be long, and a large one
 * counted again against the few an address may send — a book's first
 * commits are large, and nothing after them is.
 */
const sending = async (request: Request, ports: Ports, line: string, token: string): Promise<Answer<AppendedDto>> => {
  const sender = senderOf(request)
  if (!(await ports.limits("write", sender))) return refused({ type: "too-many" })
  const sent = await sentBy(request)
  if (sent === undefined) return refused({ type: "too-large" })
  if (sent.bytes > RELAY_LIMITS.smallBodyBytes && !(await ports.limits("bulk", sender))) return refused({ type: "too-many" })
  return append(ports, line, token, sent.body)
}

/** Seeing to a line's grants, held to what one address may ask: a look counted as a reading, a change as a sending. */
const granting = async (request: Request, ports: Ports, route: Exclude<Route, { of: "entries" }>, token: string): Promise<Answer<GrantsDto>> => {
  const sender = senderOf(request)
  if (route.of === "grants" && request.method === "GET") return (await ports.limits("read", sender)) ? grantsOf(ports, route.line, token) : refused({ type: "too-many" })
  if (!(await ports.limits("write", sender))) return refused({ type: "too-many" })
  if (route.of === "grant" && request.method === "DELETE") return revoke(ports, route.line, token, route.id)
  if (route.of !== "grants" || request.method !== "POST") return refused({ type: "not-found" })
  const sent = await sentBy(request)
  return sent === undefined ? refused({ type: "too-large" }) : grant(ports, route.line, token, sent.body)
}

const answer = async (request: Request, ports: Ports): Promise<Answer<unknown>> => {
  const url = new URL(request.url)
  const route = routeOf(url.pathname)
  if (route === undefined || !["GET", "POST", "DELETE"].includes(request.method)) return refused({ type: "not-found" })
  const token = tokenOf(request)
  if (token === undefined) return refused({ type: "unauthorized" })
  if (route.of !== "entries") return granting(request, ports, route, token)
  if (request.method === "POST") return sending(request, ports, route.line, token)
  if (request.method !== "GET") return refused({ type: "not-found" })
  if (!(await ports.limits("read", senderOf(request)))) return refused({ type: "too-many" })
  const after = Number(url.searchParams.get("after") ?? "0")
  return Number.isInteger(after) && after >= 0 ? entriesAfter(ports, route.line, token, after) : refused({ type: "invalid", field: "after" })
}

/**
 * The relay: `GET /lines/:line/entries?after=n` reads a line from a place in
 * it, `POST /lines/:line/entries` adds to its end. A line's owner lets others
 * into it: `GET` and `POST /lines/:line/grants` list and make its grants,
 * `DELETE /lines/:line/grants/:id` takes one away. Nothing else, and nothing
 * it keeps can it read. Each is held to what one address may ask in a while.
 * A line is kept while it is used, and let go once it has been left idle.
 */
export const handle = async (request: Request, ports: Ports): Promise<Response> => {
  const origin = readableFrom(ports.origins, request)
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (ports.origins.type === "only" && origin === undefined) return responseOf(refused({ type: "forbidden-origin" }), origin)
  try {
    return responseOf(await answer(request, ports), origin)
  } catch (cause) {
    return responseOf(storage(cause), origin)
  }
}
