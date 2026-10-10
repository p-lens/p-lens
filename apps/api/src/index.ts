import { analyze, initSync, normalize } from "@p-lens/pachinko-engine/pachinko.js"
import wasm from "@p-lens/pachinko-engine/pachinko_bg.wasm"
import { analyze as analyzePachislot, initSync as initPachislotSync, normalize as normalizePachislot } from "@p-lens/pachislot-engine/pachislot.js"
import pachislotWasm from "@p-lens/pachislot-engine/pachislot_bg.wasm"

import { handle } from "./app"
import { STANDARD_QUOTAS } from "./domain/quota"
import { byDevice } from "./infrastructure/auth"
import { runtimeEffects } from "./infrastructure/effects"
import { type HumanCheck, NO_HUMAN_CHECK, turnstileThrough } from "./infrastructure/human-check"
import { limitsThrough, type RateLimiter } from "./infrastructure/limits"
import { type OriginPolicy, originPolicyOf } from "./infrastructure/origins"
import * as PachinkoEngine from "./infrastructure/pachinko/engine"
import * as PachislotEngine from "./infrastructure/pachislot/engine"

interface Env {
  readonly DB: D1Database
  /** The pages the app is served from, comma-separated, e.g. `https://app.example.com`; only they may write. None set takes any, for local development. */
  readonly ALLOWED_ORIGINS?: string
  /** The prefix the API is served under on the app's own origin, e.g. `/api`; unset when it has a host of its own. */
  readonly API_BASE_PATH?: string
  /** The administrator's token, a secret (`wrangler secret put ADMIN_TOKEN`); unset, there is no administrator. */
  readonly ADMIN_TOKEN?: string
  /** Turnstile's secret key, a secret (`wrangler secret put TURNSTILE_SECRET`); unset, registering is not checked. */
  readonly TURNSTILE_SECRET?: string
  /** Rate-limiting bindings: every write by address, and registering something new by address. Unbound, not limited. */
  readonly WRITE_LIMIT?: RateLimiter
  readonly CREATE_LIMIT?: RateLimiter
}

const started: { pachinkoEngine: PachinkoEngine.Engine | undefined; pachislotEngine: PachislotEngine.Engine | undefined } = { pachinkoEngine: undefined, pachislotEngine: undefined }

/** The pachinko engine, instantiated on the first simulated formula published rather than for every request. */
const pachinkoEngine = (): PachinkoEngine.Engine => {
  const existing = started.pachinkoEngine
  if (existing !== undefined) return existing
  initSync({ module: wasm })
  const made = PachinkoEngine.engineThrough(normalize, analyze)
  started.pachinkoEngine = made
  return made
}

/** The pachislot engine, instantiated on the first pachislot formula published. */
const pachislotEngine = (): PachislotEngine.Engine => {
  const existing = started.pachislotEngine
  if (existing !== undefined) return existing
  initPachislotSync({ module: pachislotWasm })
  const made = PachislotEngine.engineThrough(normalizePachislot, analyzePachislot)
  started.pachislotEngine = made
  return made
}

/** The hosts of the app's pages, the only ones a Turnstile token may have been given on; any, where any page may ask. */
const hostsOf = (policy: OriginPolicy): readonly string[] => (policy.type === "any" ? [] : policy.origins.map((origin) => new URL(origin).hostname))

const humanCheckOf = (secret: string | undefined, policy: OriginPolicy): HumanCheck =>
  secret === undefined || secret === "" ? NO_HUMAN_CHECK : turnstileThrough(secret, hostsOf(policy), (url, init) => fetch(url, init))

export default {
  fetch: (request: Request, env: Env): Promise<Response> =>
    handle(request, {
      database: env.DB,
      effects: runtimeEffects,
      pachinkoEngine,
      pachislotEngine,
      authenticate: byDevice,
      origins: originPolicyOf(env.ALLOWED_ORIGINS),
      adminToken: env.ADMIN_TOKEN,
      limits: limitsThrough({ write: env.WRITE_LIMIT, create: env.CREATE_LIMIT }),
      humanCheck: humanCheckOf(env.TURNSTILE_SECRET, originPolicyOf(env.ALLOWED_ORIGINS)),
      quotas: STANDARD_QUOTAS,
      basePath: (env.API_BASE_PATH ?? "").replace(/\/+$/, ""),
    }),
} satisfies ExportedHandler<Env>
