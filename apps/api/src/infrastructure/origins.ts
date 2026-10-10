/**
 * Which web pages may write to this catalog. A deployment names the pages it
 * serves the app from; one that names none — a local one, being developed —
 * takes any.
 */
export type OriginPolicy = { readonly type: "any" } | { readonly type: "only"; readonly origins: readonly string[] }

/** The policy a comma-separated list of origins sets: none listed is any. */
export const originPolicyOf = (listed: string | undefined): OriginPolicy => {
  const origins = (listed ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin !== "")
  return origins.length === 0 ? { type: "any" } : { type: "only", origins }
}

/**
 * The origin a response lets a browser read it from: any, under the policy
 * that takes any; else the page asking, if it is one named; else none, and a
 * browser on another page cannot read the answer.
 */
export const readableFrom = (policy: OriginPolicy, request: Request): string | undefined => {
  if (policy.type === "any") return "*"
  const origin = request.headers.get("Origin") ?? undefined
  return origin !== undefined && policy.origins.includes(origin) ? origin : undefined
}

/**
 * Whether a request comes from a page the app is served from. A browser
 * names the page in `Origin` whenever it asks across origins, and says
 * `Sec-Fetch-Site: same-origin` when the API is served under the app's own
 * origin, where a read need not name it; neither can a page make it say
 * otherwise. Under a named list, a request saying neither is refused, read
 * or write.
 */
export const fromOurPages = (policy: OriginPolicy, request: Request): boolean => {
  if (policy.type === "any") return true
  const origin = request.headers.get("Origin") ?? undefined
  if (origin !== undefined) return policy.origins.includes(origin)
  return request.headers.get("Sec-Fetch-Site") === "same-origin" && policy.origins.includes(new URL(request.url).origin)
}

/**
 * The path a route is matched on: the request's, less the prefix the API is
 * served under when it shares the app's origin (`/api`), or not found.
 */
export const routedPath = (pathname: string, basePath: string): string | undefined => {
  if (basePath === "") return pathname
  if (pathname === basePath) return "/"
  return pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : undefined
}
