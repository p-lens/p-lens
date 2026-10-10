import { Err, Ok, type Result } from "../../core/result/result"
import type { StoreFailure } from "../port/backup-store"

/** What Google answers a request for a token with. */
interface TokenResponse {
  readonly access_token?: string
  readonly expires_in?: number | string
  readonly error?: string
}

/** How Google's sign-in window went wrong before it could answer. */
interface TokenClientError {
  readonly type?: string
}

interface TokenClient {
  readonly requestAccessToken: () => void
}

/** The part of Google Identity Services this uses, as its script leaves it on the page. */
interface GoogleIdentity {
  readonly accounts: {
    readonly oauth2: {
      readonly initTokenClient: (config: {
        readonly client_id: string
        readonly scope: string
        readonly callback: (response: TokenResponse) => void
        readonly error_callback: (error: TokenClientError) => void
      }) => TokenClient
    }
  }
}

/** Where Google publishes Google Identity Services; it is not to be bundled or served from elsewhere. */
const IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client"

/** How long before a token runs out it is no longer handed over, in milliseconds. */
const SPARE = 60_000

/** A token, and the moment it is no longer to be used from. */
interface Held {
  readonly token: string
  readonly until: number
}

/**
 * The way to a token for the person's Google account: handed over while one
 * is held, asked of them otherwise.
 */
export interface GoogleAuthorizer {
  /**
   * A token, asked of the person where none is held. Google's window is
   * opened in the very call where its script is already on the page, so a
   * call made straight from a press opens it while the press still counts
   * as one — a phone's browser opens no window for anything later.
   */
  readonly token: () => Promise<Result<string, StoreFailure>>
  /** Bring Google's script to the page ahead of a press, so the press itself can open the window. Nothing is asked of Google about the person. */
  readonly warm: () => void
  /** Let go of the token held: Google no longer takes it. */
  readonly forget: () => void
}

export interface GoogleAuthorizerConfig {
  /** The OAuth client id of the deployment, made in Google Cloud for the app's own origin. */
  readonly clientId: string
  readonly scope: string
}

const identityOnPage = (): GoogleIdentity | undefined => (globalThis as { readonly google?: GoogleIdentity }).google

const loadIdentity = (): Promise<Result<GoogleIdentity, StoreFailure>> =>
  new Promise((settle) => {
    const script = document.createElement("script")
    script.src = IDENTITY_SCRIPT
    script.async = true
    script.onload = () => {
      const identity = identityOnPage()
      settle(identity === undefined ? Err({ type: "sign-in-unavailable", detail: "Google Identity Services did not start" }) : Ok(identity))
    }
    script.onerror = () => {
      script.remove()
      settle(Err({ type: "sign-in-unavailable", detail: "Google Identity Services could not be loaded" }))
    }
    document.head.append(script)
  })

const heldFrom = (response: TokenResponse, now: number): Result<Held, StoreFailure> => {
  const lasts = Number(response.expires_in)
  if (response.access_token === undefined || response.access_token === "") return Err({ type: "sign-in-declined", reason: response.error ?? "no token" })
  return Ok({ token: response.access_token, until: now + (Number.isFinite(lasts) ? lasts * 1000 : 0) - SPARE })
}

const failureOf = (error: TokenClientError): StoreFailure =>
  error.type === "popup_failed_to_open" ? { type: "sign-in-blocked" } : { type: "sign-in-declined", reason: error.type ?? "unknown" }

/** How long Google's window is waited on, in milliseconds. A window a phone would not open, or one left open and forgotten, sometimes brings no answer at all; without an end to the wait the press that asked would never be over. */
const ANSWER_WITHIN = 120_000

const asked = (identity: GoogleIdentity, config: GoogleAuthorizerConfig): Promise<Result<Held, StoreFailure>> =>
  new Promise((settle) => {
    const waiting = setTimeout(() => settle(Err({ type: "sign-in-declined", reason: "no answer" })), ANSWER_WITHIN)
    const answer = (result: Result<Held, StoreFailure>): void => {
      clearTimeout(waiting)
      settle(result)
    }
    identity.accounts.oauth2
      .initTokenClient({
        client_id: config.clientId,
        scope: config.scope,
        callback: (response) => answer(heldFrom(response, Date.now())),
        error_callback: (error) => answer(Err(failureOf(error))),
      })
      .requestAccessToken()
  })

/**
 * Sign-in by Google Identity Services' token model, the way Google gives a
 * page with no server of its own: a window Google opens, answered with a
 * token for an hour and no way to renew it unasked. So a token is only ever
 * got because a person pressed something, which is the only time a backup
 * is made. Google's script is loaded when the backup screen asks for it, or
 * the first time a token is, never when the app starts, and the token is
 * held in memory and nowhere else.
 */
export const createGoogleAuthorizer = (config: GoogleAuthorizerConfig): GoogleAuthorizer => {
  const kept: { identity: Promise<Result<GoogleIdentity, StoreFailure>> | undefined; held: Held | undefined } = { identity: undefined, held: undefined }
  const forgetIfFailed = (loaded: Result<GoogleIdentity, StoreFailure>): Result<GoogleIdentity, StoreFailure> => {
    if (!loaded.ok) kept.identity = undefined
    return loaded
  }
  const identity = (): Promise<Result<GoogleIdentity, StoreFailure>> => {
    const found = identityOnPage()
    const loading = kept.identity ?? (found === undefined ? loadIdentity().then(forgetIfFailed) : Promise.resolve(Ok(found)))
    kept.identity = loading
    return loading
  }
  const keep = (got: Result<Held, StoreFailure>): Result<string, StoreFailure> => {
    if (!got.ok) return got
    kept.held = got.value
    return Ok(got.value.token)
  }
  return {
    token: () => {
      if (kept.held !== undefined && Date.now() < kept.held.until) return Promise.resolve(Ok(kept.held.token))
      const found = identityOnPage()
      const got = found === undefined ? identity().then((ready) => (ready.ok ? asked(ready.value, config) : ready)) : asked(found, config)
      return got.then(keep)
    },
    warm: () => {
      void identity()
    },
    forget: () => {
      kept.held = undefined
    },
  }
}
