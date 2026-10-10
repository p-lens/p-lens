/**
 * How much one address may ask of the relay in a while: every reading
 * counts against `read`, every sending against `write`, and a sending with
 * a large body against `bulk` too. Whether this one may go ahead.
 */
export type Limits = (bucket: "read" | "write" | "bulk", key: string) => Promise<boolean>

/** A Workers rate-limiting binding: so many requests a key in its period. */
export interface RateLimiter {
  limit(options: { readonly key: string }): Promise<{ readonly success: boolean }>
}

/** Limits kept by the deployment's rate-limiting bindings; a bucket with none bound is not limited, as when developing locally. */
export const limitsThrough =
  (bound: { readonly read: RateLimiter | undefined; readonly write: RateLimiter | undefined; readonly bulk: RateLimiter | undefined }): Limits =>
  async (bucket, key) => {
    const limiter = bound[bucket]
    return limiter === undefined ? true : (await limiter.limit({ key })).success
  }
