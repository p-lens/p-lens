import { limitsThrough, type RateLimiter } from "./limits"
import { placedIn, type Placing } from "./placing"
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

/** The databases lines are kept in, by binding: one, holding every bucket. A bucket moved to another names its binding in `moved`. */
type Bound = "DB"

const PLACING: Placing<Bound> = { home: "DB", moved: {} }

const databasesOf = (env: Env) => placedIn<Bound>({ DB: env.DB }, PLACING)

export default {
  fetch: (request: Request, env: Env): Promise<Response> =>
    handle(request, {
      databases: databasesOf(env),
      origins: originsOf(env.ALLOWED_ORIGINS),
      limits: limitsThrough({ read: env.READ_LIMIT, write: env.WRITE_LIMIT, bulk: env.BULK_LIMIT }),
      now: () => new Date().toISOString(),
    }),
  /** Run by the deployment's cron trigger: lines left idle are let go, in every database. */
  scheduled: (_event: unknown, env: Env): Promise<unknown> => letGoOfIdleLines({ databases: databasesOf(env), now: () => new Date().toISOString() }),
}
