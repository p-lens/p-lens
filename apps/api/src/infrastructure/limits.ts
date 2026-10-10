/**
 * How often one address may write: every write counts against `write`, and
 * registering something new against `create` too. Whether this one may go
 * ahead.
 */
export type Limits = (bucket: "write" | "create", key: string) => Promise<boolean>

/** A Workers rate-limiting binding: so many requests a key in its period. */
export interface RateLimiter {
  limit(options: { readonly key: string }): Promise<{ readonly success: boolean }>
}

/** Limits kept by the deployment's rate-limiting bindings; a bucket with none bound is not limited, as when developing locally. */
export const limitsThrough =
  (bound: { readonly write: RateLimiter | undefined; readonly create: RateLimiter | undefined }): Limits =>
  async (bucket, key) => {
    const limiter = bound[bucket]
    return limiter === undefined ? true : (await limiter.limit({ key })).success
  }
