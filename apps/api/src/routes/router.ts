import type { ApiError } from "../domain/errors"
import { Err, Ok, type Result } from "../domain/result"

export type Method = "GET" | "POST" | "PUT" | "DELETE"

/** A route: a method and a path of literal segments and `:named` ones. */
export interface Route<H> {
  readonly method: Method
  readonly path: string
  readonly handler: H
}

export interface Matched<H> {
  readonly handler: H
  readonly params: Readonly<Record<string, string>>
}

const segmentsOf = (path: string): readonly string[] => path.split("/").filter((segment) => segment !== "")

/** The named segments of a path, if it fits the pattern at all. */
const paramsOf = (pattern: readonly string[], segments: readonly string[]): Readonly<Record<string, string>> | undefined => {
  if (pattern.length !== segments.length) return undefined
  const pairs = pattern.map((part, index) => [part, segments[index] ?? ""] as const)
  if (pairs.some(([part, segment]) => !part.startsWith(":") && part !== segment)) return undefined
  return Object.fromEntries(pairs.filter(([part]) => part.startsWith(":")).map(([part, segment]) => [part.slice(1), decodeURIComponent(segment)]))
}

/**
 * The route a request is for. A path some route has under another method is
 * `method-not-allowed`; a path no route has is not found.
 */
export const match = <H>(routes: readonly Route<H>[], method: string, path: string): Result<Matched<H>, ApiError> => {
  const segments = segmentsOf(path)
  const fitting = routes.flatMap((route) => {
    const params = paramsOf(segmentsOf(route.path), segments)
    return params === undefined ? [] : [{ route, params }]
  })
  const chosen = fitting.find(({ route }) => route.method === method)
  if (chosen !== undefined) return Ok({ handler: chosen.route.handler, params: chosen.params })
  return fitting.length > 0 ? Err({ type: "method-not-allowed" }) : Err({ type: "not-found", what: "route" })
}
