/** Whether whoever registers something is a person on the app's own page, by the token the page's check gave them. */
export type HumanCheck = (token: string | undefined, address: string | undefined) => Promise<boolean>

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

/** Turnstile's answer, as much of it as is read. */
interface Verdict {
  readonly success?: boolean
  readonly hostname?: string
}

/**
 * Cloudflare Turnstile: the token is asked about once, and holds only if it
 * was given on one of the app's own hosts. A token is good for one use, a
 * few minutes; a page cannot be given one elsewhere and send it here.
 */
export const turnstileThrough =
  (secret: string, hosts: readonly string[], request: (url: string, init: RequestInit) => Promise<Response>): HumanCheck =>
  async (token, address) => {
    if (token === undefined || token === "") return false
    const form = new FormData()
    form.append("secret", secret)
    form.append("response", token)
    if (address !== undefined) form.append("remoteip", address)
    try {
      const verdict = (await (await request(SITEVERIFY, { method: "POST", body: form })).json()) as Verdict
      return verdict.success === true && (hosts.length === 0 || (verdict.hostname !== undefined && hosts.includes(verdict.hostname)))
    } catch {
      return false
    }
  }

/** No check, for a deployment with no Turnstile secret: a local one, being developed. */
export const NO_HUMAN_CHECK: HumanCheck = async () => true
