/**
 * The whole catalog as already written out, by the version it was read at, so
 * that a delivery of a version already delivered reads nothing from the
 * database. A cache that fails is only a cache that misses.
 */
export interface CatalogCache {
  readonly read: (version: string) => Promise<string | undefined>
  readonly keep: (version: string, written: string) => Promise<void>
}

/** How long a written catalog is kept: what bounds how old its uses can be, since a use never moves the version. */
const KEPT_FOR_SECONDS = 86_400

/** Cloudflare's cache at the edge the request came to, under a key on the API's own origin that no route answers. */
export const edgeCatalogCache = (cache: Cache, origin: string): CatalogCache => {
  const keyOf = (version: string): Request => new Request(`${origin}/catalog-delivered/${version}`)
  return {
    read: async (version) => {
      try {
        return await (await cache.match(keyOf(version)))?.text()
      } catch {
        return undefined
      }
    },
    keep: async (version, written) => {
      try {
        await cache.put(keyOf(version), new Response(written, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${KEPT_FOR_SECONDS}` } }))
      } catch {
        return
      }
    },
  }
}
