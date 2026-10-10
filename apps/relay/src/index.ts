import { limitsThrough, type RateLimiter } from "./limits"
import { handle, letGoOfIdleLines, originsOf } from "./relay"

interface Env {
  readonly DB: D1Database
  /** The pages this relay serves, comma-separated; none named, any page may ask. */
  readonly ALLOWED_ORIGINS?: string
  /** How often one address may read, send, and send a large body, per minute; set in wrangler.production.jsonc. */
  readonly READ_LIMIT?: RateLimiter
  readonly WRITE_LIMIT?: RateLimiter
  readonly BULK_LIMIT?: RateLimiter
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> =>
    handle(request, {
      database: env.DB,
      origins: originsOf(env.ALLOWED_ORIGINS),
      limits: limitsThrough({ read: env.READ_LIMIT, write: env.WRITE_LIMIT, bulk: env.BULK_LIMIT }),
      now: () => new Date().toISOString(),
    }),
  /** Run by the deployment's cron trigger: lines left idle are let go. */
  scheduled: (_event: unknown, env: Env): Promise<unknown> => letGoOfIdleLines({ database: env.DB, now: () => new Date().toISOString() }),
}
