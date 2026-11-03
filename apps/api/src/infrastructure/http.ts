import type { ApiErrorDto } from "@p-lens/contracts"

import { type ApiError, statusOf } from "../domain/errors"
import type { Reply } from "../routes/handlers"

/** What lets a browser on the page `origin` read the answer; none but `Vary` when no page may. */
const corsHeaders = (origin: string | undefined): HeadersInit =>
  origin === undefined
    ? { Vary: "Origin" }
    : {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-P-Lens-Device, X-Turnstile-Token",
        Vary: "Origin",
      }

/** What a reply sends, written out; nothing for one with no body. */
const writtenOf = (reply: Reply): string | undefined => {
  if ("written" in reply) return reply.written
  return reply.body === undefined ? undefined : JSON.stringify(reply.body)
}

export const replyResponse = (reply: Reply, origin: string | undefined): Response => {
  const written = writtenOf(reply)
  return new Response(written ?? null, {
    status: reply.status,
    headers: { ...corsHeaders(origin), ...(written === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }) },
  })
}

export const errorResponse = (error: ApiError, origin: string | undefined): Response =>
  new Response(JSON.stringify({ error } satisfies ApiErrorDto), {
    status: statusOf(error),
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  })

export const preflightResponse = (origin: string | undefined): Response => new Response(null, { status: 204, headers: corsHeaders(origin) })
